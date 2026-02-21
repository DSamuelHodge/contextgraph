# FAQ

## Setup & Registration

**Q: How do I register an agent?**

Set `agent.id` in `contextgraph.config.ts` and deploy. No separate registration step exists. The agent ID in config is the registration.

---

**Q: Can I have multiple agents?**

Yes. Each agent gets a unique `id`. They share the same Worker and Neon DB but operate on separate branches:

```
agent/{workspace}/{task}
```

---

**Q: How do I add a new endpoint after initial deploy?**

Add to the `oracles` array in `contextgraph.config.ts`, re-deploy, then call `syncSchema` once to run initial introspection. ContextGraph discovers the schema automatically.

```bash
curl -X POST https://your-worker.workers.dev/graphql \
  -H "Content-Type: application/json" \
  -H "x-agent-id: my-agent-01" \
  -d '{"query": "mutation { syncSchema(endpointId: \"my-new-api\") { driftStatus } }"}'
```

---

**Q: How do I integrate a pre-existing GraphQL schema?**

Treat your existing API as an oracle — no rewrite required. Add it to `oracles`, deploy, then run `syncSchema` once.

```typescript
oracles: [
  { name: 'my-api', uri: 'https://your-app.com/api/graphql' }
]
```

ContextGraph introspects the live schema and keeps agent memory aligned as the schema evolves.

---

## Schema & Endpoints

**Q: Do I need to document my schema for the agent?**

No. The agent introspects it live via `{ __schema { ... } }`. Adding a table or field to your data layer is sufficient — the next sync picks it up automatically.

---

**Q: What goes in AGENTS.md?**

Behavioral constraints, not schema docs. Examples:

- Which collections are read-only for this agent
- Mutation approval requirements
- Domain-specific rules (pricing floors, rate limits, etc.)

ContextGraph handles schema discovery. `AGENTS.md` handles intent.

---

**Q: How do I know if my endpoint is connected correctly?**

```bash
GET https://your-worker.workers.dev/health
```

Look for your endpoint name with `driftStatus: SYNCHRONIZED`.

---

**Q: The agent isn't seeing my latest schema changes.**

Call `syncSchema` manually or wait for the next maintenance cron (runs daily at 2AM UTC by default).

For an immediate sync without waiting:

```bash
curl -X POST https://your-worker.workers.dev/webhooks/schema-change
```

---

## Sessions & the SDK

**Q: What is `session.index`?**

A compact, <200-token representation of the agent's current knowledge state — skills it has acquired, branches it owns, recent commits. This is what you inject into the agent's system prompt to give it memory across invocations.

---

**Q: What does `ctx.resume()` do if no session exists?**

It creates a fresh session on the `defaultBranch` you configured. Subsequent calls to `resume()` with the same `agentId` restore the existing session.

---

**Q: When does `BreakingDriftError` fire?**

When the agent's cached schema view diverges from what the live endpoint actually exposes (e.g., a field was renamed or removed). The error surfaces before the agent acts, not after a failed mutation.

---

**Q: How do I handle `BreakingDriftError` in my agent loop?**

```typescript
import { BreakingDriftError } from '@contextgraph/core'

try {
  await ctx.commit({ ... })
} catch (err) {
  if (err instanceof BreakingDriftError) {
    // Re-sync and let the agent re-plan before retrying
    await ctx.gql(`mutation { syncSchema(endpointId: "my-api") { driftStatus } }`)
    // signal human-review or retry
  }
}
```

---

## Deployment & CI

**Q: What GitHub secrets do I need?**

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Target account |
| `NEON_API_KEY` | Manage Neon projects |
| `DATABASE_URL` | Run `drizzle-kit migrate` in CI |
| `CLICKHOUSE_HOST` | ClickHouse Cloud endpoint |
| `CLICKHOUSE_USER` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |

---

**Q: How do I enable ClickHouse telemetry?**

Set telemetry mode to `clickhouse` (or `both`) and configure `CLICKHOUSE_HOST`, `CLICKHOUSE_USER`, and `CLICKHOUSE_PASSWORD` in worker env/secrets. Then apply [docs/clickhouse/schema.sql](clickhouse/schema.sql) to your ClickHouse database.

---

**Q: Why do I see an OTel no-provider warning at startup?**

ContextGraph uses `@opentelemetry/api` only. If no OpenTelemetry SDK/provider is registered before worker initialization, spans are no-op by design and a warning is logged. Register a provider (or use `cloudflare` / `clickhouse` telemetry mode) to emit real traces.

---

**Q: I see `drizzle.config.json file does not exist` in CI.**

Make sure `drizzle.config.ts` is committed at the repo root and `DATABASE_URL` is set as a GitHub secret. See the [root drizzle.config.ts](../drizzle.config.ts).

---

**Q: Can I use a different database provider?**

The worker runtime requires a connection that works inside Cloudflare Workers. Neon (`@neondatabase/serverless`) and Hyperdrive are the tested paths. Other Postgres-over-HTTP providers may work but are untested.

---

*Still stuck? Open a [GitHub Discussion](https://github.com/DSamuelHodge/contextgraph/discussions) rather than an Issue — setup questions answered there benefit everyone.*

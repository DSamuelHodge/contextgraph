# Quickstart: Your First Agent Session

## Prerequisites

Deployment complete (`npx contextgraph deploy` returned a Worker URL).

---

## Step 1: Register an Agent

Add to `contextgraph.config.ts`:

```typescript
agent: {
  id: 'my-agent-01',       // unique per agent, stable across sessions
  defaultBranch: 'main'
}
```

Re-deploy:

```bash
npx contextgraph deploy
```

That's it. No dashboard, no API key — the agent ID in the config is the registration.

---

## Step 2: Register an Oracle Endpoint

```typescript
oracles: [
  { name: 'my-api', uri: 'https://your-app.com/api/graphql' }
]
```

Re-deploy, then run the initial sync:

```bash
curl -X POST https://your-worker.workers.dev/graphql \
  -H "Content-Type: application/json" \
  -H "x-agent-id: my-agent-01" \
  -d '{"query": "mutation { syncSchema(endpointId: \"my-api\") { driftStatus } }"}'
```

---

## Step 3: Start a Session

```typescript
import { ContextGraphClient } from '@contextgraph/core'

const ctx = new ContextGraphClient({
  workerUrl: 'https://your-worker.workers.dev',
  agentId: 'my-agent-01'
})

const session = await ctx.resume()
console.log(session.index)  // the <200 token push context
```

---

## Step 4: Query Your Data

```typescript
const data = await ctx.gql(`
  { __schema { types { name kind } } }
`)
// Agent now knows your entire data layer
```

---

## What Happens Next

Once a session is open, ContextGraph continuously:

- **Detects drift** — if your schema diverges from what the agent expects, a `BreakingDriftError` is raised before the agent acts on stale assumptions.
- **Decays stale skills** — proficiency scores decay automatically; the agent is prompted to re-verify knowledge it hasn't used recently.
- **Resolves collisions** — concurrent writes from multiple agents are merged deterministically; no silent data corruption.

See [ENGINE.md](ENGINE.md) for the full behavior reference and [FAQ.md](FAQ.md) for common setup questions.

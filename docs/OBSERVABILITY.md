# Observability

ContextGraph uses OpenTelemetry for tracing and an optional metrics interface for Cloudflare Analytics Engine.

## Tracing

Provide your own OpenTelemetry provider and exporter. ContextGraph calls spans via `@opentelemetry/api` and does not bundle a provider.

Spans emitted:
- contextgraph.drift.detect
- contextgraph.collision.resolve
- contextgraph.decay.scan
- contextgraph.convergence.promote
- contextgraph.session.resume
- contextgraph.commit.knowledge

## Metrics

Implement the `ContextGraphMetrics` interface in packages/core/src/telemetry and wire it into the Telemetry class.

## Workers

Use a Cloudflare-compatible exporter (Honeycomb, Datadog, or OTLP over HTTP). The Worker dashboard is served at `/dashboard`.

### Dashboard setup (`/dashboard`)

The dashboard route queries Cloudflare Analytics Engine SQL directly and requires two Worker env vars:

- `CF_ACCOUNT_ID` — your Cloudflare account ID
- `CF_API_TOKEN` — API token with access to Analytics Engine SQL for that account

Add them as Worker secrets/vars before calling `/dashboard`:

```bash
wrangler secret put CF_API_TOKEN
wrangler secret put CF_ACCOUNT_ID
```

Also ensure your Worker has an Analytics Engine dataset binding named `ANALYTICS` (dataset: `contextgraph_events`) in `wrangler.jsonc`.

If either env var is missing, `/dashboard` returns a 500 with a setup error message.

## ClickHouse Setup (Cloud tier)

1. Create a ClickHouse Cloud instance.
2. Apply [docs/clickhouse/schema.sql](clickhouse/schema.sql).
3. Set Worker vars/secrets:

```bash
wrangler secret put CLICKHOUSE_HOST
wrangler secret put CLICKHOUSE_USER
wrangler secret put CLICKHOUSE_PASSWORD
```

4. Set telemetry mode to ClickHouse (`TELEMETRY_BACKEND=clickhouse`) or fan-out mode (`TELEMETRY_BACKEND=both`).

## OTel Setup (Enterprise / BYO)

ContextGraph uses `@opentelemetry/api` only. You must register an OpenTelemetry SDK provider before ContextGraph initializes.

- With provider: spans are emitted and can be exported by your collector.
- Without provider: spans are no-op. ContextGraph logs a startup warning so this is explicit.

## ROI Queries

The commercial dashboard should query the materialized view `contextgraph_roi_daily`.

```sql
SELECT
	workspace_id,
	sum(incidents_prevented)  AS incidents_prevented,
	sum(decisions_corrected)  AS decisions_corrected,
	sum(knowledge_compounded) AS knowledge_compounded,
	sum(human_interventions)  AS human_interventions,
	avg(avg_token_count)      AS avg_context_efficiency,
	sum(total_events)         AS total_events
FROM contextgraph_roi_daily
WHERE day >= today() - 90
GROUP BY workspace_id
ORDER BY incidents_prevented DESC;
```

Additional recommended queries:

1. Daily incident prevention trend per workspace.
2. Human intervention rate by event type.
3. Collision class distribution over 30/90 days.
4. Context efficiency drift (`avg_token_count` trend).
5. Top workspaces by compounded knowledge events.

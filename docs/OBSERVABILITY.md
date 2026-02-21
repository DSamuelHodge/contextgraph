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

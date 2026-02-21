import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api'
import type { TelemetryBackend, TelemetryEvent } from '@core/telemetry'

export class OtelBridge implements TelemetryBackend {
  constructor(private tracer: Tracer = trace.getTracer('contextgraph', '0.1.0')) {}

  record(event: TelemetryEvent): void {
    try {
      const span = this.tracer.startSpan(`contextgraph.${event.eventType}`)
      span.setAttributes({
        'contextgraph.agent_id': event.agentId,
        'contextgraph.branch': event.branchName,
        'contextgraph.event_type': event.eventType,
        'contextgraph.endpoint_id': event.endpointId ?? '',
        'contextgraph.severity': event.severity ?? '',
        'contextgraph.collision_class': event.collisionClass ?? '',
        'contextgraph.human_required': event.humanRequired ?? false,
        'contextgraph.decay_score': event.decayScore ?? 0,
        'contextgraph.token_count': event.tokenCount ?? 0,
        'contextgraph.duration_ms': event.durationMs ?? 0
      })
      if (event.humanRequired) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'human intervention required' })
      }
      span.end()
    } catch {
      console.error('[otel] span failed', event.eventType)
    }
  }
}

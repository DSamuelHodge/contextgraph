import { trace, SpanStatusCode } from '@opentelemetry/api'
import type { DriftSeverity } from '@core/types'
import type { EngineEventType } from '../engine/events'

export interface TelemetryBackend {
  record(event: TelemetryEvent): void
  flush?(): Promise<void>
}

export interface TelemetryEvent {
  eventType: EngineEventType
  agentId: string
  branchName: string
  endpointId?: string
  severity?: DriftSeverity
  collisionClass?: string
  humanRequired?: boolean
  decayScore?: number
  tokenCount?: number
  durationMs?: number
  traceId?: string
  spanId?: string
  parentSpanId?: string
}

export class NoopBackend implements TelemetryBackend {
  record() {}
}

export class CompositeBackend implements TelemetryBackend {
  constructor(private backends: TelemetryBackend[]) {}

  record(event: TelemetryEvent): void {
    for (const backend of this.backends) {
      try {
        backend.record(event)
      } catch {
        // ignore telemetry backend errors
      }
    }
  }

  async flush(): Promise<void> {
    const flushers = this.backends
      .map((backend) => backend.flush)
      .filter((flush): flush is () => Promise<void> => typeof flush === 'function')
      .map(async (flush) => {
        try {
          await flush()
        } catch {
          // ignore telemetry backend errors
        }
      })
    await Promise.all(flushers)
  }
}

export type AttributeValue = string | number | boolean
export type SpanAttributes = Record<string, AttributeValue>

export interface Counter {
  add(value: number, attributes?: SpanAttributes): void
}

export interface Histogram {
  record(value: number, attributes?: SpanAttributes): void
}

export interface ContextGraphMetrics {
  drift_events_total: Counter
  collision_resolutions_total: Counter
  human_required_events_total: Counter
  decay_tombstones_total: Counter
  convergence_promotions_total: Counter
  context_index_tokens: Histogram
  session_duration_ms: Histogram
}

export type DriftDetectAttributes = {
  endpointId: string
  severity: string
  affectedOperationCount: number
}

export type CollisionResolveAttributes = {
  collisionClass: string
  resolutionStrategy: string
  required_human: boolean
}

export type DecayScanAttributes = {
  branchName: string
  nodesScanned: number
  nodesTombstoned: number
}

export type ConvergencePromoteAttributes = {
  topic: string
  contributingAgents: string
  convergenceScore: number
}

export type SessionResumeAttributes = {
  agentId: string
  branch: string
  indexTokenCount: number
  driftStatus: string
}

export type CommitKnowledgeAttributes = {
  topic: string
  author: string
  evidenceRefCount: number
  newVersionHash: string
}

export class Telemetry {
  constructor(
    private metrics?: ContextGraphMetrics,
    private tracer = trace.getTracer('contextgraph')
  ) {}

  driftDetect(attributes: DriftDetectAttributes) {
    this.recordSpan('contextgraph.drift.detect', attributes)
    this.metrics?.drift_events_total.add(1, { severity: attributes.severity })
  }

  collisionResolve(attributes: CollisionResolveAttributes) {
    this.recordSpan('contextgraph.collision.resolve', attributes)
    this.metrics?.collision_resolutions_total.add(1, { collisionClass: attributes.collisionClass })
    if (attributes.required_human) {
      this.metrics?.human_required_events_total.add(1, { type: attributes.collisionClass })
    }
  }

  decayScan(attributes: DecayScanAttributes) {
    this.recordSpan('contextgraph.decay.scan', attributes)
    if (attributes.nodesTombstoned > 0) {
      this.metrics?.decay_tombstones_total.add(attributes.nodesTombstoned)
    }
  }

  convergencePromote(attributes: ConvergencePromoteAttributes) {
    this.recordSpan('contextgraph.convergence.promote', attributes)
    this.metrics?.convergence_promotions_total.add(1)
  }

  sessionResume(attributes: SessionResumeAttributes) {
    this.recordSpan('contextgraph.session.resume', attributes)
    this.metrics?.context_index_tokens.record(attributes.indexTokenCount)
  }

  commitKnowledge(attributes: CommitKnowledgeAttributes) {
    this.recordSpan('contextgraph.commit.knowledge', attributes)
  }

  private recordSpan(name: string, attributes: SpanAttributes) {
    const span = this.tracer.startSpan(name)
    span.setAttributes(attributes)
    span.setStatus({ code: SpanStatusCode.OK })
    span.end()
  }
}

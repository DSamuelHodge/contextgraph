import type { TelemetryBackend, TelemetryEvent } from '@core/telemetry'

export interface ClickHouseConfig {
  host: string
  database: string
  username: string
  password: string
  workspaceId: string
  batchSize?: number
  flushIntervalMs?: number
}

type PendingTelemetryEvent = TelemetryEvent & {
  workspaceId: string
}

export class ClickHouseBackend implements TelemetryBackend {
  private queue: PendingTelemetryEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly batchSize: number
  private readonly flushIntervalMs: number

  constructor(private config: ClickHouseConfig) {
    this.batchSize = config.batchSize ?? 50
    this.flushIntervalMs = config.flushIntervalMs ?? 5000
  }

  record(event: TelemetryEvent): void {
    this.queue.push({
      ...event,
      workspaceId: this.config.workspaceId
    })

    if (this.queue.length >= this.batchSize) {
      void this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flush()
      }, this.flushIntervalMs)
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return

    const batch = this.queue.splice(0, this.queue.length)
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    try {
      const rows = batch
        .map((event) =>
          JSON.stringify({
            timestamp: new Date(event.timestamp ?? Date.now()).toISOString(),
            event_type: event.eventType,
            severity: event.severity ?? '',
            collision_class: event.collisionClass ?? '',
            agent_role: event.agentRole ?? '',
            drift_status: event.driftStatus ?? '',
            agent_id: event.agentId,
            branch_name: event.branchName,
            endpoint_id: event.endpointId ?? '',
            workspace_id: event.workspaceId,
            trace_id: event.traceId ?? '',
            span_id: event.spanId ?? '',
            parent_span_id: event.parentSpanId ?? '',
            token_count: event.tokenCount ?? 0,
            decay_score: event.decayScore ?? 0,
            duration_ms: event.durationMs ?? 0,
            human_required: event.humanRequired ? 1 : 0,
            payload: JSON.stringify(event.payload ?? {})
          })
        )
        .join('\n')

      await fetch(
        `${this.config.host}/?query=${encodeURIComponent(`INSERT INTO ${this.config.database}.contextgraph_events FORMAT JSONEachRow`)}`,
        {
          method: 'POST',
          headers: {
            'X-ClickHouse-User': this.config.username,
            'X-ClickHouse-Key': this.config.password,
            'Content-Type': 'application/x-ndjson'
          },
          body: rows
        }
      )
    } catch (error) {
      console.error('[clickhouse] batch flush failed', {
        batchSize: batch.length,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

import type { TelemetryBackend, TelemetryEvent } from '@core/telemetry'

export class CloudflareAnalyticsBackend implements TelemetryBackend {
  constructor(private dataset: AnalyticsEngineDataset) {}

  record(event: TelemetryEvent): void {
    try {
      this.dataset.writeDataPoint({
        blobs: [
          event.agentId,
          event.branchName,
          event.endpointId ?? '',
          event.severity ?? '',
          event.collisionClass ?? ''
        ],
        doubles: [
          event.decayScore ?? 0,
          event.tokenCount ?? 0,
          event.durationMs ?? 0,
          event.humanRequired ? 1 : 0
        ],
        indexes: [event.eventType]
      })
    } catch {
      console.error('[telemetry] writeDataPoint failed', event.eventType)
    }
  }
}

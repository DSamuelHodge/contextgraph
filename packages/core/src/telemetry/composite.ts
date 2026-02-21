import type { TelemetryBackend, TelemetryEvent } from './index'

export class CompositeBackend implements TelemetryBackend {
  constructor(private backends: TelemetryBackend[]) {}

  record(event: TelemetryEvent): void {
    for (const backend of this.backends) {
      try {
        backend.record(event)
      } catch {
        // Isolated failure — continue to next backend
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.allSettled(
      this.backends
        .filter((backend) => typeof backend.flush === 'function')
        .map((backend) => backend.flush!())
    )
  }
}

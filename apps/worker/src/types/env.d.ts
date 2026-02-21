interface HyperdriveBinding {
  connectionString: string
}

declare global {
  interface Env {
    HYPERDRIVE: HyperdriveBinding
    CONTEXT_INDEX: KVNamespace
    ANALYTICS: AnalyticsEngineDataset
    AGENT_SESSION: DurableObjectNamespace
    DRIFT_QUEUE: Queue
    HUMAN_REQUIRED_WEBHOOK?: string
    CF_ACCOUNT_ID?: string
    CF_API_TOKEN?: string
    TELEMETRY_BACKEND?: 'cloudflare' | 'clickhouse' | 'otel' | 'both'
    WORKSPACE_ID?: string
    CLICKHOUSE_HOST?: string
    CLICKHOUSE_USER?: string
    CLICKHOUSE_PASSWORD?: string
    CLICKHOUSE_DATABASE?: string
    CLICKHOUSE_BATCH_SIZE?: string
    CLICKHOUSE_FLUSH_INTERVAL_MS?: string
  }
}

export {}

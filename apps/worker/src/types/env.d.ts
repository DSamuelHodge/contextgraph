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
  }
}

export {}

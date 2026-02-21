interface HyperdriveBinding {
  connectionString: string
}

declare global {
  interface Env {
    HYPERDRIVE: HyperdriveBinding
    CONTEXT_INDEX: KVNamespace
    AGENT_SESSION: DurableObjectNamespace
    DRIFT_QUEUE: Queue
    HUMAN_REQUIRED_WEBHOOK?: string
  }
}

export {}

export interface ContextGraphConfig {
  agent: { id: string; defaultBranch: string }
  oracles: Array<{ name: string; uri: string }>
  telemetry?: {
    backend: 'cloudflare' | 'otel' | 'both'
    otel?: {
      endpoint?: string
      headers?: Record<string, string>
    }
  }
  pushContext: {
    maxTokens: number
    includeSkillIndex: boolean
    includeDriftStatus: boolean
  }
  driftPolicy: {
    additive: 'auto-sync' | 'notify'
    breaking: 'pause-notify' | 'rollback' | 'auto-sync'
    corruption: 'halt'
  }
  branchConvention: string
  notifications?: {
    webhook?: string
    slackWebhook?: string
  }
}

export const defaultConfig: ContextGraphConfig = {
  agent: { id: 'agent-1', defaultBranch: 'main' },
  oracles: [],
  telemetry: {
    backend: 'cloudflare'
  },
  pushContext: {
    maxTokens: 200,
    includeSkillIndex: true,
    includeDriftStatus: true
  },
  driftPolicy: {
    additive: 'auto-sync',
    breaking: 'pause-notify',
    corruption: 'halt'
  },
  branchConvention: 'agent/{workspace}/{task}'
}

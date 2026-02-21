import type { ContextGraphConfig } from './packages/deploy/src/config'

const config: ContextGraphConfig = {
  agent: {
    id: 'agent-1',
    defaultBranch: 'main',
    workspaceId: 'default'
  },
  oracles: [],
  telemetry: {
    backend: 'cloudflare',
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST,
      database: process.env.CLICKHOUSE_DATABASE ?? 'contextgraph',
      username: process.env.CLICKHOUSE_USER,
      password: process.env.CLICKHOUSE_PASSWORD,
      batchSize: 50,
      flushIntervalMs: 5000
    }
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
  branchConvention: 'agent/{workspace}/{task}',
  notifications: {
    webhook: ''
  }
}

export default config

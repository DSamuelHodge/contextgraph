import type { ContextGraphConfig } from './packages/deploy/src/config'

const config: ContextGraphConfig = {
  agent: {
    id: 'agent-1',
    defaultBranch: 'main'
  },
  oracles: [
    { name: 'primary', uri: 'https://example.com/graphql' }
  ],
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

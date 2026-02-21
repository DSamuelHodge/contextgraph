import { describe, it, expect } from 'vitest'
import { validateConfigShape } from './validate'
import type { ContextGraphConfig } from './config'

describe('validateConfigShape', () => {
  it('accepts a valid config', () => {
    const config: ContextGraphConfig = {
      agent: { id: 'agent', defaultBranch: 'main' },
      oracles: [],
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

    expect(() => validateConfigShape(config)).not.toThrow()
  })

  it('rejects missing agent config', () => {
    const config = {
      oracles: [],
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
    } as unknown as ContextGraphConfig

    expect(() => validateConfigShape(config)).toThrow('agent.id')
  })
})

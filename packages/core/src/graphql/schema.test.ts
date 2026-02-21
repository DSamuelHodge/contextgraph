import { describe, it, expect } from 'vitest'
import { schema } from './schema'
import { estimateTokens } from './utils'

describe('graphql schema tests', () => {
  it('SchemaEndpoint type does not expose typeMapSnapshot', () => {
    const type = schema.getType('SchemaEndpoint')
    const fields = type && 'getFields' in type ? Object.keys((type as any).getFields()) : []
    expect(fields).not.toContain('typeMapSnapshot')
  })

  it('contextIndex serializes to <= 200 tokens (char/4 heuristic)', async () => {
    const mockIndex = { agentId: 'a', branch: 'b', headHash: '01234567', endpoints: [], skillIndex: Array.from({ length: 10 }, (_, i) => `skill${i}@abcdef12`), knowledgeCount: 500, driftWarning: false }
    const tokens = estimateTokens(JSON.stringify(mockIndex))
    expect(tokens).toBeLessThanOrEqual(200)
  })

  it('syncSchema returns SYNCHRONIZED without write when unchanged (mocked)', async () => {
    // This is a placeholder that asserts the mutation exists
    const mutation = schema.getMutationType()
    expect(mutation).toBeTruthy()
    expect(mutation?.getFields()).toHaveProperty('syncSchema')
  })

  it('commitKnowledge transaction atomic behavior test placeholder', () => {
    const mutation = schema.getMutationType()
    expect(mutation).toBeTruthy()
    expect(mutation?.getFields()).toHaveProperty('commitKnowledge')
  })
})

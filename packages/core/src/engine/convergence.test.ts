import { describe, it, expect } from 'vitest'
import { ConvergenceDetector } from './convergence'
import type { KnowledgeNode } from '@core/types'

const nodeA: KnowledgeNode = {
  id: 'a',
  commitHash: 'c1',
  topic: 'topic',
  claim: 'same claim',
  versionHash: 'v1',
  parentHash: null,
  isomorphisms: [],
  metadata: { agentId: 'agent-1', evidenceRefs: [] }
}

const nodeB: KnowledgeNode = {
  id: 'b',
  commitHash: 'c2',
  topic: 'topic',
  claim: 'same claim',
  versionHash: 'v2',
  parentHash: null,
  isomorphisms: [],
  metadata: { agentId: 'agent-2', evidenceRefs: [] }
}

const nodeC: KnowledgeNode = {
  id: 'c',
  commitHash: 'c3',
  topic: 'topic',
  claim: 'different claim',
  versionHash: 'v3',
  parentHash: null,
  isomorphisms: [],
  metadata: { agentId: 'agent-1', evidenceRefs: ['ref'] }
}

describe('ConvergenceDetector', () => {
  it('promotes nodes that meet convergence threshold', async () => {
    const detector = new ConvergenceDetector({
      listNodesByTopic: async () => [nodeA, nodeB]
    })

    const candidates = await detector.scan('topic')
    expect(candidates[0].score.combined).toBeGreaterThan(0.85)

    const canonical = await detector.promote([nodeA, nodeB])
    expect(canonical.sources).toEqual(['a', 'b'])
  })

  it('rejects promotion when temporal independence fails', async () => {
    const detector = new ConvergenceDetector({
      listNodesByTopic: async () => [nodeA, nodeC]
    })

    await expect(detector.promote([nodeA, nodeC])).rejects.toThrow('Convergence threshold not met.')
  })
})

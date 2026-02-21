import { describe, it, expect } from 'vitest'
import { ContextGraphEngine } from './engine'
import { DriftDetector } from './drift'
import { CollisionDetector } from './collision'
import { DecayEngine } from './decay'
import { ConvergenceDetector } from './convergence'
import { ProvenanceTracker } from './provenance'
import { EngineEventEmitter } from './events'
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

describe('ContextGraphEngine', () => {
  it('blocks merge when human arbitration is required', async () => {
    const events = new EngineEventEmitter()
    const engine = new ContextGraphEngine(
      new DriftDetector({ loadTypeMap: async () => ({ before: { hash: 'a', operations: [] }, after: { hash: 'a', operations: [] } }) }),
      new CollisionDetector({ listCollisions: async () => [{ id: 'c1', kind: 'EPISTEMIC', nodeA: 'n1', nodeB: 'n2', contradiction: 'conflict' }] }, events),
      new DecayEngine({ listNodes: async () => [], listEndpoints: async () => [], markTombstone: async () => {} }),
      new ConvergenceDetector({ listNodesByTopic: async () => [] }),
      new ProvenanceTracker({ getChain: async () => [], getCommit: async () => null, listCommitsBefore: async () => [] }),
      events
    )

    const result = await engine.onMergeAttempt('a', 'b')
    expect(result.status).toBe('BLOCKED')
    expect(result.requiresHuman).toBe(true)
  })

  it('runs maintenance with convergence promotions', async () => {
    const events = new EngineEventEmitter()
    const engine = new ContextGraphEngine(
      new DriftDetector({ loadTypeMap: async () => ({ before: { hash: 'a', operations: [] }, after: { hash: 'a', operations: [] } }) }),
      new CollisionDetector({ listCollisions: async () => [] }, events),
      new DecayEngine({ listNodes: async () => [], listEndpoints: async () => [], markTombstone: async () => {} }),
      new ConvergenceDetector({ listNodesByTopic: async () => [nodeA, nodeB] }),
      new ProvenanceTracker({ getChain: async () => [], getCommit: async () => null, listCommitsBefore: async () => [] }),
      events,
      async (agentId, branch) => ({ agentId, branch }),
      async () => ['topic']
    )

    const report = await engine.runMaintenance('main')
    expect(report.convergencePromotions).toBe(1)
  })

  it('builds context index as a string', async () => {
    const events = new EngineEventEmitter()
    const engine = new ContextGraphEngine(
      new DriftDetector({ loadTypeMap: async () => ({ before: { hash: 'a', operations: [] }, after: { hash: 'a', operations: [] } }) }),
      new CollisionDetector({ listCollisions: async () => [] }, events),
      new DecayEngine({ listNodes: async () => [], listEndpoints: async () => [], markTombstone: async () => {} }),
      new ConvergenceDetector({ listNodesByTopic: async () => [] }),
      new ProvenanceTracker({ getChain: async () => [], getCommit: async () => null, listCommitsBefore: async () => [] }),
      events,
      async () => ({ ok: true })
    )

    const index = await engine.buildContextIndex('agent', 'main')
    expect(index).toContain('ok')
  })
})

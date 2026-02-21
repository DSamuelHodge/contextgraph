import { describe, it, expect } from 'vitest'
import { ProvenanceTracker } from './provenance'
import type { ProvenanceChain } from '@core/types'

const commitA: ProvenanceChain = {
  nodeId: 'n1',
  versionHash: 'v1',
  parentHash: null,
  commitHash: 'c1',
  schemaHash: 's1',
  author: 'AGENT',
  agentId: 'agent-1',
  branchName: 'main',
  taskContractRef: null,
  evidenceRefs: [],
  convergenceOf: []
}

const commitB: ProvenanceChain = {
  ...commitA,
  commitHash: 'c2',
  parentHash: 'c1'
}

describe('ProvenanceTracker', () => {
  it('returns chain for a node', async () => {
    const tracker = new ProvenanceTracker({
      getChain: async () => [commitA, commitB],
      getCommit: async (hash) => (hash === 'c1' ? commitA : commitB),
      listCommitsBefore: async () => ['c1', 'c2']
    })

    const chain = await tracker.chain('n1')
    expect(chain).toHaveLength(2)
  })

  it('verifies commit ancestry', async () => {
    const tracker = new ProvenanceTracker({
      getChain: async () => [commitA],
      getCommit: async (hash) => (hash === 'c1' ? commitA : null),
      listCommitsBefore: async () => []
    })

    const result = await tracker.verify('c2')
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('c2')
  })

  it('replays epistemic state at a time', async () => {
    const tracker = new ProvenanceTracker({
      getChain: async () => [],
      getCommit: async () => commitA,
      listCommitsBefore: async () => ['c1']
    })

    const replay = await tracker.replay('main', new Date())
    expect(replay.commitHashes).toEqual(['c1'])
  })
})

import { describe, it, expect } from 'vitest'
import { DecayEngine } from './decay'
import type { KnowledgeNode, SchemaEndpoint } from '@core/types'

const endpoint: SchemaEndpoint = {
  id: 'e1',
  name: 'oracle',
  uri: 'http://example',
  currentHash: 'hash',
  previousHash: null,
  driftStatus: 'SYNCHRONIZED',
  typeMapSnapshot: null,
  lastIntrospectedAt: null
}

const staleNode: KnowledgeNode = {
  id: 'n1',
  commitHash: 'c1',
  topic: 't1',
  claim: 'claim',
  versionHash: 'v1',
  parentHash: null,
  isomorphisms: [],
  metadata: { lastVerifiedAt: '2000-01-01T00:00:00Z', confidence: 0.1 }
}

const freshNode: KnowledgeNode = {
  id: 'n2',
  commitHash: 'c2',
  topic: 't2',
  claim: 'claim',
  versionHash: 'v2',
  parentHash: null,
  isomorphisms: ['iso'],
  metadata: { lastVerifiedAt: new Date().toISOString(), confidence: 0.9 }
}

describe('DecayEngine', () => {
  it('computes tombstone scores for stale nodes', () => {
    const engine = new DecayEngine({
      listNodes: async () => [staleNode],
      listEndpoints: async () => [endpoint],
      markTombstone: async () => {}
    })

    const score = engine.computeScore(staleNode, endpoint)
    expect(score.tombstone).toBe(true)
  })

  it('scans branches and marks tombstones', async () => {
    const tombstoned: string[] = []
    const engine = new DecayEngine({
      listNodes: async () => [staleNode, freshNode],
      listEndpoints: async () => [endpoint],
      markTombstone: async (nodeId) => {
        tombstoned.push(nodeId)
      }
    })

    const report = await engine.scan('main')
    expect(report.scanned).toBe(2)
    expect(report.tombstoned).toBe(1)
    expect(tombstoned).toContain('n1')
  })
})

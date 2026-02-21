import type { KnowledgeNode, SchemaEndpoint } from '@core/types'
import type { Telemetry } from '../telemetry'

export type DecayScore = {
  temporal: number
  structural: number
  empirical: number
  combined: number
  tombstone: boolean
}

export type DecayReport = {
  branchName: string
  scanned: number
  tombstoned: number
  scores: Array<{ nodeId: string; score: DecayScore }>
}

export interface DecayDataSource {
  listNodes(branchName: string): Promise<KnowledgeNode[]>
  listEndpoints(): Promise<SchemaEndpoint[]>
  markTombstone(nodeId: string): Promise<void>
}

const TOMBSTONE_THRESHOLD = 0.95

export class DecayEngine {
  constructor(
    private dataSource: DecayDataSource,
    private telemetry?: Telemetry
  ) {}

  computeScore(node: KnowledgeNode, endpoint: SchemaEndpoint): DecayScore {
    const now = Date.now()
    const lastVerifiedRaw = (node.metadata as any)?.lastVerifiedAt
    const lastVerified = lastVerifiedRaw ? new Date(lastVerifiedRaw).getTime() : 0
    const ageDays = Math.max(0, (now - lastVerified) / (1000 * 60 * 60 * 24))
    const temporalDecay = Math.min(1, ageDays / 30)

    const isoCount = Array.isArray(node.isomorphisms) ? node.isomorphisms.length : 0
    const structuralDecay = isoCount === 0 ? 1 : 0.3

    const confidence = typeof (node.metadata as any)?.confidence === 'number'
      ? Math.min(1, Math.max(0, (node.metadata as any).confidence))
      : 0.5
    const empiricalDecay = 1 - confidence

    const combined = Number((0.4 * temporalDecay + 0.3 * structuralDecay + 0.3 * empiricalDecay).toFixed(4))
    const tombstone = combined >= TOMBSTONE_THRESHOLD

    return {
      temporal: temporalDecay,
      structural: structuralDecay,
      empirical: empiricalDecay,
      combined,
      tombstone
    }
  }

  async scan(branchName: string): Promise<DecayReport> {
    const nodes = await this.dataSource.listNodes(branchName)
    const endpoints = await this.dataSource.listEndpoints()
    const endpoint = endpoints[0] ?? ({ id: 'unknown' } as SchemaEndpoint)

    const scores: Array<{ nodeId: string; score: DecayScore }> = []
    let tombstoned = 0

    for (const node of nodes) {
      const score = this.computeScore(node, endpoint)
      scores.push({ nodeId: node.id, score })
      if (score.tombstone) {
        await this.tombstone(node.id)
        tombstoned += 1
      }
    }

    const report = {
      branchName,
      scanned: nodes.length,
      tombstoned,
      scores
    }

    this.telemetry?.decayScan({
      branchName,
      nodesScanned: report.scanned,
      nodesTombstoned: report.tombstoned
    })

    return report
  }

  async tombstone(nodeId: string): Promise<void> {
    await this.dataSource.markTombstone(nodeId)
  }
}

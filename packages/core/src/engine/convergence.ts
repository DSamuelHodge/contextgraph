import type { ConvergenceScore, KnowledgeNode } from '@core/types'
import type { Telemetry } from '../telemetry'

export type ConvergenceCandidate = {
  nodeA: KnowledgeNode
  nodeB: KnowledgeNode
  score: ConvergenceScore
}

export type CanonicalNode = {
  topic: string
  claim: string
  versionHash: string
  sources: string[]
}

export interface ConvergenceDataSource {
  listNodesByTopic(topic: string): Promise<KnowledgeNode[]>
  promoteCanonical?(nodes: KnowledgeNode[]): Promise<CanonicalNode>
}

export class ConvergenceDetector {
  constructor(
    private dataSource: ConvergenceDataSource,
    private telemetry?: Telemetry
  ) {}

  async scan(topic: string): Promise<ConvergenceCandidate[]> {
    const nodes = await this.dataSource.listNodesByTopic(topic)
    const candidates: ConvergenceCandidate[] = []

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const score = this.computeScore(nodes[i], nodes[j])
        candidates.push({ nodeA: nodes[i], nodeB: nodes[j], score })
      }
    }

    return candidates
  }

  async promote(nodes: KnowledgeNode[]): Promise<CanonicalNode> {
    if (nodes.length < 2) {
      throw new Error('Convergence promotion requires at least two nodes.')
    }

    const score = this.computeScore(nodes[0], nodes[1])
    if (score.combined <= 0.85 || score.temporal < 0.5) {
      throw new Error('Convergence threshold not met.')
    }

    const promoting = this.dataSource.promoteCanonical
      ? await this.dataSource.promoteCanonical(nodes)
      : {
      topic: nodes[0].topic,
      claim: nodes[0].claim,
      versionHash: nodes[0].versionHash,
      sources: nodes.map((node) => node.id)
      }

    const contributingAgents = nodes
      .map((node) => (node.metadata as any)?.agentId ?? 'unknown')
      .filter((value, index, list) => list.indexOf(value) === index)

    this.telemetry?.convergencePromote({
      topic: nodes[0].topic,
      contributingAgents: contributingAgents.join(','),
      convergenceScore: score.combined
    })

    return promoting
  }

  computeScore(nodeA: KnowledgeNode, nodeB: KnowledgeNode): ConvergenceScore {
    const structural = nodeA.topic === nodeB.topic ? 1 : 0

    const evidenceA = new Set<string>((nodeA.metadata as any)?.evidenceRefs ?? [])
    const evidenceB = new Set<string>((nodeB.metadata as any)?.evidenceRefs ?? [])
    const overlap = [...evidenceA].filter((ref) => evidenceB.has(ref)).length
    const maxEvidence = Math.max(evidenceA.size, evidenceB.size, 1)
    const overlapScore = Math.min(1, overlap / maxEvidence)
    const claimSimilarity = nodeA.claim === nodeB.claim ? 1 : 0
    const evidential = Math.max(overlapScore, claimSimilarity)

    const agentA = (nodeA.metadata as any)?.agentId
    const agentB = (nodeB.metadata as any)?.agentId
    const independent = agentA && agentB ? agentA !== agentB && overlap === 0 : false
    const temporal = independent ? 1 : 0.2

    const combined = Number((0.4 * structural + 0.3 * evidential + 0.3 * temporal).toFixed(4))

    return {
      structural,
      evidential,
      temporal,
      combined
    }
  }
}

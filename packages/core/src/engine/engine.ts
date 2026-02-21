import type { ResolutionResult } from './collision'
import { CollisionDetector } from './collision'
import { ConvergenceDetector } from './convergence'
import { DecayEngine } from './decay'
import { DriftDetector } from './drift'
import { EngineEventEmitter } from './events'
import { ProvenanceTracker } from './provenance'

export type MergeResult = {
  status: 'MERGED' | 'BLOCKED'
  requiresHuman: boolean
  resolutions: ResolutionResult[]
}

export type MaintenanceReport = {
  branchName: string
  decayScanned: number
  tombstoned: number
  convergencePromotions: number
}

export type ContextIndexBuilder = (agentId: string, branch: string) => Promise<unknown>
export type TopicProvider = (branchName: string) => Promise<string[]>

export class ContextGraphEngine {
  constructor(
    private drift: DriftDetector,
    private collision: CollisionDetector,
    private decay: DecayEngine,
    private convergence: ConvergenceDetector,
    private provenance: ProvenanceTracker,
    private events: EngineEventEmitter,
    private contextIndexBuilder: ContextIndexBuilder = async (agentId, branch) => ({ agentId, branch }),
    private topicProvider: TopicProvider = async () => []
  ) {}

  async onSchemaChange(endpointId: string): Promise<void> {
    const event = await this.drift.detect(endpointId)
    await this.drift.remediate(event)
  }

  async onMergeAttempt(source: string, target: string): Promise<MergeResult> {
    const collisions = await this.collision.detect(source, target)
    const resolutions: ResolutionResult[] = []
    let requiresHuman = false

    for (const collision of collisions) {
      const resolution = await this.collision.resolve(collision)
      resolutions.push(resolution)
      if (resolution.requiresHuman) {
        requiresHuman = true
      }
    }

    return {
      status: requiresHuman ? 'BLOCKED' : 'MERGED',
      requiresHuman,
      resolutions
    }
  }

  async buildContextIndex(agentId: string, branch: string): Promise<string> {
    const payload = await this.contextIndexBuilder(agentId, branch)
    return typeof payload === 'string' ? payload : JSON.stringify(payload)
  }

  async runMaintenance(branchName: string): Promise<MaintenanceReport> {
    const decayReport = await this.decay.scan(branchName)
    const topics = await this.topicProvider(branchName)

    let promotions = 0
    for (const topic of topics) {
      const candidates = await this.convergence.scan(topic)
      const best = candidates.sort((a, b) => b.score.combined - a.score.combined)[0]
      if (best && best.score.combined > 0.85 && best.score.temporal >= 0.5) {
        await this.convergence.promote([best.nodeA, best.nodeB])
        promotions += 1
      }
    }

    return {
      branchName,
      decayScanned: decayReport.scanned,
      tombstoned: decayReport.tombstoned,
      convergencePromotions: promotions
    }
  }
}

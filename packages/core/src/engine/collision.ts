import type { CollisionClass } from '@core/types'
import { EngineEventEmitter } from './events'

export type Collision = {
  id: string
  kind: 'ADDITIVE' | 'CONCURRENT_EDIT' | 'SCHEMA_TEMPORAL' | 'EPISTEMIC' | 'POLICY_CONFLICT'
  nodeA?: string
  nodeB?: string
  contradiction?: string
  hashA?: string
  hashB?: string
  field?: string
}

export type ResolutionResult = {
  strategy: 'auto_merge' | 'schema_first' | 'rebase_to_current' | 'human_arbitration' | 'escalate_immediate'
  requiresHuman: boolean
}

export interface CollisionDataSource {
  listCollisions(branchA: string, branchB: string): Promise<Collision[]>
}

export class CollisionDetector {
  constructor(
    private dataSource: CollisionDataSource,
    private events?: EngineEventEmitter
  ) {}

  async detect(branchA: string, branchB: string): Promise<Collision[]> {
    return this.dataSource.listCollisions(branchA, branchB)
  }

  async classify(collision: Collision): Promise<CollisionClass> {
    switch (collision.kind) {
      case 'ADDITIVE':
        return { kind: 'ADDITIVE' }
      case 'CONCURRENT_EDIT':
        return { kind: 'CONCURRENT_EDIT' }
      case 'SCHEMA_TEMPORAL':
        return { kind: 'SCHEMA_TEMPORAL', hashA: collision.hashA ?? 'unknown', hashB: collision.hashB ?? 'unknown' }
      case 'POLICY_CONFLICT':
        return { kind: 'POLICY_CONFLICT', field: collision.field ?? 'unknown' }
      case 'EPISTEMIC':
      default:
        return {
          kind: 'EPISTEMIC',
          nodeA: collision.nodeA ?? 'unknown',
          nodeB: collision.nodeB ?? 'unknown',
          contradiction: collision.contradiction ?? 'contradiction'
        }
    }
  }

  async resolve(collision: Collision): Promise<ResolutionResult> {
    const classification = await this.classify(collision)
    switch (classification.kind) {
      case 'ADDITIVE':
        return { strategy: 'auto_merge', requiresHuman: false }
      case 'CONCURRENT_EDIT':
        return { strategy: 'schema_first', requiresHuman: false }
      case 'SCHEMA_TEMPORAL':
        return { strategy: 'rebase_to_current', requiresHuman: false }
      case 'EPISTEMIC':
        this.events?.emitHumanRequired({
          type: 'EPISTEMIC_COLLISION',
          collisionId: collision.id,
          detail: classification.contradiction
        })
        return { strategy: 'human_arbitration', requiresHuman: true }
      case 'POLICY_CONFLICT':
        this.events?.emitHumanRequired({
          type: 'POLICY_CONFLICT',
          collisionId: collision.id,
          field: classification.field
        })
        return { strategy: 'escalate_immediate', requiresHuman: true }
    }
  }
}

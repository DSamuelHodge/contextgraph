import { describe, it, expect } from 'vitest'
import { CollisionDetector, type CollisionDataSource } from './collision'
import { EngineEventEmitter } from './events'

const collisions = [
  { id: 'c1', kind: 'ADDITIVE' as const },
  { id: 'c2', kind: 'CONCURRENT_EDIT' as const },
  { id: 'c3', kind: 'SCHEMA_TEMPORAL' as const, hashA: 'a', hashB: 'b' },
  { id: 'c4', kind: 'EPISTEMIC' as const, nodeA: 'n1', nodeB: 'n2', contradiction: 'conflict' },
  { id: 'c5', kind: 'POLICY_CONFLICT' as const, field: 'policy' }
]

const dataSource: CollisionDataSource = {
  async listCollisions() {
    return collisions
  }
}

describe('CollisionDetector', () => {
  it('resolves additive and concurrent edits automatically', async () => {
    const detector = new CollisionDetector(dataSource)
    const additive = await detector.resolve(collisions[0])
    const concurrent = await detector.resolve(collisions[1])
    expect(additive.strategy).toBe('auto_merge')
    expect(concurrent.strategy).toBe('schema_first')
  })

  it('resolves schema temporal conflicts automatically', async () => {
    const detector = new CollisionDetector(dataSource)
    const resolution = await detector.resolve(collisions[2])
    expect(resolution.strategy).toBe('rebase_to_current')
  })

  it('emits human-required events for epistemic and policy conflicts', async () => {
    const events = new EngineEventEmitter()
    const received: string[] = []
    events.onHumanRequired((event) => {
      received.push(event.type)
    })

    const detector = new CollisionDetector(dataSource, events)
    const epistemic = await detector.resolve(collisions[3])
    const policy = await detector.resolve(collisions[4])

    expect(epistemic.requiresHuman).toBe(true)
    expect(policy.requiresHuman).toBe(true)
    expect(received).toContain('EPISTEMIC_COLLISION')
    expect(received).toContain('POLICY_CONFLICT')
  })
})

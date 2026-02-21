import { describe, it, expect } from 'vitest'
import { DriftDetector, type DriftDataSource } from './drift'
import { EngineEventEmitter } from './events'

const baseBefore = { hash: 'a', operations: ['q1', 'q2'] }

const dataSource: DriftDataSource = {
  async loadTypeMap(endpointId: string) {
    switch (endpointId) {
      case 'corrupt':
        return { before: baseBefore, after: { ...baseBefore, corruption: true } }
      case 'breaking':
        return { before: baseBefore, after: { ...baseBefore, removed: ['q2'] } }
      case 'deprecation':
        return { before: baseBefore, after: { ...baseBefore, deprecated: ['q1'] } }
      case 'additive':
        return { before: baseBefore, after: { ...baseBefore, added: ['q3'] } }
      default:
        return { before: baseBefore, after: { ...baseBefore } }
    }
  }
}

describe('DriftDetector', () => {
  it('classifies corruption first and emits human-required event', async () => {
    const events = new EngineEventEmitter()
    const received: string[] = []
    events.onHumanRequired((event) => {
      received.push(event.type)
    })

    const detector = new DriftDetector(dataSource, events)
    const event = await detector.detect('corrupt')
    expect(event.severity).toBe('CORRUPTION')

    const result = await detector.remediate(event)
    expect(result.requiresHuman).toBe(true)
    expect(received).toContain('CORRUPTION_DETECTED')
  })

  it('classifies breaking drift', async () => {
    const detector = new DriftDetector(dataSource)
    const event = await detector.detect('breaking')
    expect(event.severity).toBe('BREAKING')
  })

  it('classifies deprecation drift', async () => {
    const detector = new DriftDetector(dataSource)
    const event = await detector.detect('deprecation')
    expect(event.severity).toBe('DEPRECATION')
  })

  it('classifies additive drift', async () => {
    const detector = new DriftDetector(dataSource)
    const event = await detector.detect('additive')
    expect(event.severity).toBe('ADDITIVE')
  })

  it('defaults to silent drift', async () => {
    const detector = new DriftDetector(dataSource)
    const event = await detector.detect('silent')
    expect(event.severity).toBe('SILENT')
  })
})

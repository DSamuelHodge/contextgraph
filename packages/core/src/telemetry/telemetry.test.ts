import { describe, it, expect } from 'vitest'
import { Telemetry } from './index'

class FakeSpan {
  name: string
  attributes: Record<string, unknown> = {}

  constructor(name: string) {
    this.name = name
  }

  setAttributes(attrs: Record<string, unknown>) {
    Object.assign(this.attributes, attrs)
  }

  setStatus() {}

  end() {}
}

class FakeTracer {
  lastSpan?: FakeSpan

  startSpan(name: string) {
    const span = new FakeSpan(name)
    this.lastSpan = span
    return span as any
  }
}

describe('Telemetry', () => {
  it('records drift detect attributes', () => {
    const tracer = new FakeTracer()
    const telemetry = new Telemetry(undefined, tracer as any)

    telemetry.driftDetect({
      endpointId: 'endpoint-1',
      severity: 'BREAKING',
      affectedOperationCount: 3
    })

    expect(tracer.lastSpan?.name).toBe('contextgraph.drift.detect')
    expect(tracer.lastSpan?.attributes).toMatchObject({
      endpointId: 'endpoint-1',
      severity: 'BREAKING',
      affectedOperationCount: 3
    })
  })

  it('records session resume attributes', () => {
    const tracer = new FakeTracer()
    const telemetry = new Telemetry(undefined, tracer as any)

    telemetry.sessionResume({
      agentId: 'agent-1',
      branch: 'main',
      indexTokenCount: 42,
      driftStatus: 'healthy'
    })

    expect(tracer.lastSpan?.name).toBe('contextgraph.session.resume')
    expect(tracer.lastSpan?.attributes).toMatchObject({
      agentId: 'agent-1',
      branch: 'main',
      indexTokenCount: 42,
      driftStatus: 'healthy'
    })
  })

  it('records commit knowledge attributes', () => {
    const tracer = new FakeTracer()
    const telemetry = new Telemetry(undefined, tracer as any)

    telemetry.commitKnowledge({
      topic: 'pricing',
      author: 'agent-1',
      evidenceRefCount: 2,
      newVersionHash: 'hash-1'
    })

    expect(tracer.lastSpan?.name).toBe('contextgraph.commit.knowledge')
    expect(tracer.lastSpan?.attributes).toMatchObject({
      topic: 'pricing',
      author: 'agent-1',
      evidenceRefCount: 2,
      newVersionHash: 'hash-1'
    })
  })
})

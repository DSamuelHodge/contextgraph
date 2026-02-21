import { describe, expect, it } from 'vitest'
import { EngineEventEmitter } from '../../../../packages/core/src/engine'
import { estimateTokens } from '../../../../packages/core/src/graphql/utils'
import { serializeContextIndex, type ContextIndexPayload } from '../context-index'
import { CloudflareAnalyticsBackend } from './cf-analytics'
import { OtelBridge } from './otel-bridge'

describe('worker telemetry backends', () => {
  it('CloudflareAnalyticsBackend.record never throws when writeDataPoint fails', () => {
    const backend = new CloudflareAnalyticsBackend({
      writeDataPoint: () => {
        throw new Error('boom')
      }
    } as unknown as AnalyticsEngineDataset)

    expect(() =>
      backend.record({
        eventType: 'SESSION_RESUME',
        agentId: 'agent-1',
        branchName: 'main'
      })
    ).not.toThrow()
  })

  it('OtelBridge.record never throws when tracer is misconfigured', () => {
    const backend = new OtelBridge({
      startSpan: () => {
        throw new Error('misconfigured tracer')
      }
    } as any)

    expect(() =>
      backend.record({
        eventType: 'SESSION_RESUME',
        agentId: 'agent-1',
        branchName: 'main'
      })
    ).not.toThrow()
  })

  it('EngineEventEmitter.emit records telemetry before handlers', async () => {
    const bus = new EngineEventEmitter()
    const order: string[] = []

    bus.setTelemetry({
      record() {
        order.push('telemetry')
      }
    })

    bus.on('SESSION_RESUME', async () => {
      order.push('handler')
    })

    await bus.emit({
      type: 'SESSION_RESUME',
      agentId: 'agent-1',
      branchName: 'main',
      payload: { tokenCount: 128 }
    })

    expect(order).toEqual(['telemetry', 'handler'])
  })

  it('token count for max-size context index stays <= 200', () => {
    const payload: ContextIndexPayload = {
      agentId: 'agent-1',
      branch: 'main',
      headHash: 'abcdef12',
      endpoints: Array.from({ length: 12 }, (_, i) => ({
        name: `endpoint-${i}`,
        driftStatus: i % 2 === 0 ? 'SILENT' : 'BREAKING',
        hash: `hash-${i}`
      })),
      skillIndex: Array.from({ length: 120 }, (_, i) => `skill-${i}@deadbeef`),
      knowledgeCount: 99999,
      driftWarning: true
    }

    const index = serializeContextIndex(payload)
    const tokenCount = estimateTokens(index)
    expect(tokenCount).toBeLessThanOrEqual(200)
  })
})

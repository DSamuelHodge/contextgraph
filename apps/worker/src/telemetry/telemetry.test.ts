import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompositeBackend } from '../../../../packages/core/src/telemetry'
import { EngineEventEmitter } from '../../../../packages/core/src/engine'
import { estimateTokens } from '../../../../packages/core/src/graphql/utils'
import { serializeContextIndex, type ContextIndexPayload } from '../context-index'
import { CloudflareAnalyticsBackend } from './cf-analytics'
import { ClickHouseBackend } from './clickhouse-backend'
import { OtelBridge } from './otel-bridge'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('worker telemetry backends', () => {
  it('CompositeBackend isolates backend failures and continues fan-out', () => {
    const received: string[] = []
    const composite = new CompositeBackend([
      {
        record() {
          throw new Error('primary failed')
        }
      },
      {
        record() {
          received.push('secondary')
        }
      }
    ])

    expect(() =>
      composite.record({
        eventType: 'SESSION_RESUME',
        agentId: 'agent-1',
        branchName: 'main'
      })
    ).not.toThrow()

    expect(received).toEqual(['secondary'])
  })

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

  it('ClickHouseBackend batches by threshold and does not flush early', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const backend = new ClickHouseBackend({
      host: 'https://example.clickhouse.cloud:8443',
      database: 'contextgraph',
      username: 'user',
      password: 'pass',
      workspaceId: 'ws-1',
      batchSize: 2,
      flushIntervalMs: 60_000
    })

    backend.record({ eventType: 'SESSION_RESUME', agentId: 'agent-1', branchName: 'main' })
    expect(fetchSpy).toHaveBeenCalledTimes(0)

    backend.record({ eventType: 'SESSION_RESUME', agentId: 'agent-2', branchName: 'main' })

    await Promise.resolve()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('ClickHouseBackend.flush never throws when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const backend = new ClickHouseBackend({
      host: 'https://example.clickhouse.cloud:8443',
      database: 'contextgraph',
      username: 'user',
      password: 'pass',
      workspaceId: 'ws-1',
      batchSize: 10,
      flushIntervalMs: 60_000
    })

    backend.record({ eventType: 'SESSION_RESUME', agentId: 'agent-1', branchName: 'main' })
    await expect(backend.flush()).resolves.toBeUndefined()
  })

  it('OtelBridge warns when no provider is registered and record is no-op', () => {
    const warnings: string[] = []
    const tracer = {
      startSpan: vi.fn(() => {
        throw new Error('should not be called when provider is absent')
      })
    } as any

    const backend = new OtelBridge(tracer, (message) => {
      warnings.push(message)
    })

    expect(() =>
      backend.record({
        eventType: 'SESSION_RESUME',
        agentId: 'agent-1',
        branchName: 'main'
      })
    ).not.toThrow()

    expect(warnings.length).toBeGreaterThan(0)
    expect(tracer.startSpan).toHaveBeenCalledTimes(0)
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

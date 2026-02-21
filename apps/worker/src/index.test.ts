import { describe, it, expect } from 'vitest'
import { createApp } from './index'

function createKv() {
  const store = new Map<string, string>()
  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    }
  } as KVNamespace
}

describe('worker push middleware', () => {
  it('injects context index header on session start', async () => {
    const app = createApp({
      skipAuth: true,
      skipOracle: true,
      createDb: () => ({} as any),
      buildIndex: async () => 'index-value'
    })

    const env = {
      HYPERDRIVE: { connectionString: 'postgres://test' },
      CONTEXT_INDEX: createKv(),
      ANALYTICS: { writeDataPoint: () => {} },
      DRIFT_QUEUE: { send: async () => {} },
      AGENT_SESSION: {
        idFromName: () => 'agent',
        get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
      }
    } as unknown as Env

    const res = await app.request('/agent/session', {
      method: 'POST',
      headers: { 'x-agent-id': 'agent-1', 'x-branch-name': 'main' }
    }, env)

    expect(res.headers.get('x-contextgraph-index')).toBe('index-value')
  })
})

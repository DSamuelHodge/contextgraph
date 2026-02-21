import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContextGraphClient } from './client'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFetch.mockReset()
})

describe('ContextGraphClient', () => {
  it('runs resume -> gql -> commit -> close lifecycle', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ agentId: 'agent-1', branch: 'main', index: '{"headHash":"abcd","skillIndex":[],"knowledgeCount":0}' }), {
        headers: { 'x-contextgraph-index': '{"headHash":"abcd","skillIndex":[],"knowledgeCount":0}' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { branches: [] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { commitKnowledge: { hash: 'c1' } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { mergeBranch: { status: 'MERGED' } } })))

    const client = new ContextGraphClient({
      workerUrl: 'https://contextgraph.workers.dev',
      agentId: 'agent-1',
      branch: 'agent/workspace/task'
    })

    const session = await client.resume()
    expect(session.headHash).toBe('abcd')

    await client.gql('query { branches { name } }')
    const commit = await client.commit({ topic: 't', claim: 'c', commitMessage: 'm' })
    expect(commit.hash).toBe('c1')

    const close = await client.close('done')
    expect(close.merged).toBe(true)
  })

  it('throws on breaking drift during resume', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ agentId: 'agent-1', branch: 'main', index: '' }), {
      headers: { 'x-contextgraph-warning': 'BREAKING_DRIFT' }
    }))

    const client = new ContextGraphClient({
      workerUrl: 'https://contextgraph.workers.dev',
      agentId: 'agent-1'
    })

    await expect(client.resume()).rejects.toThrow('Breaking drift detected')
  })
})

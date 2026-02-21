import type { MiddlewareHandler } from 'hono'
import type { ContextGraphEngine } from '../../../../packages/core/src/engine'
import { estimateTokens } from '../../../../packages/core/src/graphql/utils'
import { getEngineEventBus } from '../engine-factory'

export const pushMiddleware: MiddlewareHandler = async (c, next) => {
  const agentId = c.get('agentId')
  const branchName = c.get('branchName')
  const engine = c.get('engine') as ContextGraphEngine
  const bus = getEngineEventBus()
  const cacheKey = `context-index:${agentId}:${branchName}`

  let index = await c.env.CONTEXT_INDEX.get(cacheKey)
  if (!index) {
    index = await engine.buildContextIndex(agentId, branchName)
    await c.env.CONTEXT_INDEX.put(cacheKey, index, { expirationTtl: 60 })
  }

  const tokenCount = estimateTokens(index)
  void bus.emit({
    type: 'SESSION_RESUME',
    agentId,
    branchName,
    payload: { tokenCount }
  })
  if (tokenCount > 200) {
    console.error('[push] index exceeded 200 tokens after trim:', tokenCount)
  }

  await next()
  c.header('x-contextgraph-index', index)
}

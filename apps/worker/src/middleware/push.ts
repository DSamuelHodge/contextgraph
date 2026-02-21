import type { MiddlewareHandler } from 'hono'
import type { ContextGraphEngine } from '../../../../packages/core/src/engine'

export const pushMiddleware: MiddlewareHandler = async (c, next) => {
  const agentId = c.get('agentId')
  const branchName = c.get('branchName')
  const engine = c.get('engine') as ContextGraphEngine
  const cacheKey = `context-index:${agentId}:${branchName}`

  let index = await c.env.CONTEXT_INDEX.get(cacheKey)
  if (!index) {
    index = await engine.buildContextIndex(agentId, branchName)
    await c.env.CONTEXT_INDEX.put(cacheKey, index, { expirationTtl: 60 })
  }

  await next()
  c.header('x-contextgraph-index', index)
}

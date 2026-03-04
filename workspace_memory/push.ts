import type { MiddlewareHandler } from 'hono'
import type { ContextGraphEngine } from '../../../../packages/core/src/engine'
import { estimateTokens } from '../../../../packages/core/src/graphql/utils'
import { getEngineEventBus } from '../engine-factory'
import {
  buildWorkspaceIndexPayload,
  serializeWorkspaceIndex
} from '../context-index'
import type { DB } from '../db'

/**
 * Push middleware — runs on every request, injects context into response headers.
 *
 * Two headers, two budgets, two concerns:
 *
 *   x-contextgraph-index     (epistemic, 200 tokens)
 *     → schemaHash, driftStatus, pendingCollisions, convergenceReady,
 *       recentTopics, blockedOnHuman
 *     → What the agent needs to decide WHETHER and HOW to act on the graph
 *
 *   x-contextgraph-workspace (workspace, 500 tokens)
 *     → candidateCount, observationCount, pinnedDocs (content)
 *     → What the agent has been working on and what observations are ready
 *
 * These are DELIBERATELY SEPARATE headers with separate budgets.
 * The workspace header NEVER contains epistemic data and vice versa.
 * This enforces the isolation guarantee at the transport layer.
 *
 * Caching:
 *   Epistemic index: 60s TTL in KV (same as before)
 *   Workspace index: 30s TTL in KV (more volatile — agents write frequently)
 */
export const pushMiddleware: MiddlewareHandler = async (c, next) => {
  const agentId = c.get('agentId')
  const branchName = c.get('branchName')
  const engine = c.get('engine') as ContextGraphEngine
  const db = c.get('db') as DB
  const bus = getEngineEventBus()

  // ── Epistemic index (existing behavior, preserved) ──────────────────────────
  const epistemicCacheKey = `context-index:${agentId}:${branchName}`
  let epistemicIndex = await c.env.CONTEXT_INDEX.get(epistemicCacheKey)
  if (!epistemicIndex) {
    epistemicIndex = await engine.buildContextIndex(agentId, branchName)
    await c.env.CONTEXT_INDEX.put(epistemicCacheKey, epistemicIndex, { expirationTtl: 60 })
  }

  const epistemicTokenCount = estimateTokens(epistemicIndex)
  if (epistemicTokenCount > 200) {
    console.error('[push] epistemic index exceeded 200 tokens after trim:', epistemicTokenCount)
  }

  // ── Workspace index (new behavior) ──────────────────────────────────────────
  const workspaceCacheKey = `workspace-index:${agentId}:${branchName}`
  let workspaceIndex = await c.env.CONTEXT_INDEX.get(workspaceCacheKey)
  if (!workspaceIndex) {
    try {
      const workspacePayload = await buildWorkspaceIndexPayload(db, agentId, branchName)
      workspaceIndex = serializeWorkspaceIndex(workspacePayload)
      await c.env.CONTEXT_INDEX.put(workspaceCacheKey, workspaceIndex, { expirationTtl: 30 })
    } catch (err) {
      // Workspace index failure is non-fatal — agent can still operate epistemically
      console.warn('[push] workspace index build failed:', err)
      workspaceIndex = JSON.stringify({ candidateCount: 0, pinnedDocs: [], observationCount: 0 })
    }
  }

  void bus.emit({
    type: 'SESSION_RESUME',
    agentId,
    branchName,
    payload: {
      tokenCount: epistemicTokenCount,
      workspaceTokenCount: estimateTokens(workspaceIndex)
    }
  })

  await next()

  // Inject both headers on the response
  c.header('x-contextgraph-index', epistemicIndex)
  c.header('x-contextgraph-workspace', workspaceIndex)
}
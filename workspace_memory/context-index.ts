import { estimateTokens } from '../../packages/core/src/graphql/utils'
import schema from '../../packages/core/src/schema'
import { eq, isNull, desc, inArray, and } from 'drizzle-orm'
import type { DB } from './db'
import { CANDIDATE_CONFIDENCE_THRESHOLD } from '../../packages/core/src/engine/observation'

export type PendingCollisionSummary = {
  topic: string
  kind: string
  nodeA: string
  nodeB: string
}

export type PinnedWorkspaceDoc = {
  id: string
  path: string
  content: string
  kind: string
}

/**
 * Epistemic index — 200 token budget.
 * What the agent needs to decide whether and how to act on the epistemic graph.
 */
export type EpistemicIndexPayload = {
  agentId: string
  branch: string
  headHash: string
  schemaHash: string
  driftStatus: string | null
  driftWarning: boolean
  pendingCollisions: PendingCollisionSummary[]
  convergenceReady: string[]
  recentTopics: string[]
  blockedOnHuman: boolean
}

/**
 * Workspace index — 500 token budget, separate from epistemic.
 * Pinned docs + candidate summary injected alongside the epistemic index.
 */
export type WorkspaceIndexPayload = {
  candidateCount: number       // how many CANDIDATE docs are awaiting agent review
  pinnedDocs: PinnedWorkspaceDoc[]  // content of pinned docs (trimmed to budget)
  observationCount: number     // informational
}

/**
 * Full context index — both budgets combined.
 * Delivered to agent via x-contextgraph-index and x-contextgraph-workspace headers.
 */
export type FullContextIndex = {
  epistemic: EpistemicIndexPayload
  workspace: WorkspaceIndexPayload
}

const EPISTEMIC_TOKEN_BUDGET = 200
const WORKSPACE_TOKEN_BUDGET = 500

// ─── Epistemic Index Builder ──────────────────────────────────────────────────

export async function buildEpistemicIndexPayload(
  db: DB,
  agentId: string,
  branchName: string
): Promise<EpistemicIndexPayload> {
  const branch = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.name, branchName))
    .limit(1)

  const endpoints = await db
    .select({
      driftStatus: schema.schema_endpoints.driftStatus,
      currentHash: schema.schema_endpoints.currentHash
    })
    .from(schema.schema_endpoints)
    .orderBy(desc(schema.schema_endpoints.lastIntrospectedAt))

  const primaryEndpoint = endpoints[0]
  const schemaHash = primaryEndpoint?.currentHash?.slice(0, 12) ?? 'unknown'
  const driftStatus = primaryEndpoint?.driftStatus ?? null
  const driftWarning = endpoints.some(
    e => e.driftStatus === 'BREAKING_DRIFT' || e.driftStatus === 'BREAKING' || e.driftStatus === 'CORRUPTION'
  )

  const pendingMerges = await db
    .select({ status: schema.merge_requests.status })
    .from(schema.merge_requests)
    .where(eq(schema.merge_requests.sourceBranch, branchName))

  const blockedOnHuman = pendingMerges.some(m => m.status === 'PENDING')

  const branchCommits = await db
    .select({ hash: schema.memory_commits.hash })
    .from(schema.memory_commits)
    .where(eq(schema.memory_commits.branchName, branchName))

  const commitHashes = branchCommits.map(c => c.hash)
  let pendingCollisions: PendingCollisionSummary[] = []
  let recentTopics: string[] = []

  if (commitHashes.length > 0) {
    const nodes = await db
      .select({
        id: schema.knowledge_nodes.id,
        topic: schema.knowledge_nodes.topic,
        versionHash: schema.knowledge_nodes.versionHash
      })
      .from(schema.knowledge_nodes)
      .where(inArray(schema.knowledge_nodes.commitHash, commitHashes))

    const topicMap = new Map<string, typeof nodes>()
    for (const node of nodes) {
      const existing = topicMap.get(node.topic) ?? []
      existing.push(node)
      topicMap.set(node.topic, existing)
    }

    for (const [topic, topicNodes] of topicMap.entries()) {
      const uniqueVersions = new Set(topicNodes.map(n => n.versionHash))
      if (uniqueVersions.size > 1) {
        const sorted = topicNodes.slice().sort((a, b) => a.id.localeCompare(b.id))
        pendingCollisions.push({
          topic,
          kind: 'CONCURRENT_EDIT',
          nodeA: sorted[0].id,
          nodeB: sorted[1]?.id ?? sorted[0].id
        })
      }
    }

    recentTopics = [...new Set(nodes.slice(-20).map(n => n.topic))].slice(0, 5)
  }

  const mainCommits = await db
    .select({ hash: schema.memory_commits.hash })
    .from(schema.memory_commits)
    .where(eq(schema.memory_commits.branchName, 'main'))
    .limit(50)

  let convergenceReady: string[] = []
  if (mainCommits.length > 0) {
    const mainNodes = await db
      .select({ topic: schema.knowledge_nodes.topic, claim: schema.knowledge_nodes.claim })
      .from(schema.knowledge_nodes)
      .where(inArray(schema.knowledge_nodes.commitHash, mainCommits.map(c => c.hash)))

    const topicClaimCounts = new Map<string, Map<string, number>>()
    for (const node of mainNodes) {
      const claimMap = topicClaimCounts.get(node.topic) ?? new Map()
      claimMap.set(node.claim, (claimMap.get(node.claim) ?? 0) + 1)
      topicClaimCounts.set(node.topic, claimMap)
    }

    for (const [topic, claimMap] of topicClaimCounts.entries()) {
      for (const [, count] of claimMap.entries()) {
        if (count >= 2) { convergenceReady.push(topic); break }
      }
    }
    convergenceReady = convergenceReady.slice(0, 5)
  }

  return {
    agentId,
    branch: branchName,
    headHash: branch?.[0]?.headHash?.slice(0, 8) ?? 'genesis',
    schemaHash,
    driftStatus,
    driftWarning,
    pendingCollisions: pendingCollisions.slice(0, 3),
    convergenceReady,
    recentTopics,
    blockedOnHuman
  }
}

// ─── Workspace Index Builder ──────────────────────────────────────────────────

export async function buildWorkspaceIndexPayload(
  db: DB,
  agentId: string,
  branchName: string
): Promise<WorkspaceIndexPayload> {
  const allDocs = await db
    .select({
      id: schema.workspace_documents.id,
      path: schema.workspace_documents.path,
      content: schema.workspace_documents.content,
      kind: schema.workspace_documents.kind,
      pinned: schema.workspace_documents.pinned,
      confidence: schema.workspace_documents.confidence,
      promotedToNodeId: schema.workspace_documents.promotedToNodeId
    })
    .from(schema.workspace_documents)
    .where(and(
      eq(schema.workspace_documents.agentId, agentId),
      eq(schema.workspace_documents.branchName, branchName),
      isNull(schema.workspace_documents.deletedAt)
    ))
    .orderBy(desc(schema.workspace_documents.updatedAt))

  const candidateCount = allDocs.filter(
    d => d.kind === 'CANDIDATE' && !d.promotedToNodeId
  ).length

  const observationCount = allDocs.filter(d => d.kind === 'OBSERVATION').length

  // Build pinned docs within workspace token budget
  const pinnedRaw = allDocs.filter(d => d.pinned)
  const pinnedDocs: PinnedWorkspaceDoc[] = []
  let workspaceTokensUsed = 0

  for (const doc of pinnedRaw) {
    const docTokens = estimateTokens(`${doc.path}\n${doc.content}`)
    if (workspaceTokensUsed + docTokens > WORKSPACE_TOKEN_BUDGET) break
    pinnedDocs.push({ id: doc.id, path: doc.path, content: doc.content, kind: doc.kind })
    workspaceTokensUsed += docTokens
  }

  return { candidateCount, pinnedDocs, observationCount }
}

// ─── Serializers ─────────────────────────────────────────────────────────────

export function serializeEpistemicIndex(payload: EpistemicIndexPayload): string {
  let current = { ...payload }
  let tokens = estimateTokens(JSON.stringify(current))
  if (tokens <= EPISTEMIC_TOKEN_BUDGET) return JSON.stringify(current)

  current = { ...current, convergenceReady: [] }
  tokens = estimateTokens(JSON.stringify(current))
  if (tokens <= EPISTEMIC_TOKEN_BUDGET) return JSON.stringify(current)

  current = { ...current, recentTopics: [] }
  tokens = estimateTokens(JSON.stringify(current))
  if (tokens <= EPISTEMIC_TOKEN_BUDGET) return JSON.stringify(current)

  const collisionCount = current.pendingCollisions.length
  return JSON.stringify({
    agentId: current.agentId,
    branch: current.branch,
    headHash: current.headHash,
    schemaHash: current.schemaHash,
    driftStatus: current.driftStatus,
    driftWarning: current.driftWarning,
    convergenceReady: [],
    recentTopics: [],
    blockedOnHuman: current.blockedOnHuman,
    pendingCollisionCount: collisionCount
  })
}

export function serializeWorkspaceIndex(payload: WorkspaceIndexPayload): string {
  // Workspace index is pre-trimmed by buildWorkspaceIndexPayload — just serialize
  return JSON.stringify(payload)
}

// ─── Legacy compatibility ─────────────────────────────────────────────────────
// Keep the old names working during migration

export type ContextIndexPayload = EpistemicIndexPayload
export const buildContextIndexPayload = buildEpistemicIndexPayload
export const serializeContextIndex = serializeEpistemicIndex
import {
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLBoolean,
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLList
} from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { eq, and, isNull } from 'drizzle-orm'

// ─── Output Types ─────────────────────────────────────────────────────────────

export const WorkspaceDocumentType = new GraphQLObjectType({
  name: 'WorkspaceDocument',
  fields: {
    id: { type: GraphQLString },
    agentId: { type: GraphQLString },
    branchName: { type: GraphQLString },
    path: { type: GraphQLString },
    content: { type: GraphQLString },
    kind: { type: GraphQLString },
    confidence: { type: GraphQLFloat },
    pinned: { type: GraphQLBoolean },
    promotedToNodeId: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString }
  }
})

export const PromotionResultType = new GraphQLObjectType({
  name: 'PromotionResult',
  fields: {
    workspaceDocumentId: { type: GraphQLString },
    promotedToNodeId: { type: GraphQLString },
    commitHash: { type: GraphQLString },
    topic: { type: GraphQLString },
    claim: { type: GraphQLString }
  }
})

// ─── writeWorkspace ───────────────────────────────────────────────────────────

export const WorkspaceWriteInput = new GraphQLInputObjectType({
  name: 'WorkspaceWriteInput',
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    content: { type: new GraphQLNonNull(GraphQLString) },
    pinned: { type: GraphQLBoolean }
  }
})

export const writeWorkspaceArgs = {
  input: { type: new GraphQLNonNull(WorkspaceWriteInput) }
}

/**
 * Agent-initiated write of a SCRATCH workspace document.
 *
 * Upserts by (agentId, branchName, path) — writing to an existing path
 * updates the content and timestamp. This is intentional: workspace documents
 * are living notes, not immutable commits.
 *
 * ISOLATION: writes only to workspace_documents. Never touches knowledge_nodes.
 */
export function writeWorkspaceResolver(db: DB) {
  return async (_root: unknown, args: any, ctx: any) => {
    const { path, content, pinned = false } = args.input as {
      path: string
      content: string
      pinned?: boolean
    }
    const agentId: string = ctx.agentId
    const branchName: string = ctx.branchName

    // Validate path format — must be hierarchical, no absolute paths
    if (!path || path.startsWith('/') || path.includes('..')) {
      throw new Error(`Invalid workspace path '${path}'. Use relative paths like 'scratch/notes' or 'candidates/PricingTier'.`)
    }

    // Upsert: check if document exists at this path
    const existing = await db
      .select({ id: schema.workspace_documents.id })
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.agentId, agentId),
        eq(schema.workspace_documents.branchName, branchName),
        eq(schema.workspace_documents.path, path),
        isNull(schema.workspace_documents.deletedAt)
      ))
      .limit(1)

    if (existing[0]) {
      // Update existing document
      const updated = await db
        .update(schema.workspace_documents)
        .set({
          content,
          pinned,
          updatedAt: new Date()
        })
        .where(eq(schema.workspace_documents.id, existing[0].id))
        .returning()
      return updated[0]
    }

    // Insert new document
    const [doc] = await db
      .insert(schema.workspace_documents)
      .values({
        id: crypto.randomUUID(),
        agentId,
        branchName,
        path,
        content,
        kind: 'SCRATCH',
        confidence: null,
        pinned,
        promotedToNodeId: null,
        deletedAt: null
      })
      .returning()

    return doc
  }
}

// ─── pinWorkspace ─────────────────────────────────────────────────────────────

export const pinWorkspaceArgs = {
  id: { type: new GraphQLNonNull(GraphQLString) },
  pinned: { type: new GraphQLNonNull(GraphQLBoolean) }
}

/**
 * Toggle pinned status on a workspace document.
 * Pinned documents are injected into every session resume for this agent+branch.
 */
export function pinWorkspaceResolver(db: DB) {
  return async (_root: unknown, args: any, ctx: any) => {
    const { id, pinned } = args as { id: string; pinned: boolean }

    const existing = await db
      .select()
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.id, id),
        eq(schema.workspace_documents.agentId, ctx.agentId),
        isNull(schema.workspace_documents.deletedAt)
      ))
      .limit(1)

    if (!existing[0]) {
      throw new Error(`Workspace document '${id}' not found or not owned by agent '${ctx.agentId}'.`)
    }

    const [updated] = await db
      .update(schema.workspace_documents)
      .set({ pinned, updatedAt: new Date() })
      .where(eq(schema.workspace_documents.id, id))
      .returning()

    return updated
  }
}

// ─── deleteWorkspace ──────────────────────────────────────────────────────────

export const deleteWorkspaceArgs = {
  id: { type: new GraphQLNonNull(GraphQLString) }
}

/**
 * Soft-delete a workspace document. Sets deletedAt — never hard deletes.
 * Promoted documents (promotedToNodeId != null) cannot be deleted — the
 * audit trail must be preserved.
 */
export function deleteWorkspaceResolver(db: DB) {
  return async (_root: unknown, args: any, ctx: any) => {
    const { id } = args as { id: string }

    const existing = await db
      .select()
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.id, id),
        eq(schema.workspace_documents.agentId, ctx.agentId),
        isNull(schema.workspace_documents.deletedAt)
      ))
      .limit(1)

    if (!existing[0]) {
      throw new Error(`Workspace document '${id}' not found.`)
    }

    if (existing[0].promotedToNodeId) {
      throw new Error(
        `Cannot delete workspace document '${id}' — it has been promoted to epistemic node '${existing[0].promotedToNodeId}'. The audit trail must be preserved.`
      )
    }

    await db
      .update(schema.workspace_documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.workspace_documents.id, id))

    return { success: true, id }
  }
}

// ─── promoteWorkspaceCandidate ────────────────────────────────────────────────

export const PromoteCandidateInput = new GraphQLInputObjectType({
  name: 'PromoteCandidateInput',
  fields: {
    workspaceDocumentId: { type: new GraphQLNonNull(GraphQLString) },
    // Agent can override the observed claim before promoting
    claimOverride: { type: GraphQLString },
    commitMessage: { type: GraphQLString },
    evidenceRefs: { type: new GraphQLList(GraphQLString) }
  }
})

export const promoteCandidateArgs = {
  input: { type: new GraphQLNonNull(PromoteCandidateInput) }
}

/**
 * The formal boundary crossing: promotes a CANDIDATE workspace document
 * into an epistemic knowledge node via commitKnowledge.
 *
 * This is the ONLY path from workspace to epistemic memory. It:
 * 1. Validates the document exists, is a CANDIDATE, and is owned by this agent
 * 2. Extracts topic from the document's path (observations/{topic}/...)
 * 3. Validates topic against oracle schemas (same as commitKnowledge)
 * 4. Inserts into knowledge_nodes + memory_commits in a transaction
 * 5. Sets promotedToNodeId on the workspace document — the permanent audit trail
 *
 * After promotion, the workspace document is preserved read-only.
 * It is never deleted — the audit trail from observation to canonical fact must persist.
 */
export function promoteCandidateResolver(db: DB) {
  return async (_root: unknown, args: any, ctx: any) => {
    const { workspaceDocumentId, claimOverride, commitMessage, evidenceRefs = [] } =
      args.input as {
        workspaceDocumentId: string
        claimOverride?: string
        commitMessage?: string
        evidenceRefs?: string[]
      }

    // 1. Load and validate the workspace document
    const docs = await db
      .select()
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.id, workspaceDocumentId),
        eq(schema.workspace_documents.agentId, ctx.agentId),
        isNull(schema.workspace_documents.deletedAt)
      ))
      .limit(1)

    const doc = docs[0]
    if (!doc) {
      throw new Error(`Workspace document '${workspaceDocumentId}' not found.`)
    }
    if (doc.kind !== 'CANDIDATE') {
      throw new Error(
        `Document '${workspaceDocumentId}' has kind '${doc.kind}'. Only CANDIDATE documents can be promoted. ` +
        `If this is an OBSERVATION, wait for the ObservationEngine to raise its confidence above ${0.7}, or promote it manually via writeWorkspace with kind=CANDIDATE.`
      )
    }
    if (doc.promotedToNodeId) {
      throw new Error(
        `Document '${workspaceDocumentId}' has already been promoted to node '${doc.promotedToNodeId}'.`
      )
    }

    // 2. Extract topic from path: "observations/{topic}/..." → topic
    const pathParts = doc.path.split('/')
    const topicFromPath = pathParts.length >= 2 ? pathParts[1] : null

    if (!topicFromPath) {
      throw new Error(
        `Cannot extract topic from workspace path '${doc.path}'. ` +
        `Expected format: 'observations/{TopicName}/{claim-slug}'.`
      )
    }

    // 3. Extract claim from content frontmatter or use override
    let claim = claimOverride
    if (!claim) {
      // Parse the observation content for the claim
      const claimMatch = doc.content.match(/^>\s+(.+)$/m)
      if (!claimMatch) {
        throw new Error(
          `Could not extract claim from document content. Provide claimOverride or ensure content has a '> claim' line.`
        )
      }
      claim = claimMatch[1].trim()
    }

    // 4. Validate topic against oracle (reuse same logic as commitKnowledge)
    const endpoints = await db.select({
      typeMapSnapshot: schema.schema_endpoints.typeMapSnapshot
    }).from(schema.schema_endpoints)

    let topicValid = endpoints.length === 0 // bootstrap: allow all
    for (const ep of endpoints) {
      if (!ep.typeMapSnapshot) continue
      try {
        const snap = typeof ep.typeMapSnapshot === 'string'
          ? JSON.parse(ep.typeMapSnapshot)
          : ep.typeMapSnapshot
        const types: Array<{ name: string; kind: string }> =
          snap?.data?.__schema?.types ?? snap?.__schema?.types ?? []
        if (types.some(t => t.name === topicFromPath && !t.name.startsWith('__') && t.kind !== 'SCALAR')) {
          topicValid = true
          break
        }
      } catch { continue }
    }

    if (!topicValid) {
      throw new Error(
        `Topic '${topicFromPath}' is not registered in any oracle schema. ` +
        `The workspace observation may be stale — the oracle schema may have drifted.`
      )
    }

    // 5. Commit to epistemic layer in a transaction
    const toHex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    const sha256 = async (s: string) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
      return toHex(buf)
    }

    const versionHash = await sha256(claim + topicFromPath)
    const metadata = {
      author: ctx.agentId,
      createdAt: new Date().toISOString(),
      commitMessage: commitMessage ?? `Promote workspace observation: ${topicFromPath}`,
      evidenceRefs,
      promotedFromWorkspaceDoc: workspaceDocumentId,
      observationConfidence: doc.confidence
    }
    const nodePayload = {
      topic: topicFromPath,
      claim,
      versionHash,
      parentHash: null,
      isomorphisms: [],
      metadata
    }
    const commitHash = await sha256(JSON.stringify(nodePayload) + ctx.branchName + Date.now())

    const currentBranch = (await db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.name, ctx.branchName))
      .limit(1))[0]

    const currentSchemaHash = (await db
      .select({ h: schema.schema_endpoints.currentHash })
      .from(schema.schema_endpoints)
      .limit(1))[0]?.h ?? 'unknown'

    const result = await db.transaction(async tx => {
      const [node] = await tx
        .insert(schema.knowledge_nodes)
        .values({
          id: crypto.randomUUID(),
          commitHash,
          topic: topicFromPath,
          claim,
          versionHash,
          parentHash: null,
          isomorphisms: [],
          metadata
        })
        .returning()

      const [commit] = await tx
        .insert(schema.memory_commits)
        .values({
          hash: commitHash,
          parentHash: currentBranch?.headHash ?? null,
          branchName: ctx.branchName,
          author: 'AGENT',
          message: commitMessage ?? `Promote workspace observation: ${topicFromPath}`,
          schemaHash: currentSchemaHash,
          snapshot: { nodeId: node.id, versionHash, promotedFrom: workspaceDocumentId }
        })
        .returning()

      await tx
        .update(schema.branches)
        .set({ headHash: commitHash, updatedAt: new Date() })
        .where(eq(schema.branches.name, ctx.branchName))

      // Set the audit trail — workspace doc is now permanently linked to the node
      await tx
        .update(schema.workspace_documents)
        .set({ promotedToNodeId: node.id, updatedAt: new Date() })
        .where(eq(schema.workspace_documents.id, workspaceDocumentId))

      return { commit, node }
    })

    return {
      workspaceDocumentId,
      promotedToNodeId: result.node.id,
      commitHash: result.commit.hash,
      topic: topicFromPath,
      claim
    }
  }
}
import {
  GraphQLString,
  GraphQLBoolean,
  GraphQLList,
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLInt
} from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { eq, and, isNull, desc, gte } from 'drizzle-orm'
import { WorkspaceDocumentType } from '../mutations/workspace'
import { CANDIDATE_CONFIDENCE_THRESHOLD } from '../../engine/observation'

export { WorkspaceDocumentType }

export const WorkspaceSummaryType = new GraphQLObjectType({
  name: 'WorkspaceSummary',
  fields: {
    totalDocuments: { type: GraphQLInt },
    scratchCount: { type: GraphQLInt },
    observationCount: { type: GraphQLInt },
    candidateCount: { type: GraphQLInt },
    pinnedCount: { type: GraphQLInt },
    promotedCount: { type: GraphQLInt }
  }
})

// ─── workspaceDocuments ───────────────────────────────────────────────────────

export const listWorkspaceArgs = {
  kind: { type: GraphQLString },        // filter by kind: SCRATCH | OBSERVATION | CANDIDATE
  pinned: { type: GraphQLBoolean },     // filter to only pinned docs
  pathPrefix: { type: GraphQLString }   // filter by path prefix e.g. "observations/"
}

/**
 * List workspace documents for the current agent+branch.
 * Only returns non-deleted documents.
 * Ordered by updatedAt descending — most recently touched first.
 */
export function workspaceDocumentsResolver(db: DB) {
  return async (_root: unknown, args: any, ctx: any) => {
    const { kind, pinned, pathPrefix } = args as {
      kind?: string
      pinned?: boolean
      pathPrefix?: string
    }

    let query = db
      .select()
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.agentId, ctx.agentId),
        eq(schema.workspace_documents.branchName, ctx.branchName),
        isNull(schema.workspace_documents.deletedAt)
      ))
      .orderBy(desc(schema.workspace_documents.updatedAt))
      .$dynamic()

    const rows = await query

    // Apply filters in memory (simpler than dynamic where chains for now)
    return rows.filter(doc => {
      if (kind && doc.kind !== kind) return false
      if (pinned !== undefined && doc.pinned !== pinned) return false
      if (pathPrefix && !doc.path.startsWith(pathPrefix)) return false
      return true
    })
  }
}

// ─── workspaceCandidates ──────────────────────────────────────────────────────

/**
 * Returns only CANDIDATE documents — those the ObservationEngine has
 * determined are ready for promotion review.
 *
 * Ordered by confidence descending — most promotable first.
 * Excludes already-promoted documents.
 */
export function workspaceCandidatesResolver(db: DB) {
  return async (_root: unknown, _args: unknown, ctx: any) => {
    const rows = await db
      .select()
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.agentId, ctx.agentId),
        eq(schema.workspace_documents.branchName, ctx.branchName),
        eq(schema.workspace_documents.kind, 'CANDIDATE'),
        isNull(schema.workspace_documents.deletedAt),
        isNull(schema.workspace_documents.promotedToNodeId)  // not yet promoted
      ))
      .orderBy(desc(schema.workspace_documents.confidence))

    return rows
  }
}

// ─── workspaceSummary ─────────────────────────────────────────────────────────

/**
 * Aggregate view of the workspace state for this agent+branch.
 * Used by the context index to build the session resume payload.
 */
export function workspaceSummaryResolver(db: DB) {
  return async (_root: unknown, _args: unknown, ctx: any) => {
    const rows = await db
      .select({
        kind: schema.workspace_documents.kind,
        pinned: schema.workspace_documents.pinned,
        promotedToNodeId: schema.workspace_documents.promotedToNodeId
      })
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.agentId, ctx.agentId),
        eq(schema.workspace_documents.branchName, ctx.branchName),
        isNull(schema.workspace_documents.deletedAt)
      ))

    const summary = {
      totalDocuments: rows.length,
      scratchCount: rows.filter(r => r.kind === 'SCRATCH').length,
      observationCount: rows.filter(r => r.kind === 'OBSERVATION').length,
      candidateCount: rows.filter(r => r.kind === 'CANDIDATE' && !r.promotedToNodeId).length,
      pinnedCount: rows.filter(r => r.pinned).length,
      promotedCount: rows.filter(r => !!r.promotedToNodeId).length
    }

    return summary
  }
}

// ─── pinnedWorkspaceContent ───────────────────────────────────────────────────

/**
 * Returns the content of all pinned workspace documents for this agent+branch.
 * This is what gets injected into the session resume payload as the
 * workspace context budget (separate from the 200-token epistemic budget).
 *
 * Max 500 tokens worth of pinned content is returned — callers must trim.
 */
export function pinnedWorkspaceContentResolver(db: DB) {
  return async (_root: unknown, _args: unknown, ctx: any) => {
    const rows = await db
      .select({
        id: schema.workspace_documents.id,
        path: schema.workspace_documents.path,
        content: schema.workspace_documents.content,
        kind: schema.workspace_documents.kind
      })
      .from(schema.workspace_documents)
      .where(and(
        eq(schema.workspace_documents.agentId, ctx.agentId),
        eq(schema.workspace_documents.branchName, ctx.branchName),
        eq(schema.workspace_documents.pinned, true),
        isNull(schema.workspace_documents.deletedAt)
      ))
      .orderBy(desc(schema.workspace_documents.updatedAt))

    return rows
  }
}
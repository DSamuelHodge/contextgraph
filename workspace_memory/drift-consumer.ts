import { EngineEventEmitter } from '../../../packages/core/src/engine'
import { ObservationEngine } from '../../../packages/core/src/engine/observation'
import { createDb } from './db'
import {
  buildEpistemicIndexPayload,
  serializeEpistemicIndex
} from './context-index'
import { createEngine } from './engine-factory'
import schema from '../../../packages/core/src/schema'
import { eq, isNull } from 'drizzle-orm'

export type DriftQueueMessage = {
  endpointId: string
  branchName: string
  agentIds?: string[]
  otherBranches?: string[]
}

/**
 * Drift queue consumer — runs on every schema change event.
 *
 * Order of operations per message:
 *   1. onSchemaChange  → DriftDetector classifies severity, updates endpoint
 *   2. runMaintenance  → DecayEngine tombstones, ConvergenceDetector promotes
 *   3. ObservationEngine.scan → watches commits, deposits workspace observations
 *   4. onMergeAttempt  → CollisionDetector for any pending cross-branch merges
 *   5. buildContextIndex → rebuild epistemic index cache for affected agents
 *
 * The ObservationEngine runs AFTER maintenance (step 3) so it can observe
 * any nodes that just survived decay and are worth watching.
 */
export async function handleDriftQueue(batch: MessageBatch<DriftQueueMessage>, env: Env) {
  const db = createDb(env)
  const events = new EngineEventEmitter()

  events.onHumanRequired(async (event) => {
    if (!env.HUMAN_REQUIRED_WEBHOOK) return
    await fetch(env.HUMAN_REQUIRED_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event)
    })
  })

  const buildIndex = async (dbInstance: typeof db, agentId: string, branchName: string) => {
    const payload = await buildEpistemicIndexPayload(dbInstance, agentId, branchName)
    return serializeEpistemicIndex(payload)
  }

  const engine = createEngine(db, buildIndex, events)

  // Wire the ObservationEngine with a DB-backed data source
  const observationEngine = new ObservationEngine({
    listRecentCommits: async (branchName, limit) => {
      return db
        .select()
        .from(schema.memory_commits)
        .where(eq(schema.memory_commits.branchName, branchName))
        .orderBy(schema.memory_commits.createdAt)
        .limit(limit)
    },

    listNodesByCommits: async (commitHashes) => {
      if (commitHashes.length === 0) return []
      const { inArray } = await import('drizzle-orm')
      return db
        .select({
          id: schema.knowledge_nodes.id,
          topic: schema.knowledge_nodes.topic,
          claim: schema.knowledge_nodes.claim,
          versionHash: schema.knowledge_nodes.versionHash,
          metadata: schema.knowledge_nodes.metadata
        })
        .from(schema.knowledge_nodes)
        .where(inArray(schema.knowledge_nodes.commitHash, commitHashes))
    },

    findWorkspaceDoc: async (agentId, branchName, path) => {
      const { and } = await import('drizzle-orm')
      const rows = await db
        .select({
          id: schema.workspace_documents.id,
          confidence: schema.workspace_documents.confidence,
          kind: schema.workspace_documents.kind
        })
        .from(schema.workspace_documents)
        .where(and(
          eq(schema.workspace_documents.agentId, agentId),
          eq(schema.workspace_documents.branchName, branchName),
          eq(schema.workspace_documents.path, path),
          isNull(schema.workspace_documents.deletedAt)
        ))
        .limit(1)
      return rows[0] ?? null
    },

    writeWorkspaceDoc: async (agentId, branchName, doc) => {
      const [inserted] = await db
        .insert(schema.workspace_documents)
        .values({
          id: crypto.randomUUID(),
          agentId,
          branchName,
          path: doc.path,
          content: doc.content,
          kind: doc.kind,
          confidence: doc.confidence,
          pinned: false,
          promotedToNodeId: null,
          deletedAt: null
        })
        .returning({ id: schema.workspace_documents.id })
      return { id: inserted.id }
    },

    updateWorkspaceDoc: async (id, updates) => {
      await db
        .update(schema.workspace_documents)
        .set(updates)
        .where(eq(schema.workspace_documents.id, id))
    },

    listOracleTypeNames: async () => {
      const endpoints = await db
        .select({ typeMapSnapshot: schema.schema_endpoints.typeMapSnapshot })
        .from(schema.schema_endpoints)

      const typeNames: string[] = []
      for (const ep of endpoints) {
        if (!ep.typeMapSnapshot) continue
        try {
          const snap = typeof ep.typeMapSnapshot === 'string'
            ? JSON.parse(ep.typeMapSnapshot)
            : ep.typeMapSnapshot
          const types: Array<{ name: string; kind: string }> =
            snap?.data?.__schema?.types ?? snap?.__schema?.types ?? []
          for (const t of types) {
            if (!t.name.startsWith('__') && t.kind !== 'SCALAR') {
              typeNames.push(t.name)
            }
          }
        } catch { continue }
      }
      return typeNames
    }
  })

  for (const message of batch.messages) {
    const payload = message.body

    // 1. Drift detection
    await engine.onSchemaChange(payload.endpointId)

    // 2. Maintenance (decay + convergence)
    await engine.runMaintenance(payload.branchName)

    // 3. Observation engine — run for each affected agent
    if (payload.agentIds?.length) {
      for (const agentId of payload.agentIds) {
        try {
          const report = await observationEngine.scan(agentId, payload.branchName)
          if (report.observationsGenerated > 0 || report.candidatesPromoted > 0) {
            console.log(
              `[observation] agent=${agentId} branch=${payload.branchName}`,
              `scanned=${report.commitsScanned}`,
              `generated=${report.observationsGenerated}`,
              `candidates=${report.candidatesPromoted}`
            )
          }
        } catch (err) {
          // Observation failure is non-fatal — don't block drift processing
          console.error(`[observation] scan failed for agent=${agentId}:`, err)
        }
      }
    }

    // 4. Merge attempts for other branches
    if (payload.otherBranches?.length) {
      for (const target of payload.otherBranches) {
        await engine.onMergeAttempt(payload.branchName, target)
      }
    }

    // 5. Rebuild epistemic index cache for affected agents
    if (payload.agentIds?.length) {
      for (const agentId of payload.agentIds) {
        const index = await engine.buildContextIndex(agentId, payload.branchName)
        const cacheKey = `context-index:${agentId}:${payload.branchName}`
        await env.CONTEXT_INDEX.put(cacheKey, index, { expirationTtl: 60 })

        // Also invalidate workspace cache so next request rebuilds it
        const workspaceCacheKey = `workspace-index:${agentId}:${payload.branchName}`
        await env.CONTEXT_INDEX.delete(workspaceCacheKey)
      }
    }

    message.ack()
  }
}
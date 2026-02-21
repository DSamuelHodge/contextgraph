import { eq } from 'drizzle-orm'
import schema from '../../../packages/core/src/schema'
import {
  CollisionDetector,
  ConvergenceDetector,
  ContextGraphEngine,
  DecayEngine,
  DriftDetector,
  EngineEventEmitter,
  ProvenanceTracker,
  type TypeMap
} from '../../../packages/core/src/engine'
import type { DB } from './db'

export type BuildIndexFn = (db: DB, agentId: string, branchName: string) => Promise<string>

export function createEngine(db: DB, buildIndex: BuildIndexFn, events = new EngineEventEmitter()) {
  const drift = new DriftDetector({
    loadTypeMap: async (endpointId: string) => {
      const endpoint = await db
        .select()
        .from(schema.schema_endpoints)
        .where(eq(schema.schema_endpoints.id, endpointId))
        .limit(1)
      const snapshot = (endpoint?.[0] as any)?.typeMapSnapshot ?? {}
      const base: TypeMap = {
        hash: snapshot.hash ?? (endpoint?.[0] as any)?.currentHash ?? 'unknown',
        operations: snapshot.operations ?? []
      }
      return { before: base, after: base }
    },
    updateEndpoint: async (endpointId, severity) => {
      await db
        .update(schema.schema_endpoints)
        .set({ driftStatus: severity })
        .where(eq(schema.schema_endpoints.id, endpointId))
    }
  }, events)

  const collision = new CollisionDetector({
    listCollisions: async () => []
  }, events)

  const decay = new DecayEngine({
    listNodes: async () => db.select().from(schema.knowledge_nodes),
    listEndpoints: async () => db.select().from(schema.schema_endpoints),
    markTombstone: async () => {}
  })

  const convergence = new ConvergenceDetector({
    listNodesByTopic: async (topic) =>
      db.select().from(schema.knowledge_nodes).where(eq(schema.knowledge_nodes.topic, topic)),
    promoteCanonical: async (nodes) => ({
      topic: nodes[0].topic,
      claim: nodes[0].claim,
      versionHash: nodes[0].versionHash,
      sources: nodes.map((node) => node.id)
    })
  })

  const provenance = new ProvenanceTracker({
    getChain: async () => [],
    getCommit: async () => null,
    listCommitsBefore: async () => []
  })

  return new ContextGraphEngine(
    drift,
    collision,
    decay,
    convergence,
    provenance,
    events,
    async (agentId, branchName) => buildIndex(db, agentId, branchName),
    async () => []
  )
}

import { GraphQLList, GraphQLNonNull, GraphQLString, GraphQLObjectType } from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { JsonScalar } from '../scalars'
import { eq, lte, inArray, and, desc } from 'drizzle-orm'

export const knowledgeAtArgs = {
  branchName: { type: new GraphQLNonNull(GraphQLString) },
  at: { type: new GraphQLNonNull(GraphQLString) }
}

export const historyArgs = {
  nodeId: { type: new GraphQLNonNull(GraphQLString) }
}

export const diffArgs = {
  nodeId: { type: new GraphQLNonNull(GraphQLString) },
  from: { type: new GraphQLNonNull(GraphQLString) },
  to: { type: new GraphQLNonNull(GraphQLString) }
}

export function knowledgeAtResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { branchName, at } = args
    const commits = await db.select({ hash: schema.memory_commits.hash })
      .from(schema.memory_commits)
      .where(and(eq(schema.memory_commits.branchName, branchName), lte(schema.memory_commits.createdAt, new Date(at))))
      .limit(1000)
    const commitHashes = commits.map((c: any) => c.hash)
    if (commitHashes.length === 0) return []
    return await db.select().from(schema.knowledge_nodes)
      .where(inArray(schema.knowledge_nodes.commitHash, commitHashes))
  }
}

export function historyResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { nodeId } = args
    const start = await db.select().from(schema.knowledge_nodes).where(eq(schema.knowledge_nodes.id, nodeId)).limit(1)
    const out: any[] = []
    let currentHash: string | null = start?.[0]?.commitHash ?? null
    let depth = 0
    while (currentHash && depth < 100) {
      const commits = await db.select().from(schema.memory_commits).where(eq(schema.memory_commits.hash, currentHash)).limit(1)
      if (!commits || commits.length === 0) break
      out.push(commits[0])
      currentHash = commits[0].parentHash ?? null
      depth++
    }
    return out
  }
}

export function diffResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { nodeId, from, to } = args
    const node = await db.select().from(schema.knowledge_nodes).where(eq(schema.knowledge_nodes.id, nodeId)).limit(1)
    const beforeCommit = await db.select().from(schema.memory_commits)
      .where(lte(schema.memory_commits.createdAt, new Date(from)))
      .orderBy(desc(schema.memory_commits.createdAt))
      .limit(1)
    const afterCommit = await db.select().from(schema.memory_commits)
      .where(lte(schema.memory_commits.createdAt, new Date(to)))
      .orderBy(desc(schema.memory_commits.createdAt))
      .limit(1)
    const before = node?.[0] ?? null
    const after = node?.[0] ?? null
    const added: any[] = []
    const removed: any[] = []
    const modified: any[] = []
    for (const k of Object.keys(before || {})) {
      if (!(k in after)) removed.push({ field: k, value: (before as any)[k] })
      else if (JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k])) modified.push({ field: k, before: (before as any)[k], after: (after as any)[k] })
    }
    for (const k of Object.keys(after || {})) {
      if (!(k in before)) added.push({ field: k, value: (after as any)[k] })
    }
    return {
      nodeId,
      added,
      modified,
      removed,
      schemaHashBefore: beforeCommit?.[0]?.schemaHash ?? 'unknown',
      schemaHashAfter: afterCommit?.[0]?.schemaHash ?? 'unknown'
    }
  }
}

export const MemoryDeltaType = new GraphQLObjectType({
  name: 'MemoryDelta',
  fields: {
    nodeId: { type: GraphQLString },
    added: { type: new GraphQLList(JsonScalar) },
    modified: { type: new GraphQLList(JsonScalar) },
    removed: { type: new GraphQLList(JsonScalar) },
    schemaHashBefore: { type: GraphQLString },
    schemaHashAfter: { type: GraphQLString }
  }
})

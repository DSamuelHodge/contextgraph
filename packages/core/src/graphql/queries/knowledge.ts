import { builder } from '../builder'
import schema from '@core/schema'
import { KnowledgeNodeType, MemoryCommitType, MemoryDeltaType } from '../types'
import { eq, lte, inArray, and, desc } from 'drizzle-orm'

builder.queryField('knowledgeBase', t => t.field({
  type: [KnowledgeNodeType],
  args: builder.args((t) => ({
    topic: t.string({ required: true }),
    at: t.string()
  })),
  resolve: async (_root, args, ctx) => {
    const { topic, at } = args as any
    if (at) {
      // return nodes as of timestamp `at` by joining commits
      const commits = await ctx.db.select({ hash: schema.memory_commits.hash })
        .from(schema.memory_commits)
        .where(and(eq(schema.memory_commits.branchName, ctx.branchName), lte(schema.memory_commits.createdAt, new Date(at))))
        .limit(1000)
      const commitHashes = commits.map((c: any) => c.hash)
      if (commitHashes.length === 0) return []
      return await ctx.db.select().from(schema.knowledge_nodes)
        .where(and(eq(schema.knowledge_nodes.topic, topic), inArray(schema.knowledge_nodes.commitHash, commitHashes)))
    }
    // current HEAD state for branch: return nodes for commits on this branch
    const branchCommits = await ctx.db.select({ hash: schema.memory_commits.hash })
      .from(schema.memory_commits)
      .where(eq(schema.memory_commits.branchName, ctx.branchName))
    const hashes = branchCommits.map((c: any) => c.hash)
    if (hashes.length === 0) return []
    return await ctx.db.select().from(schema.knowledge_nodes)
      .where(and(eq(schema.knowledge_nodes.topic, topic), inArray(schema.knowledge_nodes.commitHash, hashes)))
  }
}))

builder.queryField('history', t => t.field({
  type: [MemoryCommitType],
  args: builder.args((t) => ({
    nodeId: t.id({ required: true }),
    type: t.string({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { nodeId } = args as any
    const start = await ctx.db.select().from(schema.knowledge_nodes).where(eq(schema.knowledge_nodes.id, nodeId)).limit(1)
    const out: any[] = []
    let currentHash: string | null = start?.[0]?.commitHash ?? null
    let depth = 0
    while (currentHash && depth < 100) {
      const commits = await ctx.db.select().from(schema.memory_commits).where(eq(schema.memory_commits.hash, currentHash)).limit(1)
      if (!commits || commits.length === 0) break
      out.push(commits[0])
      currentHash = commits[0].parentHash ?? null
      depth++
    }
    return out
  }
}))

builder.queryField('diff', t => t.field({
  type: MemoryDeltaType,
  args: builder.args((t) => ({
    nodeId: t.id({ required: true }),
    from: t.string({ required: true }),
    to: t.string({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { nodeId, from, to } = args as any
    // Simplified diff: fetch node payloads at nearest commits and compare JSON
    const node = await ctx.db.select().from(schema.knowledge_nodes).where(eq(schema.knowledge_nodes.id, nodeId)).limit(1)
    const beforeCommit = await ctx.db.select().from(schema.memory_commits)
      .where(lte(schema.memory_commits.createdAt, new Date(from)))
      .orderBy(desc(schema.memory_commits.createdAt))
      .limit(1)
    const afterCommit = await ctx.db.select().from(schema.memory_commits)
      .where(lte(schema.memory_commits.createdAt, new Date(to)))
      .orderBy(desc(schema.memory_commits.createdAt))
      .limit(1)
    const before = node?.[0] ?? null
    const after = node?.[0] ?? null
    // naive field comparison
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
}))

import { builder } from '../builder'
import { ContextIndexType } from '../types'
import { estimateTokens } from '../utils'
import { eq, isNull, sql } from 'drizzle-orm'
import schema from '@core/schema'

builder.queryField('contextIndex', t => t.field({
  type: ContextIndexType,
  resolve: async (_root, _args, ctx) => {
    const index = await buildIndex(ctx)
    const tokenEstimate = estimateTokens(JSON.stringify(index))
    if (tokenEstimate > 200) {
      // Trim skill index to fit — telemetry should record this event
      // For now, trim to first N entries until under budget
      let skills = index.skillIndex
      while (estimateTokens(JSON.stringify({ ...index, skillIndex: skills })) > 200 && skills.length) {
        skills = skills.slice(0, Math.max(0, skills.length - 1))
      }
      index.skillIndex = skills
    }
    return index
  }
}))

async function buildIndex(ctx: any) {
  const branch = await ctx.db.select().from(schema.branches).where(eq(schema.branches.name, ctx.branchName)).limit(1)
  const endpoints = await ctx.db.select({ name: schema.schema_endpoints.name, driftStatus: schema.schema_endpoints.driftStatus, currentHash: schema.schema_endpoints.currentHash }).from(schema.schema_endpoints)
  const skills = await ctx.db.select({ name: schema.skills.name, versionHash: schema.skills.versionHash }).from(schema.skills).where(isNull(schema.skills.deprecatedBy))
  const nodeCountRes = await ctx.db.select({ count: sql<number>`count(*)` }).from(schema.knowledge_nodes)
  const nodeCount = Array.isArray(nodeCountRes) ? (nodeCountRes[0] as any).count ?? 0 : 0

  return {
    agentId: ctx.agentId,
    branch: ctx.branchName,
    headHash: branch?.[0]?.headHash?.slice(0, 8) ?? 'genesis',
    endpoints: endpoints.map((e: any) => ({ name: e.name, driftStatus: e.driftStatus, hash: e.currentHash?.slice(0, 8) ?? 'unknown' })),
    skillIndex: skills.map((s: any) => `${s.name}@${s.versionHash.slice(0, 8)}`),
    knowledgeCount: Number(nodeCount),
    driftWarning: endpoints.some((e: any) => e.driftStatus === 'BREAKING_DRIFT' || e.driftStatus === 'CORRUPTION')
  }
}

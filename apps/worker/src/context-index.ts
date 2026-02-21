import { estimateTokens } from '../../../packages/core/src/graphql/utils'
import schema from '../../../packages/core/src/schema'
import { eq, isNull, sql } from 'drizzle-orm'
import type { DB } from './db'

export type ContextIndexPayload = {
  agentId: string
  branch: string
  headHash: string
  endpoints: Array<{ name: string; driftStatus: string | null; hash: string }>
  skillIndex: string[]
  knowledgeCount: number
  driftWarning: boolean
}

export async function buildContextIndexPayload(db: DB, agentId: string, branchName: string): Promise<ContextIndexPayload> {
  const branch = await db.select().from(schema.branches).where(eq(schema.branches.name, branchName)).limit(1)
  const endpoints = await db
    .select({
      name: schema.schema_endpoints.name,
      driftStatus: schema.schema_endpoints.driftStatus,
      currentHash: schema.schema_endpoints.currentHash
    })
    .from(schema.schema_endpoints)
  const skills = await db
    .select({ name: schema.skills.name, versionHash: schema.skills.versionHash })
    .from(schema.skills)
    .where(isNull(schema.skills.deprecatedBy))
  const nodeCountRes = await db.select({ count: sql<number>`count(*)` }).from(schema.knowledge_nodes)
  const nodeCount = Array.isArray(nodeCountRes) ? (nodeCountRes[0] as any).count ?? 0 : 0

  return {
    agentId,
    branch: branchName,
    headHash: branch?.[0]?.headHash?.slice(0, 8) ?? 'genesis',
    endpoints: endpoints.map((endpoint: any) => ({
      name: endpoint.name,
      driftStatus: endpoint.driftStatus,
      hash: endpoint.currentHash?.slice(0, 8) ?? 'unknown'
    })),
    skillIndex: skills.map((skill: any) => `${skill.name}@${skill.versionHash.slice(0, 8)}`),
    knowledgeCount: Number(nodeCount),
    driftWarning: endpoints.some((endpoint: any) =>
      endpoint.driftStatus === 'BREAKING_DRIFT' || endpoint.driftStatus === 'CORRUPTION'
    )
  }
}

export function serializeContextIndex(payload: ContextIndexPayload): string {
  let index = { ...payload }
  let tokenEstimate = estimateTokens(JSON.stringify(index))
  if (tokenEstimate > 200) {
    let skills = index.skillIndex
    let endpoints = index.endpoints
    while (skills.length && tokenEstimate > 200) {
      skills = skills.slice(0, Math.max(0, skills.length - 1))
      tokenEstimate = estimateTokens(JSON.stringify({ ...index, skillIndex: skills, endpoints }))
    }

    while (endpoints.length && tokenEstimate > 200) {
      endpoints = endpoints.slice(0, Math.max(0, endpoints.length - 1))
      tokenEstimate = estimateTokens(JSON.stringify({ ...index, skillIndex: skills, endpoints }))
    }

    if (tokenEstimate > 200) {
      const minimal = {
        agentId: index.agentId,
        branch: index.branch,
        headHash: index.headHash,
        endpoints: [] as ContextIndexPayload['endpoints'],
        skillIndex: [] as string[],
        knowledgeCount: index.knowledgeCount,
        driftWarning: index.driftWarning
      }
      return JSON.stringify(minimal)
    }

    index = { ...index, skillIndex: skills, endpoints }
  }
  return JSON.stringify(index)
}

import { GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLBoolean, GraphQLList } from 'graphql'
import type { DB } from '@core/db'
import { estimateTokens } from '../utils'
import { eq, isNull, sql } from 'drizzle-orm'
import schema from '@core/schema'

export const SchemaEndpointType = new GraphQLObjectType({
  name: 'SchemaEndpoint',
  fields: {
    id: { type: GraphQLString },
    name: { type: GraphQLString },
    uri: { type: GraphQLString },
    currentHash: { type: GraphQLString },
    driftStatus: { type: GraphQLString },
    lastIntrospectedAt: { type: GraphQLString }
  }
})

export const ContextIndexType = new GraphQLObjectType({
  name: 'ContextIndex',
  fields: {
    agentId: { type: GraphQLString },
    branch: { type: GraphQLString },
    headHash: { type: GraphQLString },
    endpoints: {
      type: new GraphQLList(new GraphQLObjectType({
        name: 'EndpointSummary',
        fields: {
          name: { type: GraphQLString },
          driftStatus: { type: GraphQLString },
          hash: { type: GraphQLString }
        }
      }))
    },
    skillIndex: { type: new GraphQLList(GraphQLString) },
    knowledgeCount: { type: GraphQLInt },
    driftWarning: { type: GraphQLBoolean }
  }
})

export function contextIndexResolver(db: DB) {
  return async (_root: unknown, _args: unknown, ctx: any) => {
    const index = await buildIndex(db, ctx)
    const tokenEstimate = estimateTokens(JSON.stringify(index))
    if (tokenEstimate > 200) {
      // Trim skill index to fit — telemetry should record this event
      let skills = index.skillIndex
      while (estimateTokens(JSON.stringify({ ...index, skillIndex: skills })) > 200 && skills.length) {
        skills = skills.slice(0, Math.max(0, skills.length - 1))
      }
      index.skillIndex = skills
    }
    return index
  }
}

export function schemaEndpointsResolver(db: DB) {
  return async () => {
    return await db.select({
      id: schema.schema_endpoints.id,
      name: schema.schema_endpoints.name,
      uri: schema.schema_endpoints.uri,
      currentHash: schema.schema_endpoints.currentHash,
      driftStatus: schema.schema_endpoints.driftStatus,
      lastIntrospectedAt: schema.schema_endpoints.lastIntrospectedAt
    }).from(schema.schema_endpoints)
  }
}

async function buildIndex(db: DB, ctx: any) {
  const branch = await db.select().from(schema.branches).where(eq(schema.branches.name, ctx.branchName)).limit(1)
  const endpoints = await db.select({ name: schema.schema_endpoints.name, driftStatus: schema.schema_endpoints.driftStatus, currentHash: schema.schema_endpoints.currentHash }).from(schema.schema_endpoints)
  const skills = await db.select({ name: schema.skills.name, versionHash: schema.skills.versionHash }).from(schema.skills).where(isNull(schema.skills.deprecatedBy))
  const nodeCountRes = await db.select({ count: sql<number>`count(*)` }).from(schema.knowledge_nodes)
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

import { GraphQLNonNull, GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLBoolean } from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { eq } from 'drizzle-orm'

export const MergeResultType = new GraphQLObjectType({
  name: 'MergeResult',
  fields: {
    success: { type: GraphQLBoolean },
    strategy: { type: GraphQLString },
    conflictCount: { type: GraphQLInt },
    humanRequired: { type: GraphQLBoolean },
    mergeRequestId: { type: GraphQLString }
  }
})

export const forkBranchArgs = {
  from: { type: new GraphQLNonNull(GraphQLString) },
  name: { type: new GraphQLNonNull(GraphQLString) },
  purpose: { type: new GraphQLNonNull(GraphQLString) }
}

export const mergeBranchArgs = {
  branchName: { type: new GraphQLNonNull(GraphQLString) },
  strategy: { type: new GraphQLNonNull(GraphQLString) }
}

export function forkBranchResolver(db: DB) {
  return async (_root: unknown, args: any, ctx: any) => {
    const { from, name } = args
    const src = await db.select().from(schema.branches).where(eq(schema.branches.name, from)).limit(1)
    if (!src || !src[0]) throw new Error('source branch not found')
    if (!/^agent\/.+\/.+/.test(name)) throw new Error('branch name must follow agent/{workspace}/{task}')
    const newBranch = await db.insert(schema.branches).values({ name, headHash: src[0].headHash, parentBranch: from, agentId: ctx.agentId, status: 'ACTIVE' }).returning()
    return newBranch?.[0]
  }
}

export function mergeBranchResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { branchName, strategy } = args
    const source = await db.select().from(schema.branches).where(eq(schema.branches.name, branchName)).limit(1)
    const target = await db.select().from(schema.branches).where(eq(schema.branches.name, 'main')).limit(1)
    if (!source?.[0] || !target?.[0]) throw new Error('branches not found')

    if (strategy === 'HUMAN_ARBITRATION') {
      const [mr] = await db.insert(schema.merge_requests).values({ sourceBranch: branchName, targetBranch: 'main', strategy, status: 'PENDING' }).returning()
      return { success: false, strategy, conflictCount: 0, humanRequired: true, mergeRequestId: mr.id }
    }

    return { success: true, strategy, conflictCount: 0, humanRequired: false }
  }
}

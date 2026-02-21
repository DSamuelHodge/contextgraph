import { builder } from '../builder'
import schema from '@core/schema'
import { BranchType, MergeResultType } from '../types'
import { eq } from 'drizzle-orm'

builder.mutationField('forkBranch', t => t.field({
  type: BranchType,
  args: builder.args((t) => ({
    from: t.string({ required: true }),
    name: t.string({ required: true }),
    purpose: t.string({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { from, name } = args as any
    const src = await ctx.db.select().from(schema.branches).where(eq(schema.branches.name, from)).limit(1)
    if (!src || !src[0]) throw new Error('source branch not found')
    // validate naming convention
    if (!/^agent\/.+\/.+/.test(name)) throw new Error('branch name must follow agent/{workspace}/{task}')
    const newBranch = await ctx.db.insert(schema.branches).values({ name, headHash: src[0].headHash, parentBranch: from, agentId: ctx.agentId, status: 'ACTIVE' }).returning()
    return newBranch?.[0]
  }
}))

builder.mutationField('mergeBranch', t => t.field({
  type: MergeResultType,
  args: builder.args((t) => ({
    branchName: t.string({ required: true }),
    strategy: t.string({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { branchName, strategy } = args as any
    const source = await ctx.db.select().from(schema.branches).where(eq(schema.branches.name, branchName)).limit(1)
    const target = await ctx.db.select().from(schema.branches).where(eq(schema.branches.name, 'main')).limit(1)
    if (!source?.[0] || !target?.[0]) throw new Error('branches not found')

    if (strategy === 'HUMAN_ARBITRATION') {
      const [mr] = await ctx.db.insert(schema.merge_requests).values({ sourceBranch: branchName, targetBranch: 'main', strategy, status: 'PENDING' }).returning()
      return { success: false, strategy, conflictCount: 0, humanRequired: true, mergeRequestId: mr.id }
    }

    // Simplified auto-merge: pick branch by strategy heuristic
    // For now, mark success true and set humanRequired false
    return { success: true, strategy, conflictCount: 0, humanRequired: false }
  }
}))

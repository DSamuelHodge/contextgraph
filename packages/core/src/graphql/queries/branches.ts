import { builder } from '../builder'
import schema from '@core/schema'
import { BranchType } from '../types'
import { eq, desc } from 'drizzle-orm'

builder.queryField('branches', t => t.field({
  type: [BranchType],
  resolve: async (_root, _args, ctx) => {
    const rows = await ctx.db.select().from(schema.branches).orderBy(desc(schema.branches.updatedAt))
    return rows.map((r: any) => ({
      ...r,
      headHash: r.headHash?.slice(0, 8)
    }))
  }
}))

builder.queryField('branch', t => t.field({
  type: BranchType,
  args: builder.args((t) => ({
    name: t.string({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { name } = args as any
    const row = await ctx.db.select().from(schema.branches).where(eq(schema.branches.name, name)).limit(1)
    const branch = row?.[0] ?? null
    if (!branch) return null
    const headCommit = await ctx.db.select().from(schema.memory_commits).where(eq(schema.memory_commits.hash, branch.headHash)).limit(1)
    return { ...branch, headCommit: headCommit?.[0] ?? null }
  }
}))

// Branch type defined in graphql/types

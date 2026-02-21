import { GraphQLNonNull, GraphQLString } from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { eq, desc } from 'drizzle-orm'

export const branchArgs = {
  name: { type: new GraphQLNonNull(GraphQLString) }
}

export function branchesResolver(db: DB) {
  return async () => {
    const rows = await db.select().from(schema.branches).orderBy(desc(schema.branches.updatedAt))
    return rows.map((r: any) => ({
      ...r,
      headHash: r.headHash?.slice(0, 8)
    }))
  }
}

export function branchResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { name } = args
    const row = await db.select().from(schema.branches).where(eq(schema.branches.name, name)).limit(1)
    const branch = row?.[0] ?? null
    if (!branch) return null
    const headCommit = await db.select().from(schema.memory_commits).where(eq(schema.memory_commits.hash, branch.headHash)).limit(1)
    return { ...branch, headCommit: headCommit?.[0] ?? null }
  }
}

import { builder } from '../builder'
import schema from '@core/schema'
import { SkillType, SkillSummaryType } from '../types'
import { eq, notInArray, lte, and, desc } from 'drizzle-orm'

builder.queryField('skill', t => t.field({
  type: SkillType,
  args: builder.args((t) => ({
    id: t.id({ required: true }),
    at: t.string()
  })),
  resolve: async (_root, args, ctx) => {
    const { id, at } = args as any
    if (at) {
      const res = await ctx.db.select().from(schema.skills)
        .where(and(eq(schema.skills.id, id), lte(schema.skills.createdAt, new Date(at))))
        .orderBy(desc(schema.skills.createdAt))
        .limit(1)
      return res?.[0] ?? null
    }
    const res = await ctx.db.select().from(schema.skills).where(eq(schema.skills.id, id)).limit(1)
    return res?.[0] ?? null
  }
}))

builder.queryField('skills', t => t.field({
  type: [SkillSummaryType],
  args: builder.args((t) => ({
    activeOnly: t.boolean()
  })),
  resolve: async (_root, args, ctx) => {
    const { activeOnly } = args as any
    if (activeOnly) {
      const deprecations = await ctx.db.select().from(schema.skill_deprecations)
      const deprecatedIds = deprecations.map((d: any) => d.skillId)
      // return name + proficiency + versionHash only
      if (deprecatedIds.length === 0) {
        return await ctx.db.select({ name: schema.skills.name, proficiency: schema.skills.proficiency, versionHash: schema.skills.versionHash }).from(schema.skills)
      }
      const rows = await ctx.db.select({ name: schema.skills.name, proficiency: schema.skills.proficiency, versionHash: schema.skills.versionHash })
        .from(schema.skills)
        .where(notInArray(schema.skills.id, deprecatedIds))
      return rows
    }
    const rows = await ctx.db.select({ name: schema.skills.name, proficiency: schema.skills.proficiency, versionHash: schema.skills.versionHash }).from(schema.skills)
    return rows
  }
}))

// SkillSummary type defined in graphql/types

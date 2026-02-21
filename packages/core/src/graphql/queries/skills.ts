import { GraphQLBoolean, GraphQLNonNull, GraphQLString } from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { eq, notInArray, lte, and, desc } from 'drizzle-orm'

export const skillArgs = {
  id: { type: new GraphQLNonNull(GraphQLString) },
  at: { type: GraphQLString }
}

export const skillsArgs = {
  activeOnly: { type: GraphQLBoolean }
}

export function skillResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { id, at } = args
    if (at) {
      const res = await db.select().from(schema.skills)
        .where(and(eq(schema.skills.id, id), lte(schema.skills.createdAt, new Date(at))))
        .orderBy(desc(schema.skills.createdAt))
        .limit(1)
      return res?.[0] ?? null
    }
    const res = await db.select().from(schema.skills).where(eq(schema.skills.id, id)).limit(1)
    return res?.[0] ?? null
  }
}

export function skillsResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { activeOnly } = args
    if (activeOnly) {
      const deprecations = await db.select().from(schema.skill_deprecations)
      const deprecatedIds = deprecations.map((d: any) => d.skillId)
      if (deprecatedIds.length === 0) {
        return await db.select({ name: schema.skills.name, proficiency: schema.skills.proficiency, versionHash: schema.skills.versionHash }).from(schema.skills)
      }
      return await db.select({ name: schema.skills.name, proficiency: schema.skills.proficiency, versionHash: schema.skills.versionHash })
        .from(schema.skills)
        .where(notInArray(schema.skills.id, deprecatedIds))
    }
    return await db.select({ name: schema.skills.name, proficiency: schema.skills.proficiency, versionHash: schema.skills.versionHash }).from(schema.skills)
  }
}

import { GraphQLNonNull, GraphQLString, GraphQLFloat } from 'graphql'
import type { DB } from '@core/db'
import schema from '@core/schema'
import { eq } from 'drizzle-orm'

export const updateProficiencyArgs = {
  skillId: { type: new GraphQLNonNull(GraphQLString) },
  delta: { type: new GraphQLNonNull(GraphQLFloat) },
  evidence: { type: new GraphQLNonNull(GraphQLString) }
}

export function updateProficiencyResolver(db: DB) {
  return async (_root: unknown, args: any) => {
    const { skillId, delta, evidence } = args
    const row = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).limit(1)
    const current = row?.[0]
    if (!current) throw new Error('skill not found')
    const newProficiency = Math.min(1.0, Math.max(0.0, (current.proficiency ?? 0) + delta))
    const newVersionHash = await (async () => {
      const enc = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', enc.encode((current.versionHash ?? '') + delta + Date.now().toString()))
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    })()

    const [newSkill] = await db.insert(schema.skills).values({ id: crypto.randomUUID(), name: current.name, versionHash: newVersionHash, parentHash: current.versionHash, implementation: current.implementation, proficiency: newProficiency, deprecatedBy: null }).returning()

    await db.insert(schema.skill_deprecations).values({ skillId: current.id, replacedById: newSkill.id, reason: evidence })

    return newSkill
  }
}

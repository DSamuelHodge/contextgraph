import { builder } from '../builder'
import schema from '@core/schema'
import { SkillType } from '../types'
import { eq } from 'drizzle-orm'

builder.mutationField('updateProficiency', t => t.field({
  type: SkillType,
  args: builder.args((t) => ({
    skillId: t.id({ required: true }),
    delta: t.float({ required: true }),
    evidence: t.string({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { skillId, delta, evidence } = args as any
    const row = await ctx.db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).limit(1)
    const current = row?.[0]
    if (!current) throw new Error('skill not found')
    const newProficiency = Math.min(1.0, Math.max(0.0, (current.proficiency ?? 0) + delta))
    const newVersionHash = await (async () => {
      const enc = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', enc.encode((current.versionHash ?? '') + delta + Date.now().toString()))
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    })()

    const [newSkill] = await ctx.db.insert(schema.skills).values({ id: crypto.randomUUID(), name: current.name, versionHash: newVersionHash, parentHash: current.versionHash, implementation: current.implementation, proficiency: newProficiency, deprecatedBy: null }).returning()

    await ctx.db.insert(schema.skill_deprecations).values({ skillId: current.id, replacedById: newSkill.id, reason: evidence })

    return newSkill
  }
}))

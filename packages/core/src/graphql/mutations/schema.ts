import { builder } from '../builder'
import schema from '@core/schema'
import { SyncResultType } from '../types'
import { eq } from 'drizzle-orm'

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema { types { name kind fields { name isDeprecated deprecationReason type { name kind ofType { name kind } } } } }
}
`

async function sha256Hex(input: string) {
  const enc = new TextEncoder()
  const data = enc.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

builder.mutationField('syncSchema', t => t.field({
  type: SyncResultType,
  args: builder.args((t) => ({
    endpointId: t.id({ required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const { endpointId } = args as any
    const rows = await ctx.db.select().from(schema.schema_endpoints).where(eq(schema.schema_endpoints.id, endpointId)).limit(1)
    const endpoint = rows?.[0]
    if (!endpoint) throw new Error('endpoint not found')

    const resp = await fetch(endpoint.uri, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: INTROSPECTION_QUERY }) })
    const text = await resp.text()
    const liveHash = await sha256Hex(text)

    if (liveHash === endpoint.currentHash) {
      // update only lastIntrospectedAt
      await ctx.db.update(schema.schema_endpoints).set({ lastIntrospectedAt: new Date() }).where(eq(schema.schema_endpoints.id, endpointId))
      return { endpointId, driftStatus: 'SYNCHRONIZED', severity: null, affectedBranchNames: [], recommendedAction: 'none' }
    }

    // naive diff: detect added/removed strings
    const oldSnapshot = endpoint.typeMapSnapshot ? JSON.stringify(endpoint.typeMapSnapshot) : ''
    let severity: string = 'ADDITIVE_DRIFT'
    if (oldSnapshot && !text.includes(oldSnapshot)) severity = 'BREAKING_DRIFT'

    await ctx.db.update(schema.schema_endpoints).set({ previousHash: endpoint.currentHash, currentHash: liveHash, driftStatus: severity, typeMapSnapshot: text, lastIntrospectedAt: new Date() }).where(eq(schema.schema_endpoints.id, endpointId))

    const branchNames = endpoint.previousHash
      ? (await ctx.db.select({ branchName: schema.memory_commits.branchName })
        .from(schema.memory_commits)
        .where(eq(schema.memory_commits.schemaHash, endpoint.previousHash))
        .groupBy(schema.memory_commits.branchName)).map((r: any) => r.branchName)
      : []
    return { endpointId, driftStatus: severity, severity, affectedBranchNames: branchNames, recommendedAction: severity === 'BREAKING_DRIFT' ? 'pause-notify' : 'auto-sync' }
  }
}))

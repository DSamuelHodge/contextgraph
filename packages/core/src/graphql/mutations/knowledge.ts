import { builder } from '../builder'
import schema from '@core/schema'
import { MemoryCommitType, JsonScalar } from '../types'
import { eq } from 'drizzle-orm'

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder()
  const data = enc.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return toHex(hashBuffer)
}

builder.mutationField('commitKnowledge', t => t.field({
  type: MemoryCommitType,
  args: builder.args((t) => ({
    input: t.field({ type: JsonScalar, required: true })
  })),
  resolve: async (_root, args, ctx) => {
    const input = args.input as any
    // Precompute hashes off-DB
    const versionHash = await sha256Hex(input.claim + input.topic)
    const metadata = {
      author: ctx.agentId,
      createdAt: new Date().toISOString(),
      commitMessage: input.commitMessage,
      evidenceRefs: input.evidenceRefs ?? [],
      taskContractRef: input.taskContractRef ?? null
    }
    const nodePayload = { topic: input.topic, claim: input.claim, versionHash, parentHash: input.parentHash ?? null, isomorphisms: input.isomorphisms ?? [], metadata }
    const commitHash = await sha256Hex(JSON.stringify(nodePayload) + ctx.branchName + Date.now().toString())

    const currentBranchRes = await ctx.db.select().from(schema.branches).where(eq(schema.branches.name, ctx.branchName)).limit(1)
    const currentBranch = currentBranchRes?.[0]
    const currentSchemaHash = (await ctx.db.select().from(schema.schema_endpoints).limit(1))?.[0]?.currentHash ?? 'unknown'

    return await ctx.db.transaction(async tx => {
      const [node] = await tx.insert(schema.knowledge_nodes).values({ id: crypto.randomUUID(), commitHash, topic: nodePayload.topic, claim: nodePayload.claim, versionHash: nodePayload.versionHash, parentHash: nodePayload.parentHash, isomorphisms: nodePayload.isomorphisms, metadata: nodePayload.metadata }).returning()

      const [commit] = await tx.insert(schema.memory_commits).values({ hash: commitHash, parentHash: currentBranch?.headHash ?? null, branchName: ctx.branchName, author: 'AGENT', message: input.commitMessage, schemaHash: currentSchemaHash, snapshot: { nodeId: node.id, versionHash } }).returning()

      await tx.update(schema.branches).set({ headHash: commitHash, updatedAt: new Date() }).where(eq(schema.branches.name, ctx.branchName))

      return commit
    })
  }
}))

import { EngineEventEmitter } from '../../../packages/core/src/engine'
import { createDb } from './db'
import { buildContextIndexPayload, serializeContextIndex } from './context-index'
import { createEngine } from './engine-factory'

export type DriftQueueMessage = {
  endpointId: string
  branchName: string
  agentIds?: string[]
  otherBranches?: string[]
}

export async function handleDriftQueue(batch: MessageBatch<DriftQueueMessage>, env: Env) {
  const db = createDb(env)
  const events = new EngineEventEmitter()

  events.onHumanRequired(async (event) => {
    if (!env.HUMAN_REQUIRED_WEBHOOK) return
    await fetch(env.HUMAN_REQUIRED_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event)
    })
  })

  const buildIndex = async (dbInstance: typeof db, agentId: string, branchName: string) => {
    const payload = await buildContextIndexPayload(dbInstance, agentId, branchName)
    return serializeContextIndex(payload)
  }

  const engine = createEngine(db, buildIndex, events)

  for (const message of batch.messages) {
    const payload = message.body
    await engine.onSchemaChange(payload.endpointId)
    await engine.runMaintenance(payload.branchName)

    if (payload.otherBranches?.length) {
      for (const target of payload.otherBranches) {
        await engine.onMergeAttempt(payload.branchName, target)
      }
    }

    if (payload.agentIds?.length) {
      for (const agentId of payload.agentIds) {
        const index = await engine.buildContextIndex(agentId, payload.branchName)
        const cacheKey = `context-index:${agentId}:${payload.branchName}`
        await env.CONTEXT_INDEX.put(cacheKey, index, { expirationTtl: 60 })
      }
    }

    message.ack()
  }
}

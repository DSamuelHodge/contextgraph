import { Hono } from 'hono'
import { createYoga } from 'graphql-yoga'
import { buildContextGraphSchema } from '../../../packages/core/src/graphql/schema'
import schema from '../../../packages/core/src/schema'
import { createDb, type DB } from './db'
import { buildContextIndexPayload, serializeContextIndex } from './context-index'
import { createEngine, getEngineEventBus, type BuildIndexFn } from './engine-factory'
import { authMiddleware } from './middleware/auth'
import { pushMiddleware } from './middleware/push'
import { oracleMiddleware } from './middleware/oracle'
import { handleDriftQueue } from './drift-consumer'
import { AgentSessionDO } from './AgentSessionDO'
import type { ContextGraphEngine } from '../../../packages/core/src/engine'
import { dashboardHandler } from './routes/dashboard'
import { CloudflareAnalyticsBackend } from './telemetry/cf-analytics'
import { ClickHouseBackend } from './telemetry/clickhouse-backend'
import { OtelBridge } from './telemetry/otel-bridge'
import { CompositeBackend, NoopBackend, type TelemetryBackend } from '@core/telemetry'

export type AppOptions = {
  skipAuth?: boolean
  skipOracle?: boolean
  buildIndex?: BuildIndexFn
  createDb?: (env: Env) => DB
}

type AppBindings = {
  Bindings: Env
  Variables: {
    db: DB
    engine: ContextGraphEngine
    agentId: string
    branchName: string
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildTelemetryBackend(env: Env): TelemetryBackend {
  const mode = env.TELEMETRY_BACKEND ?? 'both'
  const backends: TelemetryBackend[] = []

  if ((mode === 'cloudflare' || mode === 'both') && env.ANALYTICS) {
    backends.push(new CloudflareAnalyticsBackend(env.ANALYTICS))
  }

  if ((mode === 'clickhouse' || mode === 'both') && env.CLICKHOUSE_HOST && env.CLICKHOUSE_USER && env.CLICKHOUSE_PASSWORD) {
    backends.push(
      new ClickHouseBackend({
        host: env.CLICKHOUSE_HOST,
        database: env.CLICKHOUSE_DATABASE ?? 'contextgraph',
        username: env.CLICKHOUSE_USER,
        password: env.CLICKHOUSE_PASSWORD,
        workspaceId: env.WORKSPACE_ID ?? 'default',
        batchSize: parsePositiveInt(env.CLICKHOUSE_BATCH_SIZE, 50),
        flushIntervalMs: parsePositiveInt(env.CLICKHOUSE_FLUSH_INTERVAL_MS, 5000)
      })
    )
  }

  if (mode === 'otel' || mode === 'both') {
    backends.push(new OtelBridge())
  }

  if (backends.length === 0) {
    return new NoopBackend()
  }

  return backends.length === 1 ? backends[0] : new CompositeBackend(backends)
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppBindings>()
  const eventBus = getEngineEventBus()
  let telemetryConfigured = false
  const createDbFn = options.createDb ?? createDb
  const buildIndexFn: BuildIndexFn = options.buildIndex ?? (async (db, agentId, branchName) => {
    const payload = await buildContextIndexPayload(db, agentId, branchName)
    return serializeContextIndex(payload)
  })

  app.use('*', async (c, next) => {
    if (!telemetryConfigured) {
      eventBus.setTelemetry(buildTelemetryBackend(c.env))
      telemetryConfigured = true
    }

    const agentId = c.req.header('x-agent-id') ?? ''
    const branchName = c.req.header('x-branch-name') ?? 'main'
    c.set('agentId', agentId)
    c.set('branchName', branchName)

    const db = createDbFn(c.env)
    const engine = createEngine(db, buildIndexFn, eventBus)
    c.set('db', db)
    c.set('engine', engine)

    await next()
  })

  if (!options.skipAuth) {
    app.use('*', authMiddleware)
  }

  app.use('*', pushMiddleware)

  if (!options.skipOracle) {
    app.use('*', oracleMiddleware)
  }

  app.all('/graphql', async (c) => {
    const db = c.get('db')
    const schema = buildContextGraphSchema(db as any)
    const yoga = createYoga({
      schema,
      context: {
        agentId: c.get('agentId'),
        branchName: c.get('branchName'),
        db
      }
    })

    return yoga.fetch(c.req.raw, { env: c.env })
  })

  app.post('/agent/session', async (c) => {
    const agentId = c.get('agentId')
    const body = (await c.req.json().catch(() => ({}))) as { branch?: string }
    const branchName = body.branch ?? c.get('branchName')

    const id = c.env.AGENT_SESSION.idFromName(agentId)
    const stub = c.env.AGENT_SESSION.get(id)
    await stub.fetch('https://do/session', {
      method: 'POST',
      body: JSON.stringify({ branchName })
    })

    const index = await c.get('engine').buildContextIndex(agentId, branchName)
    return c.json({ agentId, branch: branchName, index })
  })

  app.get('/health', async (c) => {
    const db = c.get('db')
    const endpoints = await db.select().from(schema.schema_endpoints)
    return c.json({ status: 'ok', endpoints })
  })

  app.get('/dashboard', async (c) => {
    return dashboardHandler(c.req.raw, c.env)
  })

  app.post('/webhooks/schema-change', async (c) => {
    const payload = (await c.req.json()) as { endpointId: string; branchName: string; agentIds?: string[] }
    await c.env.DRIFT_QUEUE.send(payload)
    return c.json({ queued: true })
  })

  return app
}

const app = createApp()

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch, env: Env) => handleDriftQueue(batch as any, env)
}

export { AgentSessionDO }

import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import schema from '../../../../packages/core/src/schema'
import type { DB } from '../db'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const agentId = c.get('agentId')
  if (!agentId) {
    return c.json({ error: 'Missing x-agent-id header.' }, 401)
  }

  const db = c.get('db') as DB
  const allowed = await db
    .select({ id: schema.schema_endpoints.id })
    .from(schema.schema_endpoints)
    .where(eq(schema.schema_endpoints.name, agentId))
    .limit(1)

  if (!allowed.length) {
    return c.json({ error: 'Unauthorized agent.' }, 401)
  }

  await next()
}

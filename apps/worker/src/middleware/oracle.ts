import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import schema from '../../../../packages/core/src/schema'
import type { DB } from '../db'

export const oracleMiddleware: MiddlewareHandler = async (c, next) => {
  const db = c.get('db') as DB
  const breaking = await db
    .select({ id: schema.schema_endpoints.id })
    .from(schema.schema_endpoints)
    .where(eq(schema.schema_endpoints.driftStatus, 'BREAKING_DRIFT'))
    .limit(1)

  if (breaking.length) {
    c.header('x-contextgraph-warning', 'BREAKING_DRIFT')
  }

  await next()
}

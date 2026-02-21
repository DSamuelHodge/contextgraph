import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from '../../../packages/core/src/schema'

export function createDb(env: Env) {
  const client = new Pool({ connectionString: env.HYPERDRIVE.connectionString })
  return drizzle(client, { schema })
}

export type DB = ReturnType<typeof createDb>

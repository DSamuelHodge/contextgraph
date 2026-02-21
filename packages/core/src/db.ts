import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@core/schema'

export type HyperdriveBinding = { connectionString: string }

export function createDb(connectionOrHyperdrive: string | HyperdriveBinding) {
  const connectionString = typeof connectionOrHyperdrive === 'string'
    ? connectionOrHyperdrive
    : connectionOrHyperdrive.connectionString
  const client = postgres(connectionString)
  return drizzle(client, { schema })
}

export type DB = ReturnType<typeof createDb>

import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@core/schema'

export type HyperdriveBinding = { connectionString: string }

export function createDb(connectionOrHyperdrive: string | HyperdriveBinding) {
  const connectionString = typeof connectionOrHyperdrive === 'string'
    ? connectionOrHyperdrive
    : connectionOrHyperdrive.connectionString
  return drizzle(connectionString, { schema })
}

export type DB = ReturnType<typeof createDb>

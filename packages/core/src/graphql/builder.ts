import SchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import type { DB } from '@core/db'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { TablesRelationalConfig } from 'drizzle-orm'

interface ContextType {
  agentId: string
  branchName: string
  db: DB
}

const relations = {} as TablesRelationalConfig
const getTableConfigSafe = (table: any) => getTableConfig(table)

export const builder = new SchemaBuilder<{
  DrizzleSchema: typeof import('@core/schema')
  DrizzleRelations: typeof relations
  Scalars: {
    JSON: { Input: unknown; Output: unknown }
  }
  Context: ContextType
}>({
  plugins: [DrizzlePlugin],
  drizzle: {
    client: (ctx: ContextType) => ctx.db as any,
    getTableConfig: getTableConfigSafe,
    relations
  }
})

builder.queryType({})
builder.mutationType({})

export default builder

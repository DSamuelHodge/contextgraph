import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './packages/core/src/schema/index.ts',
  out: './packages/core/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})

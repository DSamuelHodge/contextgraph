import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@core/schema': path.resolve(__dirname, 'src/schema/index.ts'),
      '@core/types': path.resolve(__dirname, 'src/types/index.ts'),
      '@core/db': path.resolve(__dirname, 'src/db.ts')
    }
  },
  test: {
    environment: 'node'
  }
})

#!/usr/bin/env node
import { runCli } from '../src/cli'

runCli(process.argv.slice(2)).catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

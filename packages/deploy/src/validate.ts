import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { ContextGraphConfig } from './config'

export type ExecFn = (command: string, args?: string[]) => Promise<string>

export type ValidateResult = {
  config: ContextGraphConfig
  configPath: string
  workerName: string
}

export async function loadConfig(configPath: string): Promise<ContextGraphConfig> {
  const fileUrl = pathToFileURL(configPath).href
  const mod = await import(fileUrl)
  return (mod.default ?? mod.config ?? mod) as ContextGraphConfig
}

export async function validateEnvironment(rootDir: string, exec: ExecFn): Promise<ValidateResult> {
  const configPath = path.join(rootDir, 'contextgraph.config.ts')
  await access(configPath, fsConstants.R_OK)

  const config = await loadConfig(configPath)
  validateConfigShape(config)

  await exec('neonctl', ['--version'])
  await exec('wrangler', ['--version'])

  const workerName = await resolveWorkerName(rootDir, exec)
  await ensureWorkerNameAvailable(exec, workerName)

  return { config, configPath, workerName }
}

export function validateConfigShape(config: ContextGraphConfig) {
  if (!config.agent?.id || !config.agent?.defaultBranch) {
    throw new Error('Invalid config: agent.id and agent.defaultBranch are required.')
  }
  if (!config.pushContext || typeof config.pushContext.maxTokens !== 'number') {
    throw new Error('Invalid config: pushContext.maxTokens is required.')
  }
  if (!config.driftPolicy?.corruption) {
    throw new Error('Invalid config: driftPolicy.corruption is required.')
  }
}

async function resolveWorkerName(rootDir: string, exec: ExecFn) {
  const wranglerPath = path.join(rootDir, 'apps', 'worker', 'wrangler.jsonc')
  const raw = await readFile(wranglerPath, 'utf-8')
  const match = raw.match(/"name"\s*:\s*"([^"]+)"/)
  if (!match) {
    throw new Error('Unable to determine worker name from wrangler.jsonc')
  }
  return match[1]
}

async function ensureWorkerNameAvailable(exec: ExecFn, workerName: string) {
  const raw = await exec('wrangler', ['list', '--json'])
  let list: Array<{ name?: string }> = []
  try {
    list = JSON.parse(raw)
  } catch {
    throw new Error('Unable to parse wrangler list output.')
  }

  if (list.some((entry) => entry.name === workerName)) {
    throw new Error(`Worker name already exists: ${workerName}.`) 
  }
}

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import { validateEnvironment, type ExecFn } from './validate'

const execFileAsync = promisify(execFile)

export async function runCli(argv: string[], cwd = process.cwd()) {
  const [command] = argv
  if (!command || command === 'help' || command === '--help') {
    printHelp()
    return
  }

  if (command !== 'deploy') {
    throw new Error(`Unknown command: ${command}`)
  }

  const exec: ExecFn = async (cmd, args = []) => {
    const { stdout } = await execFileAsync(cmd, args, { cwd })
    return stdout.trim()
  }

  const { config, workerName } = await validateEnvironment(cwd, exec)
  logStep('NEON_PROVISION', 'Provisioning Neon project...')
  const neon = await exec('neonctl', ['projects', 'create', '--output', 'json'])
  const neonPayload = JSON.parse(neon) as { connection_uri?: string; connectionUri?: string }
  const connectionUri = neonPayload.connection_uri ?? neonPayload.connectionUri
  if (!connectionUri) {
    throw new Error('Neon provisioning did not return a connection URI.')
  }

  logStep('HYPERDRIVE_CREATE', 'Creating Hyperdrive binding...')
  const hyperdriveRaw = await exec('wrangler', ['hyperdrive', 'create', workerName, '--connection-string', connectionUri, '--json'])
  const hyperdrivePayload = JSON.parse(hyperdriveRaw) as { id?: string }
  if (!hyperdrivePayload.id) {
    throw new Error('Hyperdrive creation did not return an ID.')
  }

  logStep('CONFIG_PATCH', 'Patching wrangler.jsonc bindings...')
  const kvId = await createKvNamespace(exec, 'CONTEXT_INDEX')
  const kvPreviewId = await createKvNamespace(exec, 'CONTEXT_INDEX', true)
  await patchWranglerConfig(cwd, {
    HYPERDRIVE_ID: hyperdrivePayload.id,
    CONTEXT_INDEX_ID: kvId,
    CONTEXT_INDEX_PREVIEW_ID: kvPreviewId
  })

  logStep('MIGRATE', 'Running Drizzle migrations...')
  await exec('pnpm', ['-w', 'run', 'db:migrate'])

  logStep('WORKER_DEPLOY', 'Deploying Worker...')
  await exec('wrangler', ['deploy', '--env', 'production'])

  console.log(chalk.green('✅ ContextGraph deployed'))
  console.log(`   Worker:   https://${workerName}.workers.dev`)
  console.log(`   GraphQL:  https://${workerName}.workers.dev/graphql`)
  console.log(`   Neon DB:  ${new URL(connectionUri).host} (connection string in .env.local — never committed)`)
  console.log('\n   Next: Add oracle endpoints to contextgraph.config.ts')
}

async function createKvNamespace(exec: ExecFn, name: string, preview = false) {
  const args = ['kv:namespace', 'create', name, '--json']
  if (preview) args.push('--preview')
  const raw = await exec('wrangler', args)
  const payload = JSON.parse(raw) as { id?: string }
  if (!payload.id) {
    throw new Error('KV namespace creation did not return an ID.')
  }
  return payload.id
}

async function patchWranglerConfig(rootDir: string, replacements: Record<string, string>) {
  const configPath = path.join(rootDir, 'apps', 'worker', 'wrangler.jsonc')
  let content = await readFile(configPath, 'utf-8')

  for (const [placeholder, value] of Object.entries(replacements)) {
    const token = new RegExp(placeholder, 'g')
    content = content.replace(token, value)
  }

  await writeFile(configPath, content, 'utf-8')
}

function logStep(step: string, message: string) {
  console.log(chalk.blue(`[${step}]`), message)
}

function printHelp() {
  console.log('Usage: contextgraph deploy')
}

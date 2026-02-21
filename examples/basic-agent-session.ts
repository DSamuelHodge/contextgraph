import { ContextGraphClient } from '../packages/core/src/sdk/client'

async function run() {
  const client = new ContextGraphClient({
    workerUrl: 'https://contextgraph.workers.dev',
    agentId: 'agent-1',
    branch: 'agent/workspace/task'
  })

  const session = await client.resume()
  await client.gql('query { branches { name } }')

  await client.commit({
    topic: 'pricing',
    claim: 'Prices updated to v2',
    commitMessage: 'capture pricing change',
    evidenceRefs: ['doc:pricing-v2']
  })

  await client.close('complete task')
  console.log(session.index)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

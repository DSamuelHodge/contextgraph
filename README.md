ContextGraph is a self-operational memory layer for AI agents: typed, versioned, and continuously synchronized with your live GraphQL schema.

## Why Not a Vector Database
- Vector DBs cannot model append-only provenance chains for audit-grade memory.
- They do not enforce schema drift detection against live GraphQL oracles.
- They lack autonomous behaviors like decay, collision, and convergence.

## The Five Behaviors

| Name | What It Detects | Human Required? |
| --- | --- | --- |
| DRIFT | Schema changes against live GraphQL oracles | Only for corruption |
| COLLISION | Conflicting knowledge writes | EPISTEMIC, POLICY_CONFLICT |
| DECAY | Stale or unverifiable knowledge | No |
| CONVERGENCE | Independent agreement on claims | No |
| PROVENANCE | Causal chain of every claim | No |

## Quickstart
```bash
git clone https://github.com/contextgraph/contextgraph
cp contextgraph.config.example.ts contextgraph.config.ts
# edit: add your agent ID and one GraphQL endpoint URL
# ContextGraph introspects the rest automatically
npx contextgraph deploy
```

## First Agent Session
```ts
import { ContextGraphClient } from '@contextgraph/core'

const client = new ContextGraphClient({
  workerUrl: 'https://contextgraph.workers.dev',
  agentId: 'agent-1'
})

await client.resume()
await client.gql('query { branches { name } }')
await client.commit({ topic: 'pricing', claim: 'v2 pricing', commitMessage: 'capture pricing change' })
await client.close('done')
```

## Architecture
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

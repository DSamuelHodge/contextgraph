# Migration: Pothos -> drizzle-graphql

Branch: `migrate/pothos-to-drizzle-graphql`
Affects: `packages/core` only - engine and worker untouched
Prompt continuity: handoff JSON unchanged except dependencies

---

## 1. Dependency Changes
**`packages/core/package.json`**
```diff
- "@pothos/core": "...",
- "@pothos/plugin-drizzle": "...",
+ "drizzle-graphql": "latest",
  "graphql": "...",          // keep - now used directly
  "graphql-yoga": "..."      // keep
```
Run after: `pnpm install`

---

## 2. Delete Entirely
```
packages/core/src/graphql/builder.ts        <- entire file
packages/core/src/graphql/types/index.ts    <- entire file
```

---

## 3. Rewrite: `graphql/schema.ts`
Replace Pothos assembly with:
```typescript
import { buildSchema } from 'drizzle-graphql'
import { GraphQLSchema, GraphQLObjectType,
         GraphQLNonNull, GraphQLString, GraphQLList } from 'graphql'
import type { DB } from '@core/db'
import { contextIndexResolver, ContextIndexType } from './queries/context'
import { syncSchemaResolver, SyncResultType } from './mutations/schema'
import { commitKnowledgeResolver, commitKnowledgeArgs } from './mutations/knowledge'
import { forkBranchResolver, forkBranchArgs } from './mutations/branches'
import { mergeBranchResolver, mergeBranchArgs, MergeResultType } from './mutations/branches'
import { updateProficiencyResolver, updateProficiencyArgs } from './mutations/skills'
import { historyResolver, knowledgeAtResolver } from './queries/knowledge'

export function buildContextGraphSchema(db: DB) {
  const { entities } = buildSchema(db)

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        // Generated
        branches:        entities.queries.branches,
        branch:          entities.queries.branchesSingle,
        skills:          entities.queries.skills,
        skill:           entities.queries.skillsSingle,
        knowledgeBase:   entities.queries.knowledgeNodes,
        memoryCommits:   entities.queries.memoryCommits,
        schemaEndpoints: entities.queries.schemaEndpoints,
        // Custom - push boundary, cannot be generated
        contextIndex:    { type: ContextIndexType,
                           resolve: contextIndexResolver(db) },
        // Custom - temporal + provenance
        knowledgeAt:     { type: new GraphQLList(entities.types.KnowledgeNodesItem),
                           args: { branchName: { type: new GraphQLNonNull(GraphQLString) },
                                   at: { type: new GraphQLNonNull(GraphQLString) } },
                           resolve: knowledgeAtResolver(db) },
        history:         { type: new GraphQLList(entities.types.MemoryCommitsItem),
                           args: { nodeId: { type: new GraphQLNonNull(GraphQLString) } },
                           resolve: historyResolver(db) }
      }
    }),
    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        // Custom only - generated mutations bypass append-only guarantee
        syncSchema:        { type: SyncResultType,
                             args: { endpointId: { type: new GraphQLNonNull(GraphQLString) } },
                             resolve: syncSchemaResolver(db) },
        commitKnowledge:   { type: entities.types.MemoryCommitsItem,
                             args: commitKnowledgeArgs,
                             resolve: commitKnowledgeResolver(db) },
        forkBranch:        { type: entities.types.BranchesItem,
                             args: forkBranchArgs,
                             resolve: forkBranchResolver(db) },
        mergeBranch:       { type: MergeResultType,
                             args: mergeBranchArgs,
                             resolve: mergeBranchResolver(db) },
        updateProficiency: { type: entities.types.SkillsItem,
                             args: updateProficiencyArgs,
                             resolve: updateProficiencyResolver(db) }
      }
    }),
    types: [
      ...Object.values(entities.types),
      ...Object.values(entities.inputs)
    ]
  })
}
```

---

## 4. Update Resolver Files (return type references only)

Each custom resolver file currently imports Pothos types.
Replace with `graphql-js` equivalents:

| File | Remove | Add |
|---|---|---|
| `queries/context.ts` | `builder.objectType(...)` | `new GraphQLObjectType({ name: 'ContextIndex', fields: {...} })` |
| `mutations/branches.ts` | Pothos arg builders | `GraphQLNonNull(GraphQLString)` args inline |
| All others | `t.field(...)` pattern | plain `resolve: async (_, args, ctx) =>` function |

Resolver **logic** (DB calls, hash computation, transaction) is unchanged.
Only the **registration wrapper** changes.

---

## 5. Update Tests

**`graphql/schema.test.ts`** - Test 3 changes:
```diff
- // Pothos introspection
- const fields = schema.getType('SchemaEndpoint')
+ // drizzle-graphql generates 'SchemaEndpointItem' not 'SchemaEndpoint'
+ const fields = schema.getType('SchemaEndpointItem')
  expect(fields).not.toHaveProperty('typeMapSnapshot')
```

Generated type names follow `{TableName}Item` convention from
`drizzle-graphql`. Update any test that references type names.

---

## 6. Verify Append-Only Safety

Generated mutations are intentionally excluded from the mutation
root. Confirm this by adding one test:

```typescript
it('exposes no generated delete or update mutations', () => {
  const mutationType = schema.getMutationType()
  const fields = mutationType?.getFields() ?? {}
  const forbidden = Object.keys(fields).filter(
    f => f.includes('Delete') || f.includes('Update')
  )
  expect(forbidden).toHaveLength(0)
})
```

---

## 7. Validation Sequence
```bash
pnpm install                    # picks up drizzle-graphql, drops pothos
cd packages/core
pnpm tsc --noEmit               # must pass - no Pothos imports remain
pnpm vitest run                 # all tests including new append-only test
```

---

## Completion Criteria
- [ ] Zero `@pothos` imports anywhere in packages/core
- [ ] `buildContextGraphSchema(db)` exported from `graphql/schema.ts`
- [ ] `contextIndex` resolver enforces 200-token budget
- [ ] `typeMapSnapshot` absent from all exposed GraphQL types
- [ ] Generated delete/update mutations not in schema root
- [ ] All tests pass

This is a prompt engineering problem as much as an architecture problem. The failure mode to avoid: prompts that are either too atomic (agent loses architectural context) or too broad (cognitive overload, hallucinated shortcuts). Each prompt must carry *just enough* prior context to orient the agent, and hand off *just enough* forward context to set up the next prompt.

The structure: each prompt has a **Role**, **Prior Context** (what the agent already built), **Current Task** (single focused objective), and **Handoff** (what to preserve for the next prompt).

---

## The 10 ContextGraph Build Prompts

---

### Prompt 1: Repository Scaffold + Core Types

```markdown
# ContextGraph — Prompt 1 of 10: Repository Scaffold

## What ContextGraph Is (Read Once, Hold in Context)
ContextGraph is NOT a vector database or a session logger.
It is a self-operational memory layer with five autonomous behaviors:
1. DRIFT — detects when live GraphQL schemas change under the agent
2. COLLISION — resolves conflicts when agents write incompatible knowledge  
3. DECAY — tombstones knowledge that is likely stale
4. CONVERGENCE — promotes knowledge independently reached by multiple agents
5. PROVENANCE — records the causal chain of how every piece of knowledge was derived

The memory spine is git-inspired (append-only commits, named branches).
The live oracle is a GraphQL introspection endpoint.
Context is PUSHED (never retrieved) to keep token usage under 200 tokens.

## Current Task: Scaffold the Monorepo
Initialize the following structure with proper tooling:

```
contextgraph/
├── packages/
│   ├── core/          # Framework-agnostic runtime
│   └── deploy/        # One-click deployment CLI
├── apps/
│   └── worker/        # Cloudflare Worker host
├── package.json       # pnpm workspaces
├── tsconfig.base.json
└── CONTRIBUTING.md    # OSS-first: contribution guide
```

Stack decisions (do not deviate):
- pnpm workspaces (not npm, not yarn)
- TypeScript strict mode throughout
- Biome for lint/format (not ESLint/Prettier — single tool)
- Vitest for testing

## Deliverables
1. Root `package.json` with workspace config
2. `tsconfig.base.json` with strict settings
3. Each package/app with its own `package.json` and `tsconfig.json`
4. `CONTRIBUTING.md` explaining the five self-operational behaviors
5. `.github/ISSUE_TEMPLATE/` with templates for: bug, feature, 
   new-oracle-integration

## Handoff to Next Prompt
After completing, output a single JSON block:
{
  "completed": "scaffold",
  "packageNames": ["@contextgraph/core", "@contextgraph/deploy", 
                   "contextgraph-worker"],
  "tsAliases": [],  // populate as added
  "nextPrompt": "drizzle-schema"
}
```

---

### Prompt 2: Drizzle Schema + Migrations

```markdown
# ContextGraph — Prompt 2 of 10: Data Layer

## Handoff Received
{
  "completed": "scaffold",
  "packageNames": ["@contextgraph/core", "@contextgraph/deploy", 
                   "contextgraph-worker"]
}

## Architectural Constraint (Critical)
Every table except `branches` is APPEND-ONLY.
Memory is never mutated — only extended.
This is how git achieves integrity and we replicate it exactly.
Violation of this constraint breaks PROVENANCE.

## Current Task: Drizzle Schema in `packages/core/src/schema/`

Implement these tables with full TypeScript inference:

### Tables
1. `memory_commits` — The git log. Every memory event is a commit.
   Fields: hash (PK, sha256), parentHash, branchName, author 
   (enum: HUMAN|AGENT|SYSTEM), message, schemaHash, snapshot (jsonb),
   createdAt

2. `branches` — Mutable branch pointers (ONLY mutable table).
   Fields: name (PK), headHash, parentBranch, agentId, 
   status (enum: ACTIVE|MERGED|ABANDONED|AWAITING_REVIEW),
   createdAt, updatedAt

3. `knowledge_nodes` — Immutable knowledge units.
   Fields: id (uuid), commitHash, topic, claim, versionHash, 
   parentHash (null = genesis), isomorphisms (jsonb, default []),
   metadata (jsonb)

4. `skills` — Versioned agent capabilities.
   Fields: id (uuid), name, versionHash, parentHash, 
   implementation (jsonb — typed CapabilityImpl union), 
   proficiency (real, default 0.5), deprecatedBy, createdAt

5. `schema_endpoints` — Live oracle registry.
   Fields: id (uuid), name, uri, currentHash, previousHash,
   driftStatus (enum: SYNCHRONIZED|ADDITIVE_DRIFT|BREAKING_DRIFT|
   UNKNOWN|CORRUPTION), typeMapSnapshot (jsonb), lastIntrospectedAt

### TypeScript Types (co-locate with schema)
Export these types from `packages/core/src/types/`:
- `DriftEvent` with severity ladder
- `CollisionClass` discriminated union
- `CapabilityImpl` discriminated union 
  (PromptFragment | GraphQLOperation | MCPToolRef | WasmModule)
- `ProvenanceChain`
- `ConvergenceScore`

## Deliverables
1. `packages/core/src/schema/index.ts` — all Drizzle table definitions
2. `packages/core/src/types/index.ts` — all TypeScript types
3. `packages/core/src/db.ts` — db client factory (accepts connection string)
4. Initial Drizzle migration file
5. `packages/core/src/schema/index.test.ts` — Vitest tests verifying:
   - append-only constraint (no UPDATE on commits/nodes/skills)
   - enum exhaustiveness on DriftEvent severity

## Handoff to Next Prompt
{
  "completed": "drizzle-schema",
  "tables": ["memory_commits", "branches", "knowledge_nodes", 
             "skills", "schema_endpoints"],
  "exportedTypes": ["DriftEvent", "CollisionClass", "CapabilityImpl",
                    "ProvenanceChain", "ConvergenceScore"],
  "nextPrompt": "graphql-schema"
}
```

---

### Prompt 3: Pothos GraphQL Schema

```markdown
# ContextGraph — Prompt 3 of 10: GraphQL Layer

## Handoff Received
{
  "completed": "drizzle-schema",
  "tables": ["memory_commits", "branches", "knowledge_nodes", 
             "skills", "schema_endpoints"],
  "exportedTypes": ["DriftEvent", "CollisionClass", "CapabilityImpl",
                    "ProvenanceChain", "ConvergenceScore"]
}

## Critical Architectural Rule: Push Over Pull
The `contextIndex` query is the ONLY query that runs automatically 
at session start. It is PUSHED into agent context — the agent does 
not decide to call it.

All other queries are lazy (agent-initiated after seeing the index).
Target: contextIndex response must be serializable to under 200 tokens.

## Current Task: Pothos Schema in `packages/core/src/graphql/`

### Builder Setup
- Use `@pothos/core` + `@pothos/plugin-drizzle`
- Context type: `{ agentId: string; branchName: string; db: DrizzleDB }`

### Queries to Implement
1. `contextIndex` — Returns compressed index only:
   agentId, branch, headHash (8 chars), endpoint names + driftStatus 
   only (NOT typeMap), skill names + versions only (NOT implementation),
   knowledgeCount (Int)

2. `skill(id, at?: Timestamp)` — Lazy full skill load including 
   implementation union. This is what the agent calls AFTER seeing 
   the index.

3. `knowledgeBase(topic, at?: Timestamp)` — Lazy knowledge retrieval.

4. `history(nodeId, type)` — Full commit log for a node.

5. `diff(nodeId, from, to)` — Returns MemoryDelta between two timestamps.

6. `branches` and `branch(name)` — Branch topology queries.

### Mutations to Implement
1. `syncSchema(endpointId)` — Introspects live oracle, computes drift, 
   updates endpoint, returns SyncResult with affected branches.

2. `commitKnowledge(input)` — Append-only. Creates KnowledgeNode + 
   MemoryCommit atomically. Returns new commit hash.

3. `forkBranch(from, name, purpose)` — Creates branch record.

4. `mergeBranch(branchName, strategy)` — Implements three strategies:
   SCHEMA_FIRST | RECENCY_FIRST | HUMAN_ARBITRATION

5. `updateProficiency(skillId, delta, evidence)` — Updates skill 
   proficiency, creates new versioned skill record (never mutates).

## Deliverables
1. `packages/core/src/graphql/builder.ts`
2. `packages/core/src/graphql/queries/` — one file per query domain
3. `packages/core/src/graphql/mutations/` — one file per mutation domain
4. `packages/core/src/graphql/schema.ts` — assembled schema export
5. Tests: `contextIndex` response serializes to ≤200 tokens

## Handoff to Next Prompt
{
  "completed": "graphql-schema",
  "queries": ["contextIndex", "skill", "knowledgeBase", "history", 
              "diff", "branches", "branch"],
  "mutations": ["syncSchema", "commitKnowledge", "forkBranch", 
                "mergeBranch", "updateProficiency"],
  "pushBoundary": "contextIndex",  // only this is auto-injected
  "nextPrompt": "five-behaviors"
}
```

---

### Prompt 4: The Five Self-Operational Behaviors

```markdown
# ContextGraph — Prompt 4 of 10: Self-Operational Core

## Handoff Received
{
  "completed": "graphql-schema",
  "mutations": ["syncSchema", "commitKnowledge", "forkBranch", 
                "mergeBranch", "updateProficiency"],
  "pushBoundary": "contextIndex"
}

## What This Prompt Builds
The ENGINE of ContextGraph. These five modules are what make it 
self-operational — not just storage. They run autonomously, triggered 
by events, without human intervention (except EPISTEMIC and 
POLICY_CONFLICT collision classes).

## Current Task: `packages/core/src/engine/`

### Module 1: `drift.ts`
```typescript
export class DriftDetector {
  async detect(endpointId: string): Promise<DriftEvent>
  async classify(before: TypeMap, after: TypeMap): Promise<DriftSeverity>
  async remediate(event: DriftEvent): Promise<RemediationResult>
}
```
Severity ladder (implement in order, stop at first match):
CORRUPTION → BREAKING → DEPRECATION → ADDITIVE → SILENT

### Module 2: `collision.ts`
```typescript
export class CollisionDetector {
  async detect(branchA: string, branchB: string): Promise<Collision[]>
  async classify(collision: Collision): Promise<CollisionClass>
  async resolve(collision: Collision): Promise<ResolutionResult>
}
```
Resolution map:
- ADDITIVE → auto_merge (no human)
- CONCURRENT_EDIT → schema_first (no human)
- SCHEMA_TEMPORAL → rebase_to_current (no human)
- EPISTEMIC → human_arbitration (BLOCK, emit event)
- POLICY_CONFLICT → escalate_immediate (BLOCK, emit event)

### Module 3: `decay.ts`
```typescript
export class DecayEngine {
  computeScore(node: KnowledgeNode, endpoint: SchemaEndpoint): DecayScore
  async scan(branchName: string): Promise<DecayReport>
  async tombstone(nodeId: string): Promise<void>  // marks LIKELY_STALE
}
```
Decay function: weighted combination of temporalDecay, 
structuralDecay, empiricalDecay. Tombstone threshold: 0.95.

### Module 4: `convergence.ts`
```typescript
export class ConvergenceDetector {
  async scan(topic: string): Promise<ConvergenceCandidate[]>
  async promote(nodes: KnowledgeNode[]): Promise<CanonicalNode>
  computeScore(nodeA: KnowledgeNode, nodeB: KnowledgeNode): ConvergenceScore
}
```
Promotion threshold: convergenceScore.combined > 0.85.
temporal score must confirm independence (not one agent read from other).

### Module 5: `provenance.ts`
```typescript
export class ProvenanceTracker {
  async chain(nodeId: string): Promise<ProvenanceChain[]>
  async verify(commitHash: string): Promise<VerificationResult>
  async replay(branchName: string, at: Date): Promise<EpistemicState>
}
```
`replay()` reconstructs exact agent knowledge state at a point in time.
This is the audit trail that makes every other module trustworthy.

### Orchestrator: `engine.ts`
```typescript
export class ContextGraphEngine {
  // Called on schema change event
  async onSchemaChange(endpointId: string): Promise<void>
  // Called on branch merge attempt  
  async onMergeAttempt(source: string, target: string): Promise<MergeResult>
  // Called on session start (builds the push index)
  async buildContextIndex(agentId: string, branch: string): Promise<string>
  // Called periodically (cron or queue)
  async runMaintenance(branchName: string): Promise<MaintenanceReport>
}
```

## Deliverables
1. Five engine modules + orchestrator
2. `packages/core/src/engine/index.ts` — clean re-exports
3. Tests for each module covering happy path + each failure class
4. `packages/core/src/engine/events.ts` — typed event emitter 
   (HUMAN_REQUIRED events must be emittable to external systems)

## Handoff to Next Prompt
{
  "completed": "five-behaviors",
  "engineModules": ["drift", "collision", "decay", 
                    "convergence", "provenance", "engine"],
  "humanRequiredEvents": ["EPISTEMIC_COLLISION", "POLICY_CONFLICT",
                          "CORRUPTION_DETECTED"],
  "nextPrompt": "worker-host"
}
```

---

### Prompt 5: Cloudflare Worker Host

```markdown
# ContextGraph — Prompt 5 of 10: Worker Runtime

## Handoff Received
{
  "completed": "five-behaviors",
  "engineModules": ["drift", "collision", "decay", 
                    "convergence", "provenance", "engine"],
  "humanRequiredEvents": ["EPISTEMIC_COLLISION", "POLICY_CONFLICT",
                          "CORRUPTION_DETECTED"]
}

## Runtime Constraints (Cloudflare Workers)
- No Node.js APIs. Use Web Standard APIs only.
- Drizzle connects via Hyperdrive binding (not direct TCP).
- Durable Objects hold per-agent session state between requests.
- KV stores the compiled context index (avoid DB round-trip on 
  every session start).
- Queues handle async drift notifications (non-blocking).

## Current Task: `apps/worker/src/`

### Entry Point: `index.ts`
Hono router with these routes:
- `POST /graphql` — GraphQL Yoga handler
- `POST /agent/session` — Start/resume agent session (returns push context)
- `GET /health` — Returns engine status + endpoint drift states
- `POST /webhooks/schema-change` — External systems notify of schema changes

### Middleware Stack (order matters)
1. `auth.ts` — Validate `x-agent-id` header against schema_endpoints table
2. `push.ts` — THE ANTI-SKILLS.MD MIDDLEWARE:
   Builds context index via ContextGraphEngine.buildContextIndex()
   Caches in KV with 60s TTL
   Injects into every response as `x-contextgraph-index` header
   Target: under 200 tokens, always present, agent never decides to fetch it
3. `oracle.ts` — On every request, check if any endpoint has 
   BREAKING_DRIFT. If yes, add warning to response before GraphQL executes.

### Durable Object: `AgentSessionDO.ts`
Holds between requests:
- Current branch name
- In-flight approval state (for HUMAN_REQUIRED events)
- Active subscription handles
- Working context (mutable scratchpad, not committed to spine)

### Queue Consumer: `drift-consumer.ts`
Processes DRIFT_QUEUE messages:
- Runs DriftDetector.detect() 
- Runs DecayEngine.scan() on affected branch
- Runs CollisionDetector if multiple agents on affected branches
- Emits HUMAN_REQUIRED events to configured webhook if needed
- Rebuilds KV context index for affected agents

## Deliverables
1. All files listed above
2. `apps/worker/wrangler.jsonc` — complete with Hyperdrive, KV, 
   DO, Queues bindings and env-specific overrides for preview/production
3. `apps/worker/src/types/env.d.ts` — typed Cloudflare bindings
4. Integration test: full request lifecycle through push middleware

## Handoff to Next Prompt
{
  "completed": "worker-host",
  "routes": ["/graphql", "/agent/session", "/health", 
             "/webhooks/schema-change"],
  "cfBindings": ["HYPERDRIVE", "CONTEXT_INDEX", 
                 "AGENT_SESSION", "DRIFT_QUEUE"],
  "nextPrompt": "deploy-cli"
}
```

---

### Prompt 6: One-Click Deploy CLI

```markdown
# ContextGraph — Prompt 6 of 10: Deploy CLI

## Handoff Received
{
  "completed": "worker-host",
  "cfBindings": ["HYPERDRIVE", "CONTEXT_INDEX", 
                 "AGENT_SESSION", "DRIFT_QUEUE"],
  "routes": ["/graphql", "/agent/session", "/health", 
             "/webhooks/schema-change"]
}

## Design Principle
`npx contextgraph deploy` provisions ALL infrastructure in sequence.
Each step is idempotent — re-running never creates duplicate resources.
The user edits ONE file: `contextgraph.config.ts`. Nothing else.

## Current Task: `packages/deploy/src/`

### `cli.ts` — Main Entry
Five sequential steps, each logged with progress:
1. NEON_PROVISION — Create Neon project, capture connection URI
2. HYPERDRIVE_CREATE — `wrangler hyperdrive create`, capture ID
3. CONFIG_PATCH — Inject IDs into wrangler.jsonc (never commit secrets)
4. MIGRATE — Run Drizzle migrations against Neon
5. WORKER_DEPLOY — `wrangler deploy --env production`

Output on success:
```
✅ ContextGraph deployed
   Worker:   https://contextgraph.{account}.workers.dev
   GraphQL:  https://contextgraph.{account}.workers.dev/graphql
   Neon DB:  {host} (connection string in .env.local — never committed)
   
   Next: Add oracle endpoints to contextgraph.config.ts
```

### `config.ts` — User-Facing Config Schema
```typescript
export interface ContextGraphConfig {
  agent: { id: string; defaultBranch: string }
  oracles: Array<{ name: string; uri: string }>
  pushContext: {
    maxTokens: number      // hard ceiling, default 200
    includeSkillIndex: boolean
    includeDriftStatus: boolean
  }
  driftPolicy: {
    additive: 'auto-sync' | 'notify'
    breaking: 'pause-notify' | 'rollback' | 'auto-sync'
    corruption: 'halt'     // always halt, not configurable
  }
  branchConvention: string  // default: 'agent/{workspace}/{task}'
  notifications?: {
    webhook?: string        // HUMAN_REQUIRED events posted here
    slackWebhook?: string
  }
}
```

### `validate.ts` — Pre-deploy Validation
Check before spending API credits:
- Neon CLI available
- Wrangler authenticated
- `contextgraph.config.ts` exists and valid
- No existing deployment with same name (idempotent check)

## Deliverables
1. All deploy package files
2. `packages/deploy/bin/contextgraph.ts` — CLI entry point
3. `contextgraph.config.ts` at repo root — template with comments
4. `.env.example` — all required env vars documented
5. Tests: validate() catches all common misconfigurations

## Handoff to Next Prompt
{
  "completed": "deploy-cli",
  "userConfigFile": "contextgraph.config.ts",
  "deploySteps": ["NEON_PROVISION", "HYPERDRIVE_CREATE", 
                  "CONFIG_PATCH", "MIGRATE", "WORKER_DEPLOY"],
  "nextPrompt": "ci-cd-pipeline"
}
```

---

### Prompt 7: CI/CD — The Neon Branch ↔ Git Branch Isomorphism

```markdown
# ContextGraph — Prompt 7 of 10: CI/CD Pipeline

## Handoff Received
{
  "completed": "deploy-cli",
  "userConfigFile": "contextgraph.config.ts",
  "deploySteps": ["NEON_PROVISION", "HYPERDRIVE_CREATE", 
                  "CONFIG_PATCH", "MIGRATE", "WORKER_DEPLOY"]
}

## The Core Isomorphism to Enforce
Every Git branch = a Neon DB branch = a Cloudflare Preview Worker.
This is not convention — it is enforced by CI.

An agent on a PR branch operates with:
- Full clone of production memory (Neon branch)
- Isolated writes (changes don't affect main)  
- Real oracle connections (tests against live schemas)
- Automatic teardown on PR close

## Current Task: `.github/workflows/`

### `preview.yml` — PR Workflow
Trigger: pull_request (opened, synchronize, closed)

On opened/synchronize:
1. `neonctl branches create --name preview/${{ github.head_ref }}`
2. `wrangler hyperdrive create contextgraph-preview-{PR_NUMBER}`
3. `wrangler deploy --env preview` with NEON_BRANCH_URL injected
4. Comment on PR with preview Worker URL + GraphQL playground link

On closed:
1. `wrangler delete` preview Worker
2. `neonctl branches delete preview/${{ github.head_ref }}`
3. Comment on PR: preview resources torn down

### `production.yml` — Main Branch Workflow
Trigger: push to main

Steps:
1. Run full test suite (Vitest)
2. Run Drizzle migrations against production Neon
3. `wrangler deploy --env production`
4. Run smoke test against live Worker (`/health` endpoint)
5. On failure: post to configured notifications webhook

### `maintenance.yml` — Scheduled Maintenance
Trigger: cron `0 2 * * *` (2 AM UTC daily)

Steps:
1. Call `POST /agent/maintenance` on production Worker
2. Worker runs `ContextGraphEngine.runMaintenance('main')`
3. Decay scan → tombstone stale nodes
4. Convergence scan → promote canonical knowledge
5. Post maintenance report to configured Slack webhook

## Deliverables
1. Three workflow files
2. `docs/DEPLOYMENT.md` — explains the isomorphism to contributors
3. Required GitHub secrets documentation in CONTRIBUTING.md:
   NEON_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
   HYPERDRIVE_PREVIEW_ID

## Handoff to Next Prompt
{
  "completed": "ci-cd-pipeline",
  "workflows": ["preview.yml", "production.yml", "maintenance.yml"],
  "branchIsomorphism": "git-branch == neon-branch == cf-preview",
  "nextPrompt": "sdk"
}
```

---

### Prompt 8: The Client SDK

```markdown
# ContextGraph — Prompt 8 of 10: Client SDK

## Handoff Received
{
  "completed": "ci-cd-pipeline",
  "branchIsomorphism": "git-branch == neon-branch == cf-preview",
  "routes": ["/graphql", "/agent/session", "/health"]
}

## Design Principle
Agents use this SDK. The SDK handles ALL complexity.
Three methods cover the entire session lifecycle.
The agent never thinks about: connection pooling, drift checking, 
branch naming, context window management, or schema migration.

## Current Task: `packages/core/src/sdk/`

### `ContextGraphClient` — Primary SDK Class

```typescript
export class ContextGraphClient {
  constructor(config: {
    workerUrl: string;
    agentId: string;
    branch?: string;       // default: read from contextgraph.config.ts
  })

  // ── Session Lifecycle ──────────────────────────────────────────────
  
  // ALWAYS call at session start. Returns push index. Handles drift 
  // detection internally. Never throws on ADDITIVE_DRIFT — continues.
  // Throws BreakingDriftError on BREAKING_DRIFT with affected operations.
  async resume(): Promise<SessionContext>
  
  // Commit knowledge derived during session.
  // Automatically records evidenceRefs (what was read before committing).
  // Returns commit hash for provenance chain.
  async commit(knowledge: KnowledgeCommitInput): Promise<CommitRef>
  
  // End session. Runs convergence scan. Triggers merge if branch is 
  // a task fork (agent/{workspace}/{task} pattern).
  async close(message: string): Promise<CloseResult>

  // ── Lazy Data Access (informed pull — agent calls after seeing index) ──
  
  async getSkill(nameOrId: string): Promise<Skill>
  async getKnowledge(topic: string): Promise<KnowledgeNode[]>
  
  // ── Code Execution Interface (never routes result through context) ──
  // Agent writes GraphQL — result stays in memory, only insight enters context
  async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T>
  
  // ── Human-Required Event Handler ──────────────────────────────────
  // Register callback for EPISTEMIC_COLLISION, POLICY_CONFLICT, CORRUPTION
  onHumanRequired(handler: (event: HumanRequiredEvent) => Promise<void>): void
}
```

### `SessionContext` — What `resume()` Returns
The push index formatted for direct LLM system prompt injection:
```typescript
interface SessionContext {
  index: string;          // The <200 token compressed string
  agentId: string;
  branch: string;
  headHash: string;
  driftWarnings: DriftEvent[];   // empty if all SYNCHRONIZED
  skillIndex: string[];   // names only: ["price-update@a1b2c3d4"]
  knowledgeCount: number;
  schemaStatus: 'healthy' | 'degraded' | 'halted';
}
```

## Deliverables
1. Full SDK implementation
2. `packages/core/src/sdk/errors.ts` — typed error classes:
   BreakingDriftError, CorruptionError, EpistemicCollisionError
3. SDK usage example in `examples/basic-agent-session.ts`
4. Tests: full session lifecycle (resume → gql → commit → close)

## Handoff to Next Prompt
{
  "completed": "sdk",
  "sdkMethods": ["resume", "commit", "close", "getSkill", 
                 "getKnowledge", "gql", "onHumanRequired"],
  "keyType": "SessionContext",
  "nextPrompt": "observability"
}
```

---

### Prompt 9: Observability + OpenTelemetry

```markdown
# ContextGraph — Prompt 9 of 10: Observability

## Handoff Received
{
  "completed": "sdk",
  "sdkMethods": ["resume", "commit", "close", "gql", 
                 "onHumanRequired"],
  "humanRequiredEvents": ["EPISTEMIC_COLLISION", "POLICY_CONFLICT",
                          "CORRUPTION_DETECTED"]
}

## Why Observability Is Architectural, Not Cosmetic
ContextGraph's five behaviors are autonomous. Without observability 
you cannot know: which drift events occurred, why a collision was 
classified EPISTEMIC, which agent's knowledge had the highest 
decay rate, or whether the convergence detector is promoting 
correctly. Without these signals, the community cannot improve 
the engine.

## Current Task: `packages/core/src/telemetry/`

### OpenTelemetry Integration
Use `@opentelemetry/api` (peer dep — don't bundle a provider).
This makes ContextGraph provider-agnostic: works with 
Cloudflare Analytics, Honeycomb, Datadog, or self-hosted Jaeger.

### Spans to Instrument (trace every self-operational event)
1. `contextgraph.drift.detect` 
   Attributes: endpointId, severity, affectedOperationCount
   
2. `contextgraph.collision.resolve`
   Attributes: collisionClass, resolutionStrategy, 
               required_human (bool)
   
3. `contextgraph.decay.scan`
   Attributes: branchName, nodesScanned, nodesTombstoned
   
4. `contextgraph.convergence.promote`
   Attributes: topic, contributingAgents, convergenceScore
   
5. `contextgraph.session.resume`
   Attributes: agentId, branch, indexTokenCount, driftStatus
   
6. `contextgraph.commit.knowledge`
   Attributes: topic, author, evidenceRefCount, newVersionHash

### Metrics (Cloudflare Workers Analytics Engine)
```typescript
export interface ContextGraphMetrics {
  drift_events_total: Counter        // by severity
  collision_resolutions_total: Counter  // by class
  human_required_events_total: Counter  // by type — key OSS health metric
  decay_tombstones_total: Counter
  convergence_promotions_total: Counter
  context_index_tokens: Histogram    // must stay under 200
  session_duration_ms: Histogram
}
```

### Dashboard: `apps/worker/src/routes/dashboard.ts`
Single HTML endpoint at `GET /dashboard`:
- Last 24h drift events by severity (bar chart)
- Active branches with status
- Top decayed nodes (tombstone candidates)
- Recent convergence promotions with scores
- Human-required events queue (pending resolution)

Render as plain HTML with inline CSS — no JS framework.
Community contributors must be able to understand and extend it.

## Deliverables
1. Telemetry module with all spans + metrics
2. Dashboard route
3. `docs/OBSERVABILITY.md` — how to connect your OTel provider
4. Tests: span attributes are present and typed correctly

## Handoff to Next Prompt
{
  "completed": "observability",
  "spans": ["drift.detect", "collision.resolve", "decay.scan",
            "convergence.promote", "session.resume", "commit.knowledge"],
  "dashboardRoute": "GET /dashboard",
  "nextPrompt": "docs-and-release"
}
```

---

### Prompt 10: Documentation, README, and OSS Release

```markdown
# ContextGraph — Prompt 10 of 10: OSS Release

## Handoff Received
{
  "completed": "observability",
  "allModules": ["scaffold", "drizzle-schema", "graphql-schema",
                 "five-behaviors", "worker-host", "deploy-cli",
                 "ci-cd-pipeline", "sdk", "observability"],
  "deployCommand": "npx contextgraph deploy",
  "sdkEntry": "@contextgraph/core"
}

## Goal
A developer who has never heard of ContextGraph opens the repo 
and within 15 minutes: understands what it is, deploys it, 
connects one oracle, and runs their first agent session.
No ambiguity. No hunting through docs.

## Current Task: Documentation + Release Artifacts

### `README.md` Structure (in order, no deviations)
1. One-line description (not marketing — structural):
   "ContextGraph is a self-operational memory layer for AI agents: 
   typed, versioned, and continuously synchronized with your 
   live GraphQL schema."

2. Why Not a Vector Database (3 bullet points maximum, 
   each a concrete capability gap in vector DBs)

3. The Five Behaviors (table: Name | What It Detects | 
   Human Required?)

4. Quickstart (exactly 4 steps):
   ```bash
   git clone https://github.com/contextgraph/contextgraph
   cp contextgraph.config.example.ts contextgraph.config.ts
   # edit: add your agent ID and oracle GraphQL endpoints
   npx contextgraph deploy
   ```

5. First Agent Session (SDK code example — 15 lines max)

6. Architecture (link to `docs/ARCHITECTURE.md`)

7. Contributing (link to `CONTRIBUTING.md`)

### `docs/ARCHITECTURE.md`
The five self-operational behaviors with:
- Formal definition of each
- The feedback loop diagram (text/ASCII — renders in GitHub)
- The push vs pull boundary (why contextIndex is always pushed)
- The append-only constraint and why it exists

### `docs/ORACLE-INTEGRATIONS.md`
How to connect ContextGraph to a GraphQL endpoint.
Sections for: Payload CMS, Hasura, Apollo Server, 
custom GraphQL APIs. Each section: 5 lines max.

### `CHANGELOG.md`
v0.1.0 initial release entry.

### `package.json` at root
Add these scripts:
```json
{
  "deploy": "tsx packages/deploy/bin/contextgraph.ts deploy",
  "dev": "wrangler dev apps/worker/src/index.ts",
  "test": "vitest run",
  "lint": "biome check .",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

### GitHub Repository Setup
`.github/`:
- `CODEOWNERS` — initial owners file (placeholder for community)
- `pull_request_template.md` — requires: 
  which behavior does this touch? tests added? docs updated?
- `workflows/` — already built in Prompt 7

## Final Deliverable Checklist
Before outputting complete, verify:
[ ] `npx contextgraph deploy` works end-to-end (dry run in README)
[ ] `resume()` → `gql()` → `commit()` → `close()` demonstrated
[ ] All five behaviors documented with human-required conditions
[ ] Community contribution path is clear
[ ] No proprietary dependencies — MIT license throughout

## No Handoff
This is the final prompt. The system is complete.
```

---

## The Prompt Engineering Principles Applied

Each prompt follows the same anti-cognitive-overload contract: prior context is a JSON summary (not prose), current task is scoped to one architectural layer, deliverables are enumerated (not vague), and the handoff JSON is the only thing the agent needs to carry forward — no re-reading prior prompts required.

The sequence respects dependency order: types before schema, schema before GraphQL, GraphQL before engine, engine before worker, worker before SDK. An agent can't hallucinate a shortcut because each prompt's starting state is verifiably produced by the previous one.

The open-source posture is load-bearing throughout — MIT license, CONTRIBUTING.md, issue templates, and a pull request template that asks *"which of the five behaviors does this touch?"* — which is how you get community contributions that understand the architecture rather than cargo-culting the surface.
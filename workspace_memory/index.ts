/**
 * Schema module — table definitions and type exports.
 *
 * In production: backed by drizzle-orm/pg-core.
 * This file exposes the table objects and APPEND_ONLY_TABLES constant
 * that the rest of the codebase depends on.
 *
 * For testing, these table objects are used as keys for drizzle query builders.
 * The actual column definitions require drizzle at runtime — stub them here
 * with enough shape to satisfy TypeScript and vitest.
 */

// ─── Table Shape Stubs ────────────────────────────────────────────────────────
// In production these are created via pgTable(). In this scaffold they are
// plain objects used as query builder keys. The real drizzle setup lives in
// the deployment package.

export const memory_commits = { _tableName: 'memory_commits' } as any
export const branches = { _tableName: 'branches' } as any
export const knowledge_nodes = { _tableName: 'knowledge_nodes' } as any
export const skills = { _tableName: 'skills' } as any
export const schema_endpoints = { _tableName: 'schema_endpoints' } as any
export const merge_requests = { _tableName: 'merge_requests' } as any
export const skill_deprecations = { _tableName: 'skill_deprecations' } as any

/**
 * workspace_documents — PR5 addition.
 *
 * Branch-scoped, agent-owned, MUTABLE working memory.
 * The ONLY path to epistemic memory is an explicit agent call to promoteCandidate().
 *
 * ISOLATION GUARANTEE: this table name must NEVER appear in mergeBranch,
 * collision detection, or convergence scans.
 *
 * MUTABLE: unlike epistemic tables below, workspace docs can be updated and
 * soft-deleted. They are working memory, not a ledger.
 */
export const workspace_documents = { _tableName: 'workspace_documents' } as any

/**
 * Tables whose rows are APPEND-ONLY — never updated, never hard-deleted.
 * Any mutation to these tables is a correctness violation.
 *
 * workspace_documents is deliberately ABSENT from this list:
 * it is mutable working memory and does not have append-only semantics.
 */
export const APPEND_ONLY_TABLES = [
  'memory_commits',
  'knowledge_nodes',
  'skills',
  'skill_deprecations',
  'merge_requests'
] as const

export type AppendOnlyTable = typeof APPEND_ONLY_TABLES[number]

// ─── Model Types (shape-only, no drizzle runtime dependency) ─────────────────

export type MemoryCommitModel = {
  hash: string
  parentHash: string | null
  branchName: string
  author: string
  message: string
  schemaHash: string
  snapshot: unknown
  createdAt: Date | null
}

export type BranchModel = {
  name: string
  headHash: string
  parentBranch: string | null
  agentId: string
  status: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type KnowledgeNodeModel = {
  id: string
  commitHash: string
  topic: string
  claim: string
  versionHash: string
  parentHash: string | null
  isomorphisms: unknown
  metadata: unknown
}

export type SkillModel = {
  id: string
  name: string
  versionHash: string
  parentHash: string | null
  implementation: unknown
  proficiency: number
  deprecatedBy: string | null
  createdAt: Date | null
}

export type SchemaEndpointModel = {
  id: string
  name: string
  uri: string
  currentHash: string | null
  previousHash: string | null
  driftStatus: string | null
  typeMapSnapshot: unknown
  lastIntrospectedAt: Date | null
}

export type WorkspaceDocumentModel = {
  id: string
  agentId: string
  branchName: string
  path: string
  content: string
  kind: string
  confidence: number | null
  pinned: boolean
  promotedToNodeId: string | null
  deletedAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
}

export default {
  memory_commits,
  branches,
  knowledge_nodes,
  skills,
  schema_endpoints,
  merge_requests,
  skill_deprecations,
  workspace_documents,
  APPEND_ONLY_TABLES
}

/**
 * Core types for ContextGraph.
 * Drizzle-derived model types are defined separately in schema/index.ts.
 */

export type DriftSeverity = 'CORRUPTION' | 'BREAKING' | 'DEPRECATION' | 'ADDITIVE' | 'SILENT'
export type RemediationPolicy = 'AUTO_SYNC' | 'REGROUND' | 'PAUSE_NOTIFY' | 'ROLLBACK'

export interface DriftEvent {
  endpointId: string
  severity: DriftSeverity
  affectedOperations: string[]
  remediationPolicy: RemediationPolicy
  detectedAt: Date
}

export type CollisionClass =
  | { kind: 'ADDITIVE' }
  | { kind: 'CONCURRENT_EDIT' }
  | { kind: 'EPISTEMIC'; nodeA: string; nodeB: string; contradiction: string }
  | { kind: 'SCHEMA_TEMPORAL'; hashA: string; hashB: string }
  | { kind: 'POLICY_CONFLICT'; field: string }

export type CapabilityImpl =
  | { type: 'PromptFragment'; template: string; requiredContext: string[] }
  | { type: 'GraphQLOperation'; endpointName: string; query: string; queryHash: string }
  | { type: 'MCPToolRef'; serverUri: string; toolName: string; inputSchema: unknown }
  | { type: 'WasmModule'; moduleHash: string; entrypoint: string }

export interface ProvenanceChain {
  nodeId: string
  versionHash: string
  parentHash: string | null
  commitHash: string
  schemaHash: string
  author: 'HUMAN' | 'AGENT' | 'SYSTEM'
  agentId: string
  branchName: string
  taskContractRef: string | null
  evidenceRefs: string[]
  convergenceOf: string[]
}

export interface ConvergenceScore {
  structural: number
  evidential: number
  temporal: number
  combined: number
}

// ─── PR5: Workspace Types ─────────────────────────────────────────────────────

export type WorkspaceDocumentKind = 'SCRATCH' | 'OBSERVATION' | 'CANDIDATE'

export interface WorkspaceDocument {
  id: string
  agentId: string
  branchName: string
  path: string
  content: string
  kind: WorkspaceDocumentKind
  confidence: number | null
  pinned: boolean
  promotedToNodeId: string | null
  deletedAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
}

export interface WorkspaceWriteInput {
  path: string
  content: string
  pinned?: boolean
}

export interface ObservationWriteInput {
  path: string
  content: string
  kind: 'OBSERVATION' | 'CANDIDATE'
  confidence: number
  sourceCommitHashes: string[]
}

export interface PromotionResult {
  workspaceDocumentId: string
  promotedToNodeId: string
  commitHash: string
}

export interface RawObservation {
  topic: string
  claim: string
  confidence: number
  sourceCommitHashes: string[]
  evidenceRefs: string[]
  repetitionCount: number
}

export interface ObservationReport {
  branchName: string
  commitsScanned: number
  observationsGenerated: number
  candidatesPromoted: number
  existingCandidatesUpdated: number
}

export const DRIFT_SEVERITY_VALUES: DriftSeverity[] = [
  'CORRUPTION', 'BREAKING', 'DEPRECATION', 'ADDITIVE', 'SILENT'
]
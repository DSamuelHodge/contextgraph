import { InferSelectModel } from 'drizzle-orm'
import * as schema from '@core/schema'

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

// Export DB-derived types where possible
export type MemoryCommit = InferSelectModel<typeof schema.memory_commits>
export type Branch = InferSelectModel<typeof schema.branches>
export type KnowledgeNode = InferSelectModel<typeof schema.knowledge_nodes>
export type Skill = InferSelectModel<typeof schema.skills>
export type SchemaEndpoint = InferSelectModel<typeof schema.schema_endpoints>
export type SkillDeprecation = InferSelectModel<typeof schema.skill_deprecations>

// Helper to force compile-time exhaustiveness on CapabilityImpl
export function assertCapabilityExhaustive(x: CapabilityImpl) {
  switch (x.type) {
    case 'PromptFragment':
      return true
    case 'GraphQLOperation':
      return true
    case 'MCPToolRef':
      return true
    case 'WasmModule':
      return true
  }
}

export const DRIFT_SEVERITY_VALUES: DriftSeverity[] = ['CORRUPTION', 'BREAKING', 'DEPRECATION', 'ADDITIVE', 'SILENT']

export default {
  DriftSeverity: DRIFT_SEVERITY_VALUES
}

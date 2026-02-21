import { pgTable, text, uuid, jsonb, timestamp, real, index } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

// APPEND-ONLY: never call .update() on this table
export const memory_commits = pgTable('memory_commits', {
  hash: text('hash').primaryKey(),
  parentHash: text('parent_hash'),
  branchName: text('branch_name').notNull(),
  author: text('author').notNull(),
  message: text('message').notNull(),
  schemaHash: text('schema_hash').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at').defaultNow()
}, (t) => ({
  idx_branch: index('memory_commits_branch_idx').on(t.branchName),
  idx_schema: index('memory_commits_schema_idx').on(t.schemaHash)
}))

// branches is the ONLY mutable table
export const branches = pgTable('branches', {
  name: text('name').primaryKey(),
  headHash: text('head_hash').notNull(),
  parentBranch: text('parent_branch'),
  agentId: text('agent_id').notNull(),
  status: text('status').default('ACTIVE'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

// APPEND-ONLY: never call .update() on this table
export const knowledge_nodes = pgTable('knowledge_nodes', {
  id: uuid('id').default('gen_random_uuid()').primaryKey(),
  commitHash: text('commit_hash').notNull(),
  topic: text('topic').notNull(),
  claim: text('claim').notNull(),
  versionHash: text('version_hash').notNull(),
  parentHash: text('parent_hash'),
  isomorphisms: jsonb('isomorphisms').default('[]'),
  metadata: jsonb('metadata').notNull()
}, (t) => ({
  idx_topic: index('knowledge_nodes_topic_idx').on(t.topic),
  idx_version: index('knowledge_nodes_version_idx').on(t.versionHash),
  idx_commit: index('knowledge_nodes_commit_idx').on(t.commitHash)
}))

// APPEND-ONLY: never call .update() on this table
export const skills = pgTable('skills', {
  id: uuid('id').default('gen_random_uuid()').primaryKey(),
  name: text('name').notNull(),
  versionHash: text('version_hash').notNull(),
  parentHash: text('parent_hash'),
  implementation: jsonb('implementation').notNull(),
  proficiency: real('proficiency').default(0.5).notNull(),
  deprecatedBy: text('deprecated_by'),
  createdAt: timestamp('created_at').defaultNow()
}, (t) => ({
  idx_name: index('skills_name_idx').on(t.name),
  idx_deprecated: index('skills_deprecated_idx').on(t.deprecatedBy)
}))

// OPERATIONAL: mutable sync state — .update() permitted for sync metadata only
export const schema_endpoints = pgTable('schema_endpoints', {
  id: uuid('id').default('gen_random_uuid()').primaryKey(),
  name: text('name').notNull(),
  uri: text('uri').notNull(),
  currentHash: text('current_hash'),
  previousHash: text('previous_hash'),
  driftStatus: text('drift_status').default('UNKNOWN'),
  typeMapSnapshot: jsonb('type_map_snapshot'),
  lastIntrospectedAt: timestamp('last_introspected_at')
}, (t) => ({
  idx_name: index('schema_endpoints_name_idx').on(t.name)
}))

// Append-only tables (provenance data). `schema_endpoints` is operational/mutable.
export const APPEND_ONLY_TABLES = [
  'memory_commits',
  'knowledge_nodes',
  'skills',
  'skill_deprecations',
  'merge_requests'
] as const

// New table: merge_requests — append-only queue for human arbitration
export const merge_requests = pgTable('merge_requests', {
  id: uuid('id').default('gen_random_uuid()').primaryKey(),
  sourceBranch: text('source_branch').notNull(),
  targetBranch: text('target_branch').notNull(),
  strategy: text('strategy').notNull(),
  status: text('status').default('PENDING'),
  resolution: jsonb('resolution'),
  createdAt: timestamp('created_at').defaultNow()
}, (t) => ({
  idx_source: index('merge_requests_source_idx').on(t.sourceBranch),
  idx_target: index('merge_requests_target_idx').on(t.targetBranch)
}))

// New table: skill_deprecations — append-only record of deprecations
export const skill_deprecations = pgTable('skill_deprecations', {
  id: uuid('id').default('gen_random_uuid()').primaryKey(),
  skillId: text('skill_id').notNull(),
  replacedById: text('replaced_by_id').notNull(),
  reason: text('reason'),
  deprecatedAt: timestamp('deprecated_at').defaultNow()
}, (t) => ({
  idx_skill: index('skill_deprecations_skill_idx').on(t.skillId),
  idx_replaced: index('skill_deprecations_replaced_idx').on(t.replacedById)
}))

export type MemoryCommitModel = InferSelectModel<typeof memory_commits>
export type BranchModel = InferSelectModel<typeof branches>
export type KnowledgeNodeModel = InferSelectModel<typeof knowledge_nodes>
export type SkillModel = InferSelectModel<typeof skills>
export type SchemaEndpointModel = InferSelectModel<typeof schema_endpoints>

export default {
  memory_commits,
  branches,
  knowledge_nodes,
  skills,
  schema_endpoints,
  merge_requests,
  skill_deprecations,
  APPEND_ONLY_TABLES
}

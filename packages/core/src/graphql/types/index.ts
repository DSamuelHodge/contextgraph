import builder from '../builder'
import { Kind } from 'graphql'

export interface EndpointSummaryShape {
  name: string
  driftStatus: string
  hash: string
}

export interface ContextIndexShape {
  agentId: string
  branch: string
  headHash: string
  endpoints: EndpointSummaryShape[]
  skillIndex: string[]
  knowledgeCount: number
  driftWarning: boolean
}

export interface SkillSummaryShape {
  name: string
  proficiency: number
  versionHash: string
}

export interface SkillShape {
  id: string
  name: string
  versionHash: string
  implementation: unknown
  proficiency: number
  createdAt: Date | null
}

export interface KnowledgeNodeShape {
  id: string
  commitHash: string
  topic: string
  claim: string
  versionHash: string
  parentHash: string | null
  isomorphisms: unknown
  metadata: unknown
}

export interface MemoryCommitShape {
  hash: string
  parentHash: string | null
  branchName: string
  author: string
  message: string
  schemaHash: string
  snapshot: unknown
  createdAt: Date | null
}

export interface BranchShape {
  name: string
  status: string | null
  agentId: string
  parentBranch: string | null
  headHash: string
  createdAt: Date | null
  updatedAt: Date | null
  headCommit?: MemoryCommitShape | null
}

export interface SchemaEndpointShape {
  id: string
  name: string
  uri: string
  currentHash: string | null
  driftStatus: string
  lastIntrospectedAt: Date | null
}

export interface SyncResultShape {
  endpointId: string
  driftStatus: string
  severity: string | null
  affectedBranchNames: string[]
  recommendedAction: string
}

export interface MergeResultShape {
  success: boolean
  strategy: string
  conflictCount: number
  humanRequired: boolean
  mergeRequestId?: string | null
}

export interface MemoryDeltaShape {
  nodeId: string
  added: Array<{ field: string; value: unknown }>
  modified: Array<{ field: string; before: unknown; after: unknown }>
  removed: Array<{ field: string; value: unknown }>
  schemaHashBefore: string
  schemaHashAfter: string
}

export const JsonScalar = builder.scalarType('JSON', {
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value)
      case Kind.OBJECT:
        return ast.fields.reduce((acc: any, field) => {
          acc[field.name.value] = (field.value as any).value
          return acc
        }, {})
      case Kind.LIST:
        return ast.values.map((v: any) => v.value)
      case Kind.NULL:
        return null
      default:
        return null
    }
  }
})

export const EndpointSummary = builder.objectRef<EndpointSummaryShape>('EndpointSummary')
EndpointSummary.implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    driftStatus: t.exposeString('driftStatus'),
    hash: t.exposeString('hash')
  })
})

export const ContextIndexType = builder.objectRef<ContextIndexShape>('ContextIndex')
ContextIndexType.implement({
  fields: (t) => ({
    agentId: t.exposeString('agentId'),
    branch: t.exposeString('branch'),
    headHash: t.exposeString('headHash'),
    endpoints: t.field({
      type: [EndpointSummary],
      resolve: (root) => root.endpoints
    }),
    skillIndex: t.field({ type: ['String'], resolve: (r) => r.skillIndex }),
    knowledgeCount: t.exposeInt('knowledgeCount'),
    driftWarning: t.exposeBoolean('driftWarning')
  })
})

export const SkillSummaryType = builder.objectRef<SkillSummaryShape>('SkillSummary')
SkillSummaryType.implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    proficiency: t.exposeFloat('proficiency'),
    versionHash: t.exposeString('versionHash')
  })
})

export const SkillType = builder.objectRef<SkillShape>('Skill')
SkillType.implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    versionHash: t.exposeString('versionHash'),
    implementation: t.field({ type: JsonScalar, resolve: (r) => r.implementation }),
    proficiency: t.exposeFloat('proficiency'),
    createdAt: t.field({ type: 'String', resolve: (r) => r.createdAt?.toISOString?.() ?? null, nullable: true })
  })
})

export const KnowledgeNodeType = builder.objectRef<KnowledgeNodeShape>('KnowledgeNode')
KnowledgeNodeType.implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    commitHash: t.exposeString('commitHash'),
    topic: t.exposeString('topic'),
    claim: t.exposeString('claim'),
    versionHash: t.exposeString('versionHash'),
    parentHash: t.exposeString('parentHash', { nullable: true }),
    isomorphisms: t.field({ type: JsonScalar, resolve: (r) => r.isomorphisms }),
    metadata: t.field({ type: JsonScalar, resolve: (r) => r.metadata })
  })
})

export const MemoryCommitType = builder.objectRef<MemoryCommitShape>('MemoryCommit')
MemoryCommitType.implement({
  fields: (t) => ({
    hash: t.exposeString('hash'),
    parentHash: t.exposeString('parentHash', { nullable: true }),
    branchName: t.exposeString('branchName'),
    author: t.exposeString('author'),
    message: t.exposeString('message'),
    schemaHash: t.exposeString('schemaHash'),
    snapshot: t.field({ type: JsonScalar, resolve: (r) => r.snapshot }),
    createdAt: t.field({ type: 'String', resolve: (r) => r.createdAt?.toISOString?.() ?? null, nullable: true })
  })
})

export const BranchType = builder.objectRef<BranchShape>('Branch')
BranchType.implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    status: t.exposeString('status', { nullable: true }),
    agentId: t.exposeString('agentId'),
    parentBranch: t.exposeString('parentBranch', { nullable: true }),
    headHash: t.exposeString('headHash'),
    createdAt: t.field({ type: 'String', resolve: (r) => r.createdAt?.toISOString?.() ?? null, nullable: true }),
    updatedAt: t.field({ type: 'String', resolve: (r) => r.updatedAt?.toISOString?.() ?? null, nullable: true }),
    headCommit: t.field({ type: MemoryCommitType, resolve: (r) => r.headCommit ?? null, nullable: true })
  })
})

export const SchemaEndpointType = builder.objectRef<SchemaEndpointShape>('SchemaEndpoint')
SchemaEndpointType.implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    uri: t.exposeString('uri'),
    currentHash: t.exposeString('currentHash', { nullable: true }),
    driftStatus: t.exposeString('driftStatus'),
    lastIntrospectedAt: t.field({ type: 'String', resolve: (r) => r.lastIntrospectedAt?.toISOString?.() ?? null, nullable: true })
  })
})

export const SyncResultType = builder.objectRef<SyncResultShape>('SyncResult')
SyncResultType.implement({
  fields: (t) => ({
    endpointId: t.exposeString('endpointId'),
    driftStatus: t.exposeString('driftStatus'),
    severity: t.exposeString('severity', { nullable: true }),
    affectedBranchNames: t.field({ type: ['String'], resolve: (r) => r.affectedBranchNames }),
    recommendedAction: t.exposeString('recommendedAction')
  })
})

export const MergeResultType = builder.objectRef<MergeResultShape>('MergeResult')
MergeResultType.implement({
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    strategy: t.exposeString('strategy'),
    conflictCount: t.exposeInt('conflictCount'),
    humanRequired: t.exposeBoolean('humanRequired'),
    mergeRequestId: t.exposeString('mergeRequestId', { nullable: true })
  })
})

export const MemoryDeltaType = builder.objectRef<MemoryDeltaShape>('MemoryDelta')
MemoryDeltaType.implement({
  fields: (t) => ({
    nodeId: t.exposeString('nodeId'),
    added: t.field({ type: [JsonScalar], resolve: (r) => r.added }),
    modified: t.field({ type: [JsonScalar], resolve: (r) => r.modified }),
    removed: t.field({ type: [JsonScalar], resolve: (r) => r.removed }),
    schemaHashBefore: t.exposeString('schemaHashBefore'),
    schemaHashAfter: t.exposeString('schemaHashAfter')
  })
})

export default {
  JsonScalar,
  EndpointSummary,
  ContextIndexType,
  SkillSummaryType,
  SkillType,
  KnowledgeNodeType,
  MemoryCommitType,
  BranchType,
  SchemaEndpointType,
  SyncResultType,
  MergeResultType,
  MemoryDeltaType
}

import type { DriftEvent } from '../types'
import type { KnowledgeNode, Skill } from '../types/sdk'
import type { HumanRequiredEvent } from '../engine/events'
import { BreakingDriftError, CorruptionError } from './errors'
import type { Telemetry } from '../telemetry'

export type KnowledgeCommitInput = {
  topic: string
  claim: string
  commitMessage: string
  parentHash?: string | null
  evidenceRefs?: string[]
  taskContractRef?: string | null
  isomorphisms?: unknown[]
}

export type WorkspaceWriteInput = {
  path: string
  content: string
  pinned?: boolean
}

export type WorkspaceDocument = {
  id: string
  path: string
  content: string
  kind: string
  confidence: number | null
  pinned: boolean
  promotedToNodeId: string | null
}

export type WorkspaceIndex = {
  candidateCount: number
  pinnedDocs: Array<{ id: string; path: string; content: string; kind: string }>
  observationCount: number
}

export type PromotionResult = {
  workspaceDocumentId: string
  promotedToNodeId: string
  commitHash: string
  topic: string
  claim: string
}

export type CommitRef = { hash: string }
export type CloseResult = { merged: boolean; mergeStatus?: string }

export type SessionContext = {
  // Epistemic state
  index: string
  agentId: string
  branch: string
  headHash: string
  driftWarnings: DriftEvent[]
  schemaStatus: 'healthy' | 'degraded' | 'halted'
  driftStatus: string | null
  pendingCollisions: number
  convergenceReady: string[]
  blockedOnHuman: boolean
  // Workspace state
  workspace: WorkspaceIndex
}

export type ContextGraphClientConfig = {
  workerUrl: string
  agentId: string
  branch?: string
  telemetry?: Telemetry
}

export class ContextGraphClient {
  private readonly workerUrl: string
  private readonly agentId: string
  private branch: string
  private readonly telemetry?: Telemetry
  private readonly humanHandlers: Array<(event: HumanRequiredEvent) => Promise<void> | void> = []

  constructor(config: ContextGraphClientConfig) {
    this.workerUrl = config.workerUrl.replace(/\/$/, '')
    this.agentId = config.agentId
    this.branch = config.branch ?? 'main'
    this.telemetry = config.telemetry
  }

  // ─── Session ───────────────────────────────────────────────────────────────

  async resume(): Promise<SessionContext> {
    const res = await fetch(`${this.workerUrl}/agent/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': this.agentId,
        'x-branch-name': this.branch
      },
      body: JSON.stringify({ branch: this.branch })
    })

    const warning = res.headers.get('x-contextgraph-warning')
    if (warning === 'BREAKING_DRIFT') throw new BreakingDriftError()
    if (warning === 'CORRUPTION') throw new CorruptionError()

    const payload = (await res.json()) as { agentId: string; branch: string; index?: string }

    // Epistemic index — from header (pushed) or body (fallback)
    const headerIndex = res.headers.get('x-contextgraph-index')
    const index = headerIndex ?? payload.index ?? '{}'
    const epistemic = index ? JSON.parse(index) as any : {}

    // Workspace index — from dedicated header (new in PR5)
    const workspaceHeader = res.headers.get('x-contextgraph-workspace')
    const workspace: WorkspaceIndex = workspaceHeader
      ? JSON.parse(workspaceHeader)
      : { candidateCount: 0, pinnedDocs: [], observationCount: 0 }

    const session: SessionContext = {
      index,
      agentId: payload.agentId ?? this.agentId,
      branch: payload.branch ?? this.branch,
      headHash: epistemic.headHash ?? 'genesis',
      driftWarnings: [],
      schemaStatus: warning ? 'degraded' : 'healthy',
      driftStatus: epistemic.driftStatus ?? null,
      pendingCollisions: epistemic.pendingCollisions?.length ?? epistemic.pendingCollisionCount ?? 0,
      convergenceReady: epistemic.convergenceReady ?? [],
      blockedOnHuman: epistemic.blockedOnHuman ?? false,
      workspace
    }

    const indexTokenCount = Math.ceil(index.length / 4)
    this.telemetry?.sessionResume({
      agentId: session.agentId,
      branch: session.branch,
      indexTokenCount,
      driftStatus: session.schemaStatus
    })

    return session
  }

  // ─── Epistemic Memory ──────────────────────────────────────────────────────

  async commit(knowledge: KnowledgeCommitInput): Promise<CommitRef> {
    const query = `mutation CommitKnowledge($input: KnowledgeCommitInput!) {
      commitKnowledge(input: $input) { hash }
    }`
    const data = await this.gql<{ commitKnowledge: { hash: string } }>(query, { input: knowledge })
    const hash = data.commitKnowledge.hash
    this.telemetry?.commitKnowledge({
      topic: knowledge.topic,
      author: this.agentId,
      evidenceRefCount: knowledge.evidenceRefs?.length ?? 0,
      newVersionHash: hash
    })
    return { hash }
  }

  async close(message: string): Promise<CloseResult> {
    if (this.isTaskBranch(this.branch)) {
      const query = `mutation MergeBranch($branchName: String!, $strategy: String!) {
        mergeBranch(branchName: $branchName, strategy: $strategy) { status strategy }
      }`
      const data = await this.gql<{ mergeBranch: { status: string } }>(query, {
        branchName: this.branch,
        strategy: 'HUMAN_ARBITRATION'
      })
      return { merged: data.mergeBranch.status === 'MERGED', mergeStatus: data.mergeBranch.status }
    }
    return { merged: false, mergeStatus: message }
  }

  // ─── Workspace Memory ──────────────────────────────────────────────────────

  /**
   * Write a workspace document — agent-initiated SCRATCH.
   * Path is hierarchical: 'scratch/pricing-notes', 'candidates/PricingTier', etc.
   * Writing to an existing path updates it (upsert by path).
   */
  async workspaceWrite(input: WorkspaceWriteInput): Promise<WorkspaceDocument> {
    const query = `mutation WriteWorkspace($input: WorkspaceWriteInput!) {
      writeWorkspace(input: $input) {
        id path content kind confidence pinned promotedToNodeId
      }
    }`
    const data = await this.gql<{ writeWorkspace: WorkspaceDocument }>(query, { input })
    return data.writeWorkspace
  }

  /**
   * List workspace documents, optionally filtered by kind or path prefix.
   */
  async workspaceList(filters?: {
    kind?: 'SCRATCH' | 'OBSERVATION' | 'CANDIDATE'
    pinned?: boolean
    pathPrefix?: string
  }): Promise<WorkspaceDocument[]> {
    const query = `query ListWorkspace($kind: String, $pinned: Boolean, $pathPrefix: String) {
      workspaceDocuments(kind: $kind, pinned: $pinned, pathPrefix: $pathPrefix) {
        id path content kind confidence pinned promotedToNodeId createdAt updatedAt
      }
    }`
    const data = await this.gql<{ workspaceDocuments: WorkspaceDocument[] }>(query, filters ?? {})
    return data.workspaceDocuments
  }

  /**
   * List CANDIDATE documents — those the ObservationEngine has flagged
   * as ready for promotion review. Ordered by confidence descending.
   */
  async workspaceCandidates(): Promise<WorkspaceDocument[]> {
    const query = `query WorkspaceCandidates {
      workspaceCandidates {
        id path content kind confidence pinned promotedToNodeId
      }
    }`
    const data = await this.gql<{ workspaceCandidates: WorkspaceDocument[] }>(query)
    return data.workspaceCandidates
  }

  /**
   * Pin or unpin a workspace document.
   * Pinned documents are injected into every session resume.
   */
  async workspacePin(id: string, pinned: boolean): Promise<WorkspaceDocument> {
    const query = `mutation PinWorkspace($id: String!, $pinned: Boolean!) {
      pinWorkspace(id: $id, pinned: $pinned) {
        id path content kind pinned
      }
    }`
    const data = await this.gql<{ pinWorkspace: WorkspaceDocument }>(query, { id, pinned })
    return data.pinWorkspace
  }

  /**
   * Delete a workspace document (soft delete).
   * Cannot delete promoted documents — the audit trail must be preserved.
   */
  async workspaceDelete(id: string): Promise<void> {
    const query = `mutation DeleteWorkspace($id: String!) {
      deleteWorkspace(id: $id) { success }
    }`
    await this.gql(query, { id })
  }

  /**
   * Promote a CANDIDATE workspace document to the epistemic graph.
   *
   * This is the formal boundary crossing — the agent explicitly approves
   * an observation as worthy of canonical memory. The promoted document
   * is permanently linked to the created knowledge node via promotedToNodeId.
   *
   * The agent can override the claim before promotion if the observation
   * requires refinement.
   */
  async promoteCandidate(
    workspaceDocumentId: string,
    options?: { claimOverride?: string; commitMessage?: string; evidenceRefs?: string[] }
  ): Promise<PromotionResult> {
    const query = `mutation PromoteCandidate($input: PromoteCandidateInput!) {
      promoteWorkspaceCandidate(input: $input) {
        workspaceDocumentId promotedToNodeId commitHash topic claim
      }
    }`
    const data = await this.gql<{ promoteWorkspaceCandidate: PromotionResult }>(query, {
      input: { workspaceDocumentId, ...options }
    })
    return data.promoteWorkspaceCandidate
  }

  // ─── Shared ────────────────────────────────────────────────────────────────

  async getKnowledge(topic: string): Promise<KnowledgeNode[]> {
    const query = `query KnowledgeBase { knowledgeBase {
      id topic claim versionHash commitHash parentHash metadata
    }}`
    const data = await this.gql<{ knowledgeBase: KnowledgeNode[] }>(query)
    return data.knowledgeBase.filter(n => n.topic === topic)
  }

  async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.workerUrl}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': this.agentId,
        'x-branch-name': this.branch
      },
      body: JSON.stringify({ query, variables })
    })
    const payload = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (payload.errors?.length) throw new Error(payload.errors.map(e => e.message).join('; '))
    if (!payload.data) throw new Error('Empty GraphQL response')
    return payload.data
  }

  onHumanRequired(handler: (event: HumanRequiredEvent) => Promise<void> | void): void {
    this.humanHandlers.push(handler)
  }

  private isTaskBranch(branch: string) {
    return branch.startsWith('agent/')
  }
}
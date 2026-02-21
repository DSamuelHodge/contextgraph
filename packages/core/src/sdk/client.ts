import type { DriftEvent, KnowledgeNode, Skill } from '../types'
import type { HumanRequiredEvent } from '../engine/events'
import { BreakingDriftError, CorruptionError } from './errors'

export type KnowledgeCommitInput = {
  topic: string
  claim: string
  commitMessage: string
  parentHash?: string | null
  evidenceRefs?: string[]
  taskContractRef?: string | null
  isomorphisms?: unknown[]
}

export type CommitRef = {
  hash: string
}

export type CloseResult = {
  merged: boolean
  mergeStatus?: string
}

export type SessionContext = {
  index: string
  agentId: string
  branch: string
  headHash: string
  driftWarnings: DriftEvent[]
  skillIndex: string[]
  knowledgeCount: number
  schemaStatus: 'healthy' | 'degraded' | 'halted'
}

export type ContextGraphClientConfig = {
  workerUrl: string
  agentId: string
  branch?: string
}

export class ContextGraphClient {
  private readonly workerUrl: string
  private readonly agentId: string
  private branch: string
  private readonly humanHandlers: Array<(event: HumanRequiredEvent) => Promise<void> | void> = []

  constructor(config: ContextGraphClientConfig) {
    this.workerUrl = config.workerUrl.replace(/\/$/, '')
    this.agentId = config.agentId
    this.branch = config.branch ?? 'main'
  }

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
    if (warning === 'BREAKING_DRIFT') {
      throw new BreakingDriftError('Breaking drift detected during resume.')
    }
    if (warning === 'CORRUPTION') {
      throw new CorruptionError('Schema corruption detected during resume.')
    }

    const payload = (await res.json()) as { agentId: string; branch: string; index?: string }
    const headerIndex = res.headers.get('x-contextgraph-index')
    const index = headerIndex ?? payload.index ?? ''
    const parsed = index ? (JSON.parse(index) as any) : {}

    return {
      index,
      agentId: payload.agentId ?? this.agentId,
      branch: payload.branch ?? this.branch,
      headHash: parsed.headHash ?? 'genesis',
      driftWarnings: [],
      skillIndex: parsed.skillIndex ?? [],
      knowledgeCount: parsed.knowledgeCount ?? 0,
      schemaStatus: warning ? 'degraded' : 'healthy'
    }
  }

  async commit(knowledge: KnowledgeCommitInput): Promise<CommitRef> {
    const query = `mutation CommitKnowledge($input: KnowledgeCommitInput!) {
      commitKnowledge(input: $input) {
        hash
      }
    }`

    const data = await this.gql<{ commitKnowledge: { hash: string } }>(query, { input: knowledge })
    return { hash: data.commitKnowledge.hash }
  }

  async close(message: string): Promise<CloseResult> {
    if (this.isTaskBranch(this.branch)) {
      const query = `mutation MergeBranch($branchName: String!, $strategy: String!) {
        mergeBranch(branchName: $branchName, strategy: $strategy) {
          status
          strategy
        }
      }`
      const data = await this.gql<{ mergeBranch: { status: string } }>(query, {
        branchName: this.branch,
        strategy: 'HUMAN_ARBITRATION'
      })
      return { merged: data.mergeBranch.status === 'MERGED', mergeStatus: data.mergeBranch.status }
    }

    return { merged: false, mergeStatus: message }
  }

  async getSkill(nameOrId: string): Promise<Skill> {
    const query = `query GetSkill($id: String!) {
      skill(id: $id) {
        id
        name
        versionHash
        implementation
        proficiency
      }
    }`
    const data = await this.gql<{ skill: Skill }>(query, { id: nameOrId })
    return data.skill
  }

  async getKnowledge(topic: string): Promise<KnowledgeNode[]> {
    const query = `query KnowledgeBase {
      knowledgeBase {
        id
        topic
        claim
        versionHash
        commitHash
        parentHash
        metadata
      }
    }`
    const data = await this.gql<{ knowledgeBase: KnowledgeNode[] }>(query)
    return data.knowledgeBase.filter((node) => node.topic === topic)
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
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join('; '))
    }
    if (!payload.data) {
      throw new Error('Empty GraphQL response')
    }
    return payload.data
  }

  onHumanRequired(handler: (event: HumanRequiredEvent) => Promise<void> | void): void {
    this.humanHandlers.push(handler)
  }

  private isTaskBranch(branch: string) {
    return branch.startsWith('agent/')
  }
}

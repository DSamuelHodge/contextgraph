import type { ProvenanceChain } from '@core/types'

export type VerificationResult = {
  ok: boolean
  missing: string[]
}

export type EpistemicState = {
  branchName: string
  at: Date
  commitHashes: string[]
}

export interface ProvenanceDataSource {
  getChain(nodeId: string): Promise<ProvenanceChain[]>
  getCommit(commitHash: string): Promise<ProvenanceChain | null>
  listCommitsBefore(branchName: string, at: Date): Promise<string[]>
}

export class ProvenanceTracker {
  constructor(private dataSource: ProvenanceDataSource) {}

  async chain(nodeId: string): Promise<ProvenanceChain[]> {
    return this.dataSource.getChain(nodeId)
  }

  async verify(commitHash: string): Promise<VerificationResult> {
    const commit = await this.dataSource.getCommit(commitHash)
    if (!commit) {
      return { ok: false, missing: [commitHash] }
    }

    const missing: string[] = []
    if (commit.parentHash) {
      const parent = await this.dataSource.getCommit(commit.parentHash)
      if (!parent) missing.push(commit.parentHash)
    }

    return { ok: missing.length === 0, missing }
  }

  async replay(branchName: string, at: Date): Promise<EpistemicState> {
    const commitHashes = await this.dataSource.listCommitsBefore(branchName, at)
    return {
      branchName,
      at,
      commitHashes
    }
  }
}

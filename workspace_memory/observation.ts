import type { RawObservation, ObservationReport, ObservationWriteInput } from '../types/index'

/**
 * ObservationEngine — the sixth ContextGraph behavior.
 *
 * Watches knowledge_nodes committed to a branch and generates structured
 * observations about patterns it detects: repeated claims, emerging consensus,
 * potentially promotable facts.
 *
 * Critically: this engine operates on the WORKSPACE layer, not the epistemic
 * layer. It writes to workspace_documents with kind=OBSERVATION or kind=CANDIDATE.
 * It never writes directly to knowledge_nodes. That boundary crossing is reserved
 * for the agent via commitKnowledge().
 *
 * The pipeline this enables:
 *
 *   memory_commits (epistemic writes)
 *        │
 *        ▼ ObservationEngine.scan()
 *   RawObservation[] (in-memory candidates)
 *        │
 *        ▼ ObservationEngine.deposit()
 *   workspace_documents (OBSERVATION | CANDIDATE kind)
 *        │
 *        ▼ agent reviews, calls commitKnowledge()
 *   knowledge_nodes (epistemic, validated, permanent)
 *
 * Confidence scoring:
 *   0.0 - 0.5  → OBSERVATION (informational, agent may ignore)
 *   0.5 - 0.7  → OBSERVATION (worth reviewing)
 *   0.7 - 1.0  → CANDIDATE (surfaced in context index, ready for promotion)
 *
 * The 0.7 threshold is the quality gate. Below it: the engine observed something
 * but isn't confident enough to propose promotion. Above it: the engine is making
 * a formal proposal.
 */

export const CANDIDATE_CONFIDENCE_THRESHOLD = 0.7
export const OBSERVATION_MIN_REPETITIONS = 2

export interface ObservationDataSource {
  /**
   * Load recent commits on a branch — the raw material for observation.
   * Returns commits in reverse chronological order.
   */
  listRecentCommits(branchName: string, limit: number): Promise<Array<{
    hash: string
    message: string
    snapshot: unknown
    schemaHash: string
    createdAt: Date | null
  }>>

  /**
   * Load knowledge nodes from a set of commit hashes.
   * These are the actual claims the engine will analyze.
   */
  listNodesByCommits(commitHashes: string[]): Promise<Array<{
    id: string
    topic: string
    claim: string
    versionHash: string
    metadata: unknown
  }>>

  /**
   * Check if a workspace document already exists at this path for this agent+branch.
   * Used to avoid duplicate observations.
   */
  findWorkspaceDoc(agentId: string, branchName: string, path: string): Promise<{
    id: string
    confidence: number | null
    kind: string
  } | null>

  /**
   * Write a new workspace document (OBSERVATION or CANDIDATE).
   */
  writeWorkspaceDoc(
    agentId: string,
    branchName: string,
    doc: ObservationWriteInput
  ): Promise<{ id: string }>

  /**
   * Update an existing workspace document — used when an observation
   * gains confidence over time (more commits confirming the same claim).
   */
  updateWorkspaceDoc(id: string, updates: {
    content?: string
    confidence?: number
    kind?: string
    updatedAt: Date
  }): Promise<void>

  /**
   * Load valid oracle type names for topic validation.
   * Returns empty array if no oracles registered (bootstrap mode).
   */
  listOracleTypeNames(): Promise<string[]>
}

export class ObservationEngine {
  constructor(private dataSource: ObservationDataSource) {}

  /**
   * Main entry point. Scans a branch's recent commits, generates observations,
   * deposits them into workspace_documents.
   *
   * Called by the drift queue consumer alongside runMaintenance().
   */
  async scan(agentId: string, branchName: string, lookbackLimit = 50): Promise<ObservationReport> {
    const commits = await this.dataSource.listRecentCommits(branchName, lookbackLimit)
    if (commits.length === 0) {
      return {
        branchName,
        commitsScanned: 0,
        observationsGenerated: 0,
        candidatesPromoted: 0,
        existingCandidatesUpdated: 0
      }
    }

    const commitHashes = commits.map(c => c.hash)
    const nodes = await this.dataSource.listNodesByCommits(commitHashes)
    const oracleTypes = new Set(await this.dataSource.listOracleTypeNames())

    const rawObservations = this.extractObservations(nodes, oracleTypes)

    let observationsGenerated = 0
    let candidatesPromoted = 0
    let existingCandidatesUpdated = 0

    for (const obs of rawObservations) {
      const path = `observations/${obs.topic}/${this.slugify(obs.claim)}`
      const existing = await this.dataSource.findWorkspaceDoc(agentId, branchName, path)

      const newKind = obs.confidence >= CANDIDATE_CONFIDENCE_THRESHOLD ? 'CANDIDATE' : 'OBSERVATION'
      const content = this.formatObservationContent(obs)

      if (existing) {
        // Update confidence if it increased — claim is being reinforced by more commits
        if (obs.confidence > (existing.confidence ?? 0)) {
          const wasCandidate = existing.kind === 'CANDIDATE'
          await this.dataSource.updateWorkspaceDoc(existing.id, {
            content,
            confidence: obs.confidence,
            kind: newKind,
            updatedAt: new Date()
          })
          if (!wasCandidate && newKind === 'CANDIDATE') {
            candidatesPromoted++
          }
          existingCandidatesUpdated++
        }
      } else {
        await this.dataSource.writeWorkspaceDoc(agentId, branchName, {
          path,
          content,
          kind: newKind,
          confidence: obs.confidence,
          sourceCommitHashes: obs.sourceCommitHashes
        })
        observationsGenerated++
        if (newKind === 'CANDIDATE') candidatesPromoted++
      }
    }

    return {
      branchName,
      commitsScanned: commits.length,
      observationsGenerated,
      candidatesPromoted,
      existingCandidatesUpdated
    }
  }

  /**
   * Core analysis: find patterns in knowledge nodes that suggest
   * promotable facts.
   *
   * Scoring model:
   *   - repetition: same claim on same topic across multiple commits → high signal
   *   - oracle alignment: topic matches a known oracle type → confidence boost
   *   - claim stability: claim hasn't changed across repetitions → high confidence
   *   - single appearance: low confidence, just log as OBSERVATION
   */
  extractObservations(
    nodes: Array<{ id: string; topic: string; claim: string; versionHash: string; metadata: unknown }>,
    oracleTypes: Set<string>
  ): RawObservation[] {
    // Group by topic → claim
    const topicClaimMap = new Map<string, Map<string, {
      count: number
      nodeIds: string[]
      commitHashes: string[]
      versionHashes: Set<string>
    }>>()

    for (const node of nodes) {
      const claimMap = topicClaimMap.get(node.topic) ?? new Map()
      const existing = claimMap.get(node.claim) ?? {
        count: 0,
        nodeIds: [],
        commitHashes: [],
        versionHashes: new Set<string>()
      }
      existing.count++
      existing.nodeIds.push(node.id)
      existing.versionHashes.add(node.versionHash)
      // commitHash is in metadata
      const meta = node.metadata as any
      if (meta?.commitHash) existing.commitHashes.push(meta.commitHash)
      claimMap.set(node.claim, existing)
      topicClaimMap.set(node.topic, claimMap)
    }

    const observations: RawObservation[] = []

    for (const [topic, claimMap] of topicClaimMap.entries()) {
      for (const [claim, data] of claimMap.entries()) {
        if (data.count < 1) continue

        const confidence = this.computeConfidence({
          repetitionCount: data.count,
          isOracleAligned: oracleTypes.size === 0 || oracleTypes.has(topic), // bootstrap: all aligned
          claimIsStable: data.versionHashes.size === 1, // one versionHash = claim never changed
          totalNodesOnTopic: (topicClaimMap.get(topic)?.size ?? 1)
        })

        observations.push({
          topic,
          claim,
          confidence,
          sourceCommitHashes: data.commitHashes,
          evidenceRefs: data.nodeIds,
          repetitionCount: data.count
        })
      }
    }

    // Sort by confidence descending — most promotable first
    return observations.sort((a, b) => b.confidence - a.confidence)
  }

  private computeConfidence(factors: {
    repetitionCount: number
    isOracleAligned: boolean
    claimIsStable: boolean
    totalNodesOnTopic: number
  }): number {
    // Base: repetition score — logarithmic, caps at ~0.7 around 5 repetitions
    const repetitionScore = Math.min(0.7, Math.log2(factors.repetitionCount + 1) / Math.log2(7))

    // Oracle alignment bonus: if topic is a known type, we trust the claim more
    const alignmentBonus = factors.isOracleAligned ? 0.15 : 0.0

    // Stability bonus: if the claim never changed version hash, it's settled
    const stabilityBonus = factors.claimIsStable ? 0.15 : 0.0

    // Diversity penalty: if many different claims exist for this topic,
    // any single claim is less trustworthy (there's disagreement)
    const diversityPenalty = factors.totalNodesOnTopic > 3
      ? Math.min(0.2, (factors.totalNodesOnTopic - 3) * 0.05)
      : 0.0

    return Math.min(1.0, Math.max(0.0,
      repetitionScore + alignmentBonus + stabilityBonus - diversityPenalty
    ))
  }

  private formatObservationContent(obs: RawObservation): string {
    const threshold = obs.confidence >= CANDIDATE_CONFIDENCE_THRESHOLD
    return [
      `---`,
      `topic: ${obs.topic}`,
      `confidence: ${obs.confidence.toFixed(3)}`,
      `kind: ${threshold ? 'CANDIDATE' : 'OBSERVATION'}`,
      `repetitions: ${obs.repetitionCount}`,
      `evidence: [${obs.evidenceRefs.slice(0, 5).join(', ')}]`,
      `---`,
      ``,
      `## Observed Claim`,
      ``,
      `> ${obs.claim}`,
      ``,
      threshold
        ? `**This claim is ready for promotion.** Call \`commitKnowledge\` with topic \`${obs.topic}\` to promote to canonical epistemic memory.`
        : `This claim has been observed ${obs.repetitionCount} time(s). Confidence ${(obs.confidence * 100).toFixed(0)}% — needs more evidence before promotion.`,
    ].join('\n')
  }

  private slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  }
}
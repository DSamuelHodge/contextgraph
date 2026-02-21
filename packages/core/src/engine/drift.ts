import type { DriftEvent, DriftSeverity, RemediationPolicy } from '@core/types'
import { EngineEventEmitter } from './events'

export type TypeMap = {
  hash: string
  operations: string[]
  added?: string[]
  removed?: string[]
  deprecated?: string[]
  corruption?: boolean
}

export type RemediationResult = {
  action: RemediationPolicy
  requiresHuman: boolean
  message: string
}

export interface DriftDataSource {
  loadTypeMap(endpointId: string): Promise<{ before: TypeMap; after: TypeMap }>
  updateEndpoint?(endpointId: string, severity: DriftSeverity): Promise<void>
}

export class DriftDetector {
  constructor(
    private dataSource: DriftDataSource,
    private events?: EngineEventEmitter
  ) {}

  async detect(endpointId: string): Promise<DriftEvent> {
    const { before, after } = await this.dataSource.loadTypeMap(endpointId)
    const severity = await this.classify(before, after)
    const remediationPolicy = this.mapPolicy(severity)

    await this.dataSource.updateEndpoint?.(endpointId, severity)

    return {
      endpointId,
      severity,
      affectedOperations: this.affectedOperations(before, after),
      remediationPolicy,
      detectedAt: new Date()
    }
  }

  async classify(before: TypeMap, after: TypeMap): Promise<DriftSeverity> {
    if (after.corruption) return 'CORRUPTION'
    if ((after.removed ?? []).length > 0) return 'BREAKING'
    if ((after.deprecated ?? []).length > 0) return 'DEPRECATION'
    if ((after.added ?? []).length > 0) return 'ADDITIVE'
    if (before.hash !== after.hash) return 'SILENT'
    return 'SILENT'
  }

  async remediate(event: DriftEvent): Promise<RemediationResult> {
    if (event.severity === 'CORRUPTION') {
      this.events?.emitHumanRequired({
        type: 'CORRUPTION_DETECTED',
        endpointId: event.endpointId,
        detail: 'Type map corruption detected'
      })
      return {
        action: 'ROLLBACK',
        requiresHuman: true,
        message: 'Corruption detected; blocking until human review.'
      }
    }

    const action = event.remediationPolicy
    return {
      action,
      requiresHuman: false,
      message: `Applied remediation policy ${action}.`
    }
  }

  private mapPolicy(severity: DriftSeverity): RemediationPolicy {
    switch (severity) {
      case 'CORRUPTION':
        return 'ROLLBACK'
      case 'BREAKING':
        return 'PAUSE_NOTIFY'
      case 'DEPRECATION':
        return 'REGROUND'
      case 'ADDITIVE':
      case 'SILENT':
      default:
        return 'AUTO_SYNC'
    }
  }

  private affectedOperations(before: TypeMap, after: TypeMap) {
    const removed = after.removed ?? []
    const added = after.added ?? []
    const deprecated = after.deprecated ?? []
    const changed = before.hash !== after.hash ? after.operations : []
    return Array.from(new Set([...removed, ...added, ...deprecated, ...changed]))
  }
}

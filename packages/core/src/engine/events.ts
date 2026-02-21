import { NoopBackend, type TelemetryBackend, type TelemetryEvent } from '../telemetry'

export type EngineEventType =
  | 'DRIFT_DETECT'
  | 'COLLISION_RESOLVE'
  | 'DECAY_SCAN'
  | 'CONVERGENCE_PROMOTE'
  | 'SESSION_RESUME'
  | 'COMMIT_KNOWLEDGE'
  | 'HUMAN_REQUIRED'

export type EngineEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  type: EngineEventType
  agentId: string
  branchName: string
  payload?: TPayload
}

export type HumanRequiredEvent =
  | { type: 'EPISTEMIC_COLLISION'; collisionId: string; detail: string }
  | { type: 'POLICY_CONFLICT'; collisionId: string; field: string }
  | { type: 'CORRUPTION_DETECTED'; endpointId: string; detail: string }

export type HumanRequiredHandler = (event: HumanRequiredEvent) => Promise<void> | void
export type EngineEventHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> = (
  event: EngineEvent<TPayload>
) => Promise<void> | void

export class EngineEventEmitter {
  private humanHandlers: HumanRequiredHandler[] = []
  private handlers = new Map<EngineEventType, EngineEventHandler[]>()
  private telemetry: TelemetryBackend = new NoopBackend()

  setTelemetry(backend: TelemetryBackend): void {
    this.telemetry = backend
  }

  on<TPayload extends Record<string, unknown>>(type: EngineEventType, handler: EngineEventHandler<TPayload>): void {
    const handlers = this.handlers.get(type) ?? []
    handlers.push(handler as EngineEventHandler)
    this.handlers.set(type, handlers)
  }

  async emit<TPayload extends Record<string, unknown>>(event: EngineEvent<TPayload>): Promise<void> {
    this.telemetry.record({
      eventType: event.type,
      agentId: event.agentId,
      branchName: event.branchName,
      humanRequired: event.type === 'HUMAN_REQUIRED',
      ...(event.payload as Partial<TelemetryEvent> | undefined)
    })

    const handlers = this.handlers.get(event.type) ?? []
    await Promise.all(handlers.map(async (handler) => handler(event)))
  }

  onHumanRequired(handler: HumanRequiredHandler) {
    this.humanHandlers.push(handler)
  }

  emitHumanRequired(event: HumanRequiredEvent) {
    this.telemetry.record({
      eventType: 'HUMAN_REQUIRED',
      agentId: 'system',
      branchName: 'main',
      humanRequired: true,
      collisionClass: event.type,
      endpointId: 'endpointId' in event ? event.endpointId : undefined
    })

    for (const handler of this.humanHandlers) {
      void handler(event)
    }
  }
}

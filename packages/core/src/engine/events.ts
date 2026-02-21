export type HumanRequiredEvent =
  | { type: 'EPISTEMIC_COLLISION'; collisionId: string; detail: string }
  | { type: 'POLICY_CONFLICT'; collisionId: string; field: string }
  | { type: 'CORRUPTION_DETECTED'; endpointId: string; detail: string }

export type HumanRequiredHandler = (event: HumanRequiredEvent) => Promise<void> | void

export class EngineEventEmitter {
  private humanHandlers: HumanRequiredHandler[] = []

  onHumanRequired(handler: HumanRequiredHandler) {
    this.humanHandlers.push(handler)
  }

  emitHumanRequired(event: HumanRequiredEvent) {
    for (const handler of this.humanHandlers) {
      void handler(event)
    }
  }
}

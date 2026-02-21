export class BreakingDriftError extends Error {
  constructor(message = 'Breaking drift detected') {
    super(message)
    this.name = 'BreakingDriftError'
  }
}

export class CorruptionError extends Error {
  constructor(message = 'Schema corruption detected') {
    super(message)
    this.name = 'CorruptionError'
  }
}

export class EpistemicCollisionError extends Error {
  constructor(message = 'Epistemic collision requires human arbitration') {
    super(message)
    this.name = 'EpistemicCollisionError'
  }
}

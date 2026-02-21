export type SessionState = {
  branchName: string
  approvalState: string | null
  subscriptions: string[]
  scratchpad: Record<string, unknown>
}

export class AgentSessionDO {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/session') {
      const payload = (await request.json().catch(() => ({}))) as Partial<SessionState>
      const nextState: SessionState = {
        branchName: payload.branchName ?? 'main',
        approvalState: payload.approvalState ?? null,
        subscriptions: payload.subscriptions ?? [],
        scratchpad: payload.scratchpad ?? {}
      }
      await this.state.storage.put('session', nextState)
      return new Response(null, { status: 204 })
    }

    if (request.method === 'GET' && url.pathname === '/session') {
      const session = (await this.state.storage.get<SessionState>('session')) ?? null
      return Response.json(session)
    }

    return new Response('Not found', { status: 404 })
  }
}

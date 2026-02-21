type AnalyticsQueryResult = {
  success?: boolean
  errors?: Array<{ message?: string }>
  result?: unknown
}

export async function dashboardHandler(_req: Request, env: Env): Promise<Response> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return new Response(renderDashboard({ error: 'missing CF_ACCOUNT_ID or CF_API_TOKEN env vars' }), {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    })
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'text/plain'
      },
      body: `
        SELECT
          blob1 as agent_id,
          index1 as event_type,
          blob4 as severity,
          SUM(double4) as human_required_count,
          COUNT() as total,
          toStartOfHour(timestamp) as hour
        FROM contextgraph_events
        WHERE timestamp > NOW() - INTERVAL '24' HOUR
        GROUP BY agent_id, event_type, severity, hour
        ORDER BY hour DESC
      `
    }
  )

  const data = (await res.json().catch(() => ({ success: false, errors: [{ message: 'invalid json response' }] }))) as AnalyticsQueryResult
  if (!res.ok || data.success === false) {
    return new Response(renderDashboard({ error: data.errors?.[0]?.message ?? 'analytics query failed' }), {
      headers: { 'Content-Type': 'text/html' },
      status: 502
    })
  }

  return new Response(renderDashboard(data), {
    headers: { 'Content-Type': 'text/html' }
  })
}

export function renderDashboard(data: unknown): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>ContextGraph Dashboard</title>
  <style>
    body { font-family: monospace; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #333; padding: 0.5rem 1rem; text-align: left; }
    th { background: #1a1a1a; }
    .breaking { color: #ff4444; }
    .synchronized { color: #44ff44; }
    .human { color: #ffaa00; }
  </style>
</head>
<body>
  <h1>ContextGraph — Last 24h</h1>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`
}

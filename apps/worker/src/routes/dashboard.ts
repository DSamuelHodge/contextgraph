import schema from '../../../../packages/core/src/schema'
import type { DB } from '../db'

export async function renderDashboard(db: DB) {
  const endpoints = await db.select().from(schema.schema_endpoints)
  const branches = await db.select().from(schema.branches)

  const endpointRows = endpoints.map((endpoint: any) => {
    return `<tr><td>${endpoint.name}</td><td>${endpoint.driftStatus ?? 'UNKNOWN'}</td><td>${endpoint.currentHash ?? 'unknown'}</td></tr>`
  }).join('')

  const branchRows = branches.map((branch: any) => {
    return `<tr><td>${branch.name}</td><td>${branch.status ?? 'ACTIVE'}</td><td>${branch.headHash ?? 'genesis'}</td></tr>`
  }).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ContextGraph Dashboard</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    h2 { font-size: 18px; margin-top: 24px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .card { border: 1px solid #ddd; padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>ContextGraph Dashboard</h1>
  <div class="grid">
    <div class="card"><strong>Drift events (24h)</strong><div>Data source pending</div></div>
    <div class="card"><strong>Human-required queue</strong><div>Data source pending</div></div>
    <div class="card"><strong>Convergence promotions</strong><div>Data source pending</div></div>
  </div>

  <h2>Active Branches</h2>
  <table>
    <thead><tr><th>Name</th><th>Status</th><th>Head</th></tr></thead>
    <tbody>${branchRows}</tbody>
  </table>

  <h2>Schema Endpoints</h2>
  <table>
    <thead><tr><th>Name</th><th>Drift Status</th><th>Hash</th></tr></thead>
    <tbody>${endpointRows}</tbody>
  </table>
</body>
</html>`
}

CREATE TABLE IF NOT EXISTS contextgraph_events (
  timestamp         DateTime64(3, 'UTC'),
  event_type        LowCardinality(String),
  severity          LowCardinality(String),
  collision_class   LowCardinality(String),
  agent_role        LowCardinality(String),
  drift_status      LowCardinality(String),
  agent_id          String,
  branch_name       String,
  endpoint_id       String,
  workspace_id      String,
  trace_id          String,
  span_id           String,
  parent_span_id    String,
  token_count       UInt16,
  decay_score       Float32,
  duration_ms       UInt32,
  human_required    UInt8,
  payload           String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, agent_id, timestamp)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS contextgraph_roi_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (workspace_id, day)
AS SELECT
  workspace_id,
  toDate(timestamp) AS day,
  countIf(event_type = 'DRIFT_DETECTED' AND severity = 'BREAKING') AS incidents_prevented,
  countIf(event_type = 'COLLISION_RESOLVED' AND collision_class = 'EPISTEMIC') AS decisions_corrected,
  countIf(event_type = 'CONVERGENCE_PROMOTED') AS knowledge_compounded,
  countIf(human_required = 1) AS human_interventions,
  avg(token_count) AS avg_token_count,
  count() AS total_events
FROM contextgraph_events
GROUP BY workspace_id, day;

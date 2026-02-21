# Architecture

ContextGraph is a self-operational memory layer built on a git-inspired spine. Every knowledge change is an append-only commit and every agent operates on a branch.

## The Five Behaviors

### Drift
Detects schema changes in live GraphQL oracles and classifies severity.

### Collision
Detects incompatible knowledge writes and routes resolution based on collision class.

### Decay
Scores knowledge freshness and tombstones likely stale nodes.

### Convergence
Promotes independently reached knowledge to canonical status.

### Provenance
Records the causal chain for every claim and supports replay.

## Feedback Loop

```
   [Schema Change] -> [Drift] -> [Remediate]
                         |             
                         v             
 [Collision] <- [Merge Attempt] -> [Provenance]
      |                               |
      v                               v
   [Decay] ----------------------> [Convergence]
```

## Push vs Pull Boundary
ContextGraph pushes a compact context index at session start. Agents do not fetch it. All other queries are lazy and agent-initiated.

## Append-Only Constraint
All tables except branches are append-only. This preserves the audit trail and enables replay across time.

## Why Introspection Replaces Documentation
The agent does not read docs about your data layer.
It issues { __schema { ... } } and builds a live type map.
Adding a collection to your CMS is sufficient - no ContextGraph
config change required. The schema oracle detects it on next sync.

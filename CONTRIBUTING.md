# Contributing to ContextGraph

ContextGraph is an OSS-first project. This document explains contribution expectations and the five self-operational behaviors contributors must reference.

The Five Behaviors

- DRIFT: detects when live GraphQL schemas change under the agent. Contribs should include tests for detection and remediation logic.
- COLLISION: resolves conflicts when agents write incompatible knowledge. Changes must preserve append-only guarantees and emit human-required events where appropriate.
- DECAY: identifies and tombstones likely-stale knowledge. Ensure tombstoning is reversible for audit and include clear thresholds.
- CONVERGENCE: promotes independently-reached knowledge to canonical status. Contributions must document promotion criteria and reproducible tests.
- PROVENANCE: records causal chains for every piece of knowledge. Any change touching storage or history must preserve replayability.

When opening a pull request, please indicate which of the five behaviors your change touches and include tests or a manual verification checklist.

Required Secrets and CI

The CI and deploy workflows use the following secrets: `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HYPERDRIVE_PREVIEW_ID`.

Code style and testing

- Formatting and linting: `biome`
- Testing: `vitest`

Thanks for contributing — follow the behavior-first checklist in PR descriptions.

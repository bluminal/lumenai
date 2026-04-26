# Scenario (d): Prefer-With-Fallback Continues

## Overview

After stale-pool cleanup, `routing_mode=prefer-with-fallback` causes silent fallback to fresh-spawn rather than aborting. No error is shown to the user.

## Scenario Steps

### Step 1 — Discovery Started

Router finds `stale-pool` as the only pool; `routing_mode=prefer-with-fallback`.

**Frame:** `discovery_started`

### Step 2 — Stale Detected and Cleaned

FR-MMT22 triggers; pool removed; warning shown.

**Frame:** `stale_detected_and_cleaned`

### Step 3 — Routing Fallback

No pool left after cleanup. `prefer-with-fallback` → `routing_decision: fell-back-no-pool`, `silent: true`, `error_shown: false`.

**Frame:** `routing_fallback`

### Step 4 — Fresh Review Spawned

Command proceeds normally with a fresh review spawn.

**Frame:** `fresh_review_spawned`

## Key Invariants

- `routing_decision: fell-back-no-pool`
- `error_shown: false` (fallback is silent in prefer-with-fallback mode)
- `result: fresh_spawn_started`

## References

- `docs/specs/multi-model-teams/routing.md` §7 — Stale-Pool Cleanup (FR-MMT22)

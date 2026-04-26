# Scenario (e): Explicit-Pool-Required Aborts

## Overview

After stale-pool cleanup, `routing_mode=explicit-pool-required` cannot fall back — command aborts with an error visible to the user.

## Scenario Steps

### Step 1 — Discovery Started

Router finds `stale-pool` as the only pool; `routing_mode=explicit-pool-required`.

**Frame:** `discovery_started`

### Step 2 — Stale Detected and Cleaned

FR-MMT22 triggers; pool removed; warning shown.

**Frame:** `stale_detected_and_cleaned`

### Step 3 — Routing Abort

No pool left after cleanup. `explicit-pool-required` → `routing_decision: fell-back-no-pool`, `abort: true`, `error_shown: true`, error text contains "No standing pool matches".

**Frame:** `routing_abort`

### Step 4 — Command Aborted

Command halts. `result: aborted`.

**Frame:** `command_aborted`

## Key Invariants

- `routing_decision: fell-back-no-pool`
- `abort: true`
- `error_shown: true`
- `error_text_contains: "No standing pool matches"`
- `result: aborted`

## References

- `docs/specs/multi-model-teams/routing.md` §7 — Stale-Pool Cleanup (FR-MMT22)

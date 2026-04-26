# Scenario: Idle Persistence and `idle ↔ active` State Transitions

## Overview

This fixture documents the expected behavior of a standing pool across its idle-and-claim lifecycle. It validates that:

1. A pool remains `idle` when spawned with no work.
2. The TeammateIdle hook fires on idle events and updates `last_active_at` using max-semantics.
3. The debounce guard prevents writes when a TeammateIdle event fires within 30 seconds of the last write.
4. Submitting a task transitions the pool from `idle → active`.
5. Task completion transitions the pool from `active → idle`.
6. The pool does NOT shut down when the task list empties — it persists, awaiting future work.
7. `last_active_at` is monotonically non-decreasing across all writes.

## Pool Under Test

- **Name:** `review-pool`
- **Reviewers:** `code-reviewer`, `security-reviewer` (2 reviewers)
- **multi_model:** `false`
- **ttl_minutes:** `60`

## Scenario Steps

### Step 1 — Spawn

The pool is created via `/synthex-plus:start-review-team`. No work is submitted. The Pool Lead writes `config.json` and the `index.json` entry with `pool_state: "idle"` and `last_active_at` set to the spawn timestamp (T0).

**Frame:** `spawn`
**Expected:** `pool_state: "idle"`, `last_active_at: T0`

### Step 2 — First TeammateIdle Hook Fires

One of the pool reviewers finishes its initialization and goes idle. The TeammateIdle hook observes this event and calls the Pool Lead to update `last_active_at`. The Pool Lead reads the current `last_active_at` (T0), compares against the hook's proposed timestamp (T1 > T0), and writes T1 using max-semantics. Both `config.json` and `index.json` are updated.

**Frame:** `idle-hook-fires-1`
**Expected:** `pool_state: "idle"`, `last_active_at: T1 > T0`

### Step 3 — Second TeammateIdle Hook Fires (Monotonic Advance)

A minute later, the second reviewer also fires an idle event. The hook proposes T2 > T1. The Pool Lead reads T1, compares against T2, and writes T2. This confirms the monotonic non-decreasing invariant holds across multiple consecutive idle events.

**Frame:** `idle-hook-fires-2`
**Expected:** `pool_state: "idle"`, `last_active_at: T2 > T1`

### Step 4 — Debounce Skips Write

Immediately (within 30 seconds of T2), a third TeammateIdle fires. The Pool Lead's debounce guard detects that the last write was within the 30-second debounce window and skips the write entirely. `last_active_at` remains T2.

This is an important edge case: the debounce guard prevents thrashing writes when reviewers bounce in and out of idle rapidly. The value does NOT regress — it stays at T2.

**Frame:** `debounce-skip`
**Expected:** `pool_state: "idle"`, `last_active_at: T2` (unchanged from previous frame)

### Step 5 — Task Claimed

A task is submitted to the pool. The Pool Lead claims it and transitions `pool_state: "idle" → "active"`. `last_active_at` is updated to T3 >= T2 using max-semantics. Both `config.json` and `index.json` are written.

**Frame:** `task-claimed`
**Expected:** `pool_state: "active"`, `last_active_at: T3 >= T2`

### Step 6 — Task Completes

The reviewers complete the task. The task list empties. The Pool Lead transitions `pool_state: "active" → "idle"`. `last_active_at` is updated to T4 >= T3. Both `config.json` and `index.json` are written.

**Frame:** `task-complete`
**Expected:** `pool_state: "idle"`, `last_active_at: T4 >= T3`

### Step 7 — Pool Stays Alive (idle-after-empty)

After the task completes and the task list is empty, the pool remains alive. It does NOT enter `draining` or `stopping`. Standing pools only shut down on TTL expiry or explicit `/stop-review-team`. An empty task list is expected and normal — the pool is simply idle, waiting for future work.

**Frame:** `idle-after-empty`
**Expected:** `pool_state: "idle"`, `last_active_at: T4` (same as task-complete frame — no new writes)

## Key Invariants

- `last_active_at` is monotonically non-decreasing: `T0 ≤ T1 ≤ T2 = T2 (debounce) ≤ T3 ≤ T4`
- `pool_state` sequence: `idle → idle → idle → idle → active → idle → idle`
- Pool does NOT shut down when task list empties (no `draining` or `stopping` states)
- Debounce skips the write but never regresses the timestamp

## References

- `docs/specs/multi-model-teams/pool-lifecycle.md` §4 — Writer-Ordering Rules (FR-MMT12)
- `docs/specs/multi-model-teams/pool-lifecycle.md` §3 — Pool State Machine
- `tests/schemas/standing-pool-config.ts` — Pool config.json schema validator
- `tests/schemas/standing-pool-index.ts` — Pool index.json schema validator

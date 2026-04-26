# Scenario: One-Team-Per-Session Exemption for Standing Pools (FR-MMT26)

## Overview

This fixture verifies that standing pools are exempt from the one-team-per-session limit (FR-MMT26).
A standing pool and a non-standing `/team-review` invocation can coexist in the same session.
However, two non-standing teams still trigger the original conflict error.

### Key Invariants

1. Standing pools do NOT count toward the one-team-per-session limit.
2. A session with one active standing pool may still spawn exactly one non-standing team.
3. A second non-standing spawn attempt aborts with the original error message (unchanged).
4. The standing pool is unaffected by a non-standing team conflict.

## Pool Under Test

- **Name:** `review-pool`
- **Type:** standing
- **Session:** `sess-abc123`

## Scenario Steps

### Frame 1 — `standing_pool_active`

A standing pool named `review-pool` has been started in the session via `/synthex-plus:start-review-team`.
No non-standing teams exist yet.

**Expected:**
- `pool_name: "review-pool"`, `pool_type: "standing"`
- `session_team_count_non_standing: 0`

### Frame 2 — `first_non_standing_spawned`

The user runs `/team-review`. Because the only active team is a standing pool (which is exempt
under FR-MMT26), the spawn is allowed. A non-standing team `review-a3f7b2c1` is created.

**Expected:**
- `team_name: "review-a3f7b2c1"`, `team_type: "non-standing"`
- `session_team_count_non_standing: 1`
- `spawn_allowed: true`

### Frame 3 — `second_non_standing_attempt`

The user runs `/team-review` again. Now `session_team_count_non_standing` is 1. The
one-team-per-session limit applies to non-standing teams only. The spawn is blocked.

**Expected:**
- `session_team_count_non_standing: 1`
- `spawn_allowed: false`

### Frame 4 — `error_shown`

The original error message is surfaced to the user. FR-MMT26 criterion 3: the error text for
non-standing team conflicts is not modified — it starts with `"Error: An active team"` and
includes the name of the existing non-standing team.

**Expected:**
- `error_message_prefix: "Error: An active team"`
- `error_contains_existing_team_name: true`

### Frame 5 — `standing_pool_unaffected`

After the non-standing conflict, the standing pool remains in `idle` state with no interruption.
The conflict between non-standing teams does not affect standing pool state.

**Expected:**
- `pool_name: "review-pool"`, `pool_state: "idle"`
- `affected_by_conflict: false`

## References

- `docs/specs/multi-model-teams/` — FR-MMT26: standing pool one-team-per-session exemption
- `plugins/synthex-plus/commands/team-implement.md` — enforces FR-MMT26 in spawn logic
- `tests/schemas/one-team-per-session.test.ts` — Layer 1 Vitest suite for this fixture

# Scenario (c): Warning Once Per Session

## Overview

Same pool encountered multiple times in one session. Warning fires only once per pool (session marker). A different pool in the same session still gets its own warning.

## Scenario Steps

### Step 1 — First Discovery

`old-pool` found stale. No prior warnings this session.

**Frame:** `first_discovery`

### Step 2 — First Cleanup

`old-pool` cleaned up. Warning shown. Session marker set for `old-pool`.

**Frame:** `first_cleanup`

### Step 3 — Second Discovery

`old-pool` no longer in index. `other-pool` found stale. `old-pool` marker has no effect here.

**Frame:** `second_discovery`

### Step 4 — Second Cleanup

`other-pool` cleaned up. Warning shown for `other-pool` (separate pool). Marker set for `other-pool`.

**Frame:** `second_cleanup`

### Step 5 — Third Discovery (Suppressed)

`old-pool` hypothetically re-encountered. Session marker suppresses the duplicate warning.

**Frame:** `third_discovery`

## Key Invariants

- First encounter: `warning_shown: true`, `session_marker_set: true`
- Different pool in same session: `warning_shown: true` (separate marker)
- Same pool re-encountered: `warning_shown: false`, `suppressed_by_session_marker: true`

## References

- `docs/specs/multi-model-teams/routing.md` §7 — Stale-Pool Cleanup (FR-MMT22)

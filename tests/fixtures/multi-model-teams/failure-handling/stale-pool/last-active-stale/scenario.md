# Scenario (b): Last-Active Stale

## Overview

FR-MMT22 Condition 2 — `last_active_at` is older than `max(ttl_minutes, 24h)`. Pool is 56 hours inactive with a `ttl_minutes=60` config, so the 24h floor applies.

## Pool Under Test

- **Name:** `old-pool`
- **ttl_minutes:** 60
- **last_active_at:** `2026-04-24T00:00:00Z` (56h before `now`)
- **now:** `2026-04-26T08:00:00Z`

## Scenario Steps

### Step 1 — Discovery Started

Router reads `index.json` and finds `old-pool` listed as `idle`. Computes `max(60min, 24h) = 24h` floor; pool inactive for 56h > 24h.

**Frame:** `discovery_started`

### Step 2 — Stale Detected

FR-MMT22 Condition 2 fires. `detection_reason` is `last-active-stale`; `hours_inactive` is 56.

**Frame:** `stale_detected`

### Step 3 — Cleanup Invoked

`standing-pool-cleanup` agent removes both the index entry and the metadata_dir.

**Frame:** `cleanup_invoked`

### Step 4 — Warning Shown

User sees: `"Standing pool 'old-pool' was stale and has been cleaned up. Falling back to fresh-spawn review."`

**Frame:** `warning_shown`

## Key Invariants

- `detection_reason: last-active-stale` (Condition 2)
- `hours_inactive: 56` exceeds `max(60min, 24h) = 24h`
- Both `removed_index_entry` and `removed_metadata_dir` are `true`
- Warning text matches FR-MMT22 verbatim fragments

## References

- `docs/specs/multi-model-teams/routing.md` §7 — Stale-Pool Cleanup (FR-MMT22)

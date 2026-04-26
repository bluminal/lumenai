# Scenario (a): Metadata Directory Missing

## Overview

FR-MMT22 Condition 1 — the pool's `metadata_dir` referenced in `index.json` does not exist on disk. Discovery detects this, invokes the cleanup agent, and shows a one-time warning.

## Pool Under Test

- **Name:** `review-pool`
- **Condition:** `metadata_dir_exists: false`

## Scenario Steps

### Step 1 — Discovery Started

Router reads `index.json` and finds `review-pool` listed as `idle`. The `metadata_dir` path does not exist on disk.

**Frame:** `discovery_started`

### Step 2 — Stale Detected

FR-MMT22 Condition 1 fires. `detection_reason` is `metadata-missing`.

**Frame:** `stale_detected`

### Step 3 — Cleanup Invoked

`standing-pool-cleanup` agent removes the index entry. Metadata dir removal skipped (dir absent).

**Frame:** `cleanup_invoked`

### Step 4 — Warning Shown

User sees: `"Standing pool 'review-pool' was stale and has been cleaned up. Falling back to fresh-spawn review."`

**Frame:** `warning_shown`

## Key Invariants

- `detection_reason: metadata-missing` (Condition 1, not Condition 2)
- `removed_index_entry: true` always
- `removed_metadata_dir: false` when dir does not exist
- Warning text matches FR-MMT22 verbatim fragments

## References

- `docs/specs/multi-model-teams/routing.md` §7 — Stale-Pool Cleanup (FR-MMT22)

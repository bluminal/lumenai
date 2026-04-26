# Scenario (f): FR-MMT22 vs FR-MMT28 Warning Strings Are Distinct

## Overview

FR-MMT22 (stale-pool cleanup during routing) and FR-MMT28 (orphaned-pool background cleanup) use different verbatim warning strings. This fixture asserts they are non-equal.

## Scenario Steps

### Step 1 — FR-MMT22 Warning

Routing-time stale detection warning.

**Frame:** `fr_mmt22_warning`

**Warning:** `"Standing pool 'test-pool' was stale and has been cleaned up. Falling back to fresh-spawn review."`

### Step 2 — FR-MMT28 Warning

Background orphaned-pool cleanup warning.

**Frame:** `fr_mmt28_warning`

**Warning:** `"Standing pool 'test-pool' appears orphaned (TTL elapsed and inactive for >24h). It has been cleaned up automatically."`

## Key Invariants

- `fr_mmt22_warning.warning_text ≠ fr_mmt28_warning.warning_text` (strict non-equality)
- FR-MMT22 warning mentions "was stale and has been cleaned up"
- FR-MMT28 warning mentions "appears orphaned"

## References

- `docs/specs/multi-model-teams/routing.md` §7 — Stale-Pool Cleanup (FR-MMT22, FR-MMT28 distinction)

# Baseline snapshot: /synthex:review-code routing (standing_pools.enabled: false)

## Routing baseline relationship

This file documents the routing-layer baseline for `/synthex:review-code` when
`standing_pools.enabled: false` (or the `standing_pools` section is absent from
config).

**When pool routing is disabled, the output of `/synthex:review-code` is
byte-identical (after redaction) to the pre-multi-model-teams baseline in the
parent plan:**

    tests/__snapshots__/multi-model-review/baseline/review-code-baseline.snapshot.md

This file does not duplicate that content. It instead asserts the invariant:
the standing-pool routing layer is transparent — a disabled pool is
indistinguishable from the pre-routing baseline.

## Invocation

- Command: /synthex:review-code
- Target: staged changes
- Config: `standing_pools.enabled: false` (or section absent)
- Date: <YYYY-MM-DD redacted>

## Routing decision

- `routing_decision: "fell-back-no-pool"` (no pool configured/enabled)
- Discovery: inline at command-invocation time; index absent or empty
- No routing notification shown to user (pool not enabled)

## Decision-flow log (routing-specific additions)

- Routing step (pre-Step 1): `standing_pools.enabled` resolved as `false`;
  discovery skipped; proceeding with native-only path
- Step 1–7: identical to parent's `review-code-baseline.snapshot.md`

## Per-reviewer status table

| Reviewer | Verdict | Findings |
|----------|---------|----------|
| code-reviewer | <<verdict>> | <<count>> |
| security-reviewer | <<verdict>> | <<count>> |

## Consolidated findings

### CRITICAL
<<finding-body>>

### HIGH
<<finding-body>>

### MEDIUM
<<finding-body>>

### LOW
<<finding-body>>

---

### What's Done Well
<<finding-body>>

---

### Summary
<<finding-body>>

## File writes

- (none — review-code does not write artifacts when standing_pools is off)

## Exit status: 0

## Byte-identical assertion

Used by Tasks 38, 56, 57 to assert that the standing-pool routing layer is
additive and non-destructive: the native-only fall-back path produces output
byte-identical to the parent plan's `review-code-baseline.snapshot.md`
(after applying the redaction strategy in `redaction-strategy.md`).

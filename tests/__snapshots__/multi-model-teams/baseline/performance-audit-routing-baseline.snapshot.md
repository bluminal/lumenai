# Baseline snapshot: /synthex:performance-audit routing (standing_pools.enabled: false)

## Invocation

- Command: /synthex:performance-audit
- Target: staged changes
- Config: `standing_pools.enabled: false` (or `standing_pools` section absent)
- Date: <YYYY-MM-DD redacted>

## Routing decision

- `routing_decision: "fell-back-no-pool"` (no pool configured/enabled)
- Discovery: inline at command-invocation time; index absent or empty
- Required reviewer set: `[performance-engineer]` (static — no resolver chain)
- No routing notification shown to user (pool not enabled)

## Decision-flow log

- Routing step (pre-Step 1): `standing_pools.enabled` resolved as `false`;
  discovery skipped; proceeding with native-only path
- Step 1: Load configuration — `.synthex/config.yaml` absent or no
  `standing_pools` section; using plugin defaults
- Step 2: Determine review scope — staged changes via `git diff --cached`
- Step 3: Gather context — CLAUDE.md read; performance conventions scanned
- Step 4: Launch performance-engineer reviewer (native sub-agent)
- Step 5: Consolidate via findings-consolidator — dedup, group by file/location,
  sort by severity
- Step 6: Review loop not triggered (verdict: <<verdict>>)
- Step 7: Present results

## Per-reviewer status table

| Reviewer | Verdict | Findings |
|----------|---------|----------|
| performance-engineer | <<verdict>> | <<count>> |

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

- (none — performance-audit does not write artifacts when standing_pools is off)

## Exit status: 0

## Byte-identical assertion

Used by Task 56 to assert that the standing-pool routing layer is additive and
non-destructive for `/performance-audit`: the native-only fall-back path
produces output byte-identical to this baseline (after applying the redaction
strategy in `redaction-strategy.md`) when `standing_pools.enabled: false`.

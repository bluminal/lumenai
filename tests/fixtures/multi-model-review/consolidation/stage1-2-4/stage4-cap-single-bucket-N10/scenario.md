# Scenario: Stage 4 — Per-Consolidation Cap (N=10 Single Bucket, D18)

## What Is Tested

The D18 per-consolidation cap on Stage 4 LLM tiebreaker calls. With N=10 findings in
a single `(file, symbol)` bucket and pairwise Jaccard ≥ 0.667 (above the 30% pre-filter),
all C(10,2) = 45 pairs qualify for Stage 4. The cap is 25 (from config). Exactly 25 calls
are dispatched; 20 pairs are left unmerged. A single audit warning is emitted.

## Input

10 findings, all in bucket `(src/payments/process.ts, processPayment)`.

Each title follows the pattern: `"Payment amount validation missing <unique_token>"`.

After stopword removal, every title becomes:
`{payment, amount, validation, missing, <unique_token>}`

Jaccard for any pair:
- Intersection = `{payment, amount, validation, missing}` = 4 tokens
- Union = the core 4 tokens + 2 unique tokens = 6 tokens
- Jaccard = 4 / 6 ≈ **0.667**
- Above 30% pre-filter: YES
- Below 80% Stage 2 threshold: YES

Total eligible pairs: C(10, 2) = **45**.

## Cap Behavior (D18)

- `max_calls_per_consolidation` = 25 (from config)
- 25 LLM calls dispatched (all `keep_distinct` verdicts in this fixture)
- 20 remaining pairs left unmerged when cap is reached
- **One** audit warning emitted:
  > `"Stage 4 cap reached: 25 LLM calls dispatched (configured max). 20 additional
  > candidate pairs across remaining buckets left unmerged."`

## Expected Output

All 10 findings remain distinct (all `keep_distinct` verdicts; cap fires before any
merge pairs). `final_findings_count = 10`.

## FR / Design Decisions Exercised

- **D18** — Per-consolidation cap enforced AT THE CONSOLIDATION LEVEL (not per-bucket).
- **FR-MR14** — Stage 4 bounded; cap fires mid-consolidation.
- **Step 8c** — Single audit warning records total skipped count across all remaining pairs.

## Key Assertions

1. `stage4_calls_dispatched == 25` (exactly the cap; never exceeded).
2. `stage4_calls_skipped == 20` (45 total - 25 dispatched).
3. `audit_warning_emitted == true`.
4. `audit_warning_text` mentions "Stage 4 cap reached" and skipped count 20.
5. `final_findings_count == 10` (no merges occurred with `keep_distinct` verdicts).

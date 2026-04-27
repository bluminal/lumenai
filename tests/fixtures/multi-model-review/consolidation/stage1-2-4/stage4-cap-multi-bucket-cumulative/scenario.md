# Scenario: Stage 4 — Multi-Bucket Cumulative Cap (D18, Per-Consolidation)

## What Is Tested

The D18 per-consolidation cap on Stage 4 LLM tiebreaker calls is enforced across ALL
buckets in a single consolidation run, NOT per-bucket. With 4 buckets each contributing
10 eligible pairs (40 total) and K=25, the cap fires after 25 calls, leaving 15 pairs
unmerged. One audit warning aggregates the total skipped count across all remaining buckets.

## Input

20 findings across 4 buckets:

| Bucket | (file, symbol) | Findings | Intra-bucket Jaccard | Pairs |
|--------|----------------|----------|---------------------|-------|
| B1 | (src/auth/handler.ts, handleAuth) | 5 | 0.5 (above 30%, below 80%) | 10 |
| B2 | (src/orders/processor.ts, processOrder) | 5 | ~0.43 (above 30%, below 80%) | 10 |
| B3 | (src/db/users.ts, queryUsers) | 5 | 0.5 (above 30%, below 80%) | 10 |
| B4 | (src/notifications/sender.ts, sendNotification) | 5 | ~0.43 (above 30%, below 80%) | 10 |

**Total eligible pairs: 40.**

## Jaccard Design

Each bucket uses titles with a common 3-4 token core + 2 unique tokens per finding.

Example (B1): `"Auth rate limit missing <A> <B>"`
- Common tokens: `{auth, rate, limit, missing}` = 4
- Unique per finding: 2 tokens
- Any pair: intersection=4, union=8, Jaccard=4/8=**0.5**
- Above 30% pre-filter: YES
- Below 80% Stage 2 threshold: YES

## Cap Behavior (D18)

- `max_calls_per_consolidation` = 25 (from config; per-consolidation, not per-bucket)
- Buckets processed in order: B1 (10 pairs), B2 (10 pairs), B3 (5 pairs dispatched,
  cap reached mid-bucket), B4 (0 pairs dispatched, cap already reached)
- 25 calls dispatched total; 15 pairs skipped
- **One** audit warning emitted (NOT one per bucket):
  > `"Stage 4 cap reached: 25 LLM calls dispatched (configured max). 15 additional
  > candidate pairs across remaining buckets left unmerged."`

## Expected Output

All 20 findings remain distinct (all `keep_distinct` verdicts + remaining pairs skipped).
`final_findings_count = 20`.

## FR / Design Decisions Exercised

- **D18** — Per-consolidation cap: `max_calls_per_consolidation` counts across ALL
  `(file, symbol)` buckets in the run, not within any single bucket.
- **FR-MR14** — Stage 4 bounded.
- **Step 8c** — Single audit warning aggregates TOTAL skipped count across all remaining
  buckets (not emitted once per bucket).

## Key Assertions

1. `stage4_calls_dispatched == 25` (cap value; never exceeded).
2. `stage4_calls_skipped == 15` (40 total - 25 dispatched).
3. `audit_warning_emitted == true`.
4. Exactly ONE audit warning (not one per bucket).
5. `audit_warning_text` mentions skipped count 15.
6. `final_findings_count == 20` (no merges with `keep_distinct` verdicts).
7. Cap is per-consolidation (D18): a per-bucket cap would allow 4×25=100 calls;
   this scenario proves 25 is the global limit.

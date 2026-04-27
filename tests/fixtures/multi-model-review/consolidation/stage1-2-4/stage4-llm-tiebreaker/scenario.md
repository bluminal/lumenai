# Scenario: Stage 4 — LLM Tiebreaker (Ambiguous Pair, Merge Verdict)

## What Is Tested

Stage 4 of the consolidation pipeline applies an LLM judge to candidate pairs that
pass the 30% pre-filter but fall below the Stage 2 merge threshold (0.8). This scenario
plants exactly one such ambiguous pair and asserts that:
1. The pre-filter passes the pair (Jaccard ≥ 0.30).
2. One LLM call is dispatched.
3. The "merge" verdict produces one consolidated finding.

## Input

2 findings in bucket `(src/payments/process.ts, processPayment)`:

- **F1** (reviewer1, high): `"Payment token missing rotation check"`
  - Tokens after stopword removal: `{payment, token, missing, rotation, check}`
- **F2** (reviewer2, medium): `"Payment token rotation check absent"`
  - Tokens after stopword removal: `{payment, token, rotation, check, absent}`

## Jaccard Calculation

- Intersection: `{payment, token, rotation, check}` = 4 tokens
- Union: `{payment, token, missing, rotation, check, absent}` = 6 tokens
- Jaccard = 4 / 6 ≈ **0.667**
- Above 30% pre-filter: YES (0.667 ≥ 0.30)
- Below Stage 2 threshold: YES (0.667 < 0.80)
- Stage 4 eligible: YES

## Stage 4 LLM Call

- Pair submitted to LLM judge (invocation 0, even-numbered → F1 presented first per
  alternating-order rule).
- Simulated verdict: **merge** (winning finding: F1, index 0).

## Expected Output

1 consolidated finding:
- `finding_id`: from F1 (winner)
- `severity`: `high` (F1)
- `description`: from F1 (winning finding)
- `raised_by`: [reviewer1, reviewer2]

## FR / Design Decisions Exercised

- **FR-MR14 / D18** — Stage 4 LLM tiebreaker with pre-filter and per-consolidation cap.
- **Step 8c** — Pre-filter ≥30% Jaccard gates LLM submission.
- **FR-MR15** — Alternating position order (invocation 0 → F1 first).
- **D18** — Per-consolidation cap (1 call << 25 cap; no warning emitted).

## Key Assertions

1. `stage4_calls_dispatched == 1` (pair submitted to LLM).
2. `final_findings_count == 1` (merge verdict applied).
3. `audit_warning_emitted == false` (cap not reached).
4. The pair's Jaccard is between 0.30 and 0.80 (documented in `jaccard_analysis`).

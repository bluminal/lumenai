# Fixture (c2): contradiction-29a-boundary

## What this tests

Task 29a contradiction scanner boundary checks:
1. Same file + same symbol → always a contradiction candidate
2. Same file + no symbol + line ranges within proximity threshold (5 lines) → candidate
3. Same file + no symbol + line ranges 7+ lines apart → NOT a candidate

## Setup

Six findings arranged in three groups:

### Group F1+F2 — same file + same symbol (authenticateUser.ts)
- F1 (`security.authenticateUser.session-not-invalidated`): sessions NOT invalidated
- F2 (`security.authenticateUser.sessions-cleared-on-pw-change`): sessions ARE cleared
- Both reference symbol `authenticateUser`
- **Expected: contradiction candidate** (same_file_same_symbol)

### Group F3+F4 — same file + no symbol + overlapping ranges (parseConfig.ts)
- F3 (`correctness.parseConfig.missing-default-value`): lines [45, 50]
- F4 (`correctness.parseconfig.timeout-has-fallback`): lines [48, 53]
- Range distance = 0 (overlapping) ≤ threshold (5)
- **Expected: contradiction candidate** (same_file_no_symbol_proximity)

### Group F5+F6 — same file + no symbol + 42-line gap (parseConfig.ts)
- F5 (`performance.parseconfig.regex-compiled-in-loop`): lines [10, 18]
- F6 (`performance.parseconfig.no-repeated-regex`): lines [60, 68]
- Range distance = 60 - 18 = 42 > threshold (5)
- **Expected: NOT a contradiction candidate**

## Boundary rules being tested

- `same_file_same_symbol`: any two findings sharing file + symbol are a candidate
- Proximity formula: `distance = max(0, start_B - end_A, start_A - end_B)` — 0 if ranges overlap
- `distance <= stage5b_proximity_line_threshold (5)` → candidate
- `distance > threshold` → not a candidate (this fixture's boundary case at 42 lines)

## Acceptance assertions

- `expected_stage5b_29a_output.total_candidate_pairs == 2`
- F1+F2 pair is in `contradiction_candidate_pairs` with `detection_reason: "same_file_same_symbol"`
- F3+F4 pair is in `contradiction_candidate_pairs` with `detection_reason: "same_file_no_symbol_proximity"`
- F5+F6 pair is in `non_candidate_pairs` (distance 42 > threshold 5)

## FR/Spec reference

- FR-MR14b: Stage 5b contradiction scan
- Task 29a: Contradiction scanner with boundary rules

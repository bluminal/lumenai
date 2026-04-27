# Scenario: Stage 2 — Lexical Dedup within (file, symbol) Buckets

## What Is Tested

Stage 2 of the consolidation pipeline groups findings by `(file, symbol)` bucket and
compares normalized title tokens via Jaccard similarity. Pairs at or above the
`stage2_jaccard_threshold` (default 0.8) are merged; pairs below remain distinct.

## Input

3 findings, all in bucket `(src/auth/login.ts, handleLogin)`:

- **F1** (reviewer1, high): `"Missing CSRF token check"`
  - Tokens: `{missing, csrf, token, check}`
- **F2** (reviewer2, medium): `"CSRF token check missing"`
  - Tokens: `{csrf, token, check, missing}` (same set as F1)
  - Jaccard(F1, F2) = 4 / 4 = **1.0** → above threshold → **MERGE**
- **F3** (reviewer3, high): `"Race condition in handler"`
  - Tokens: `{race, condition, handler}`
  - Jaccard(F1, F3) = 0 / 7 = **0.0** → below threshold → **DISTINCT**

## Tokenization Notes

After lowercasing and stopword removal (removing: the, a, an, of, in, on, at, to,
for, with, and, or, is, are, was, were):

- `"Missing CSRF token check"` → `{missing, csrf, token, check}`
- `"CSRF token check missing"` → `{csrf, token, check, missing}` → same set

## Expected Output

2 consolidated findings:

1. Merged F1+F2 with severity `high` (highest-severity description from F1 preserved),
   `raised_by` = [reviewer1, reviewer2]
2. F3 unchanged, `raised_by` = [reviewer3]

## FR / Design Decisions Exercised

- **FR-MR14** — Stage 2 Lexical Dedup within `(file, symbol)` buckets.
- **Step 8b** — Jaccard comparison on normalized title token SETS.
- **Severity preservation** — consolidated finding carries highest-severity description
  (critical > high > medium > low). F1=high beats F2=medium.
- **Bucket restriction** — only findings in the SAME `(file, symbol)` bucket are compared.

## Key Assertions

1. F1 and F2 merge (Jaccard = 1.0 ≥ 0.8 threshold).
2. Merged finding's description is from F1 (the `high`-severity finding).
3. F3 remains distinct (Jaccard vs F1 = 0.0 < 0.8 threshold).
4. Final count = 2 (not 3).

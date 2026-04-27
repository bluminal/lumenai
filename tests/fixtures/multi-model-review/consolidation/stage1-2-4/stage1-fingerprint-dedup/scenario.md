# Scenario: Stage 1 — Fingerprint Dedup (Exact-ID Collapse)

## What Is Tested

Stage 1 of the consolidation pipeline collapses findings that share an identical
`finding_id` into a single consolidated entry, with all contributors recorded in
`raised_by[]`.

## Input

4 findings from 4 reviewers, with `finding_id` values `[A, A, B, C]`:

- **reviewer1** (anthropic / native-team): finding A — `security.handleLogin.missing-csrf-token`
- **reviewer2** (openai / external): finding A — `security.handleLogin.missing-csrf-token`
- **reviewer3** (google / external): finding B — `maintainability.handleLogin.no-input-validation`
- **reviewer4** (anthropic / native-team): finding C — `performance.handleLogin.synchronous-db-call`

## Expected Output

3 consolidated findings:

- **A** — `raised_by` has 2 entries: reviewer1 + reviewer2
- **B** — `raised_by` has 1 entry: reviewer3
- **C** — `raised_by` has 1 entry: reviewer4

## FR / Design Decisions Exercised

- **FR-MR14** — Stage 1 Fingerprint Dedup normative requirement.
- **Step 8a** — Each group of same-`finding_id` findings collapses to ONE consolidated
  finding; all contributors recorded in `raised_by[]`.
- **`finding_id` must not contain line numbers** — validated by canonical-finding schema.

## Key Assertion

`raised_by[]` for finding A must contain exactly 2 entries: one for reviewer1 and one
for reviewer2. Findings B and C pass through unchanged with 1 entry each.

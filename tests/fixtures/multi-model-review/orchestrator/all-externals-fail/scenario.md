# Scenario: all-externals-fail

## Overview

Two native reviewers (code-reviewer, security-reviewer) and two external adapters
(codex-review-prompter, gemini-review-prompter) are configured. Both external adapters
fail during the single parallel fan-out batch — codex-review-prompter due to a missing
CLI binary (cli_missing) and gemini-review-prompter due to a CLI execution failure
(cli_failed).

## FR-MR17 Contract

FR-MR17 defines three distinct failure surfaces for the orchestrator's post-collection
failure handling:

1. **All externals failed** — every configured external adapter returned `status: failed`.
   The orchestrator MUST NOT abort. It emits the verbatim warning:
   > "All external reviewers failed; continuing with natives only"
   Sets `continuation_event.type = "all-externals-failed"` and continues consolidation
   using only the native findings already in hand from the same parallel batch.

2. **All natives failed** — covered by Task 23b fixture.

3. **Cloud-surface (no CLIs)** — covered by Task 23c fixture.

## This Scenario Asserts

- **No abort**: the unified envelope is returned (not an error stop).
- **Verbatim warning**: the orchestrator agent definition contains the exact string
  "All external reviewers failed; continuing with natives only" as specified.
- **Native findings only**: all 4 findings in the envelope originate from native-team
  reviewers (family=anthropic, source_type=native-team). No external findings appear.
- **Audit continuation event with per-external error_code**: `continuation_event.details`
  names each failed external with its specific error_code (cli_missing, cli_failed),
  enabling downstream audit consumers to distinguish CLI-absent failures from
  CLI-execution failures.
- **Aggregator host-fallback**: when all externals are gone, no tier-table flagship
  remains; the aggregator resolves to host-fallback (FR-MR17 / OQ-6(b)).
- **D21 path header**: uses the "0 external succeeded" qualifier form to accurately
  reflect the external outcome.

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Scenario metadata, input parameters, and expected warning/continuation strings |
| `expected_envelope.json` | Full unified output envelope — validated by `orchestrator-externals-fail-fixture.test.ts` |
| `scenario.md` | This document — FR-MR17 contract description |

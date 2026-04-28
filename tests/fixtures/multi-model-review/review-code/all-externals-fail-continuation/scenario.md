# Scenario (f): all-externals-fail-continuation

## Overview

An above-threshold diff (78 lines, 4 files) triggers multi-model dispatch. Both configured
external adapters — codex-review-prompter and gemini-review-prompter — fail with
`cli_missing` (the CLI tools are not installed in the execution environment).

FR-MR17 defines the all-externals-failed continuation path: the orchestrator MUST NOT abort.
It emits a verbatim warning and continues with the native reviewers already collected from
the same parallel fan-out batch.

## FR-MR17 Contract

When every configured external adapter returns `status: failed`:

1. **No abort** — the review continues; the unified envelope is returned.
2. **Verbatim warning** — the orchestrator emits exactly:
   > "All external reviewers failed; continuing with natives only"
3. **Native findings only** — all findings in the envelope originate from native-team
   reviewers; no external findings appear.
4. **Audit continuation event** — `continuation_event.type = "all-externals-failed"` and
   `continuation_event.details` names each failed external with its specific `error_code`,
   enabling downstream audit consumers to distinguish failure modes.
5. **Aggregator host-fallback** — with no external flagship available, the aggregator
   resolves to `host-fallback` (FR-MR17 / OQ-6(b)).
6. **path_and_reason_header** uses the "0 external succeeded" qualifier form.

## This Scenario Asserts

- Both codex-review-prompter and gemini-review-prompter are in per_reviewer_results with
  `status: failed` and `error_code: "cli_missing"`.
- All findings in the envelope originate from native-team reviewers only.
- `continuation_event.type === "all-externals-failed"`.
- `continuation_event.details` names both failed adapters with their error codes.
- `aggregator_resolution.source === "host-fallback"`.
- `path_and_reason_header` contains "0 external succeeded".
- `path_and_reason_header` passes D21 regex.

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Scenario metadata, both external_failures, expected verbatim warning |
| `expected_output.json` | Full unified envelope — only native findings, continuation_event present |
| `scenario.md` | This document |

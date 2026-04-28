# Scenario (a): trivial-diff-native-only

## Overview

A small diff — 12 lines changed across 1 file (`src/utils/format.ts`) — is submitted for
review with `multi_model_review.enabled: true` and `per_command.review_code.enabled: true`.
No `always_escalate_paths` glob matches any file in the diff.

## Complexity Gate Decision

The complexity gate (FR-MR21a) compares the diff stats against the configured thresholds:

- `threshold_lines_changed: 50` — diff has 12 lines → **below threshold**
- `threshold_files_touched: 3` — diff touches 1 file → **below threshold**
- `always_escalate_paths` — none of the diff files match any escalation glob

Result: gate decides **native-only**. Multi-model orchestrator is NOT invoked.

## Expected Behavior

- `path_and_reason_header`: `"Review path: native-only (below-threshold diff; reviewers: 2 native)"`
- Two native reviewers run: code-reviewer + security-reviewer
- No external adapters invoked
- `continuation_event`: null

## FR-MR23 Regression Contract

This scenario is the byte-identical baseline for the FR-MR23 regression check (Task 0).
The `expected_output.json` structure mirrors the redacted baseline snapshot at:

  `tests/__snapshots__/multi-model-review/baseline/review-code-baseline.snapshot.md`

The actual byte-identical comparison is deferred to runtime (empirical orchestrator
execution). The fixture anchors the structural forward-check: the path_and_reason_header,
per_reviewer_results shape, and continuation_event=null must all match the baseline
envelope format.

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Input diff stats, config, expected routing, baseline_snapshot_path reference |
| `expected_output.json` | Expected unified envelope — validated by review-code-fixtures-mmr.test.ts |
| `scenario.md` | This document |

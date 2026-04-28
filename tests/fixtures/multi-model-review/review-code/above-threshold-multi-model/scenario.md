# Scenario (b): above-threshold-multi-model

## Overview

A substantial diff — 127 lines changed across 5 files in `src/services/`, `src/repositories/`,
`src/models/`, `src/controllers/`, and `src/validators/` — is submitted with
`multi_model_review.enabled: true` and `per_command.review_code.enabled: true`.

## Complexity Gate Decision

The complexity gate (FR-MR21a) compares diff stats against configured thresholds:

- `threshold_lines_changed: 50` — diff has 127 lines → **above threshold** ✓
- `threshold_files_touched: 3` — diff touches 5 files → **above threshold** ✓

Either threshold alone is sufficient to trigger multi-model. Both are exceeded here.
`always_escalate_paths` is not a factor (no escalation-glob files in the diff), but the
quantitative gate fires regardless.

Result: gate decides **multi-model**. Orchestrator is invoked.

## Expected Behavior

- `path_and_reason_header`: `"Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)"`
- Two native reviewers: code-reviewer + security-reviewer
- Two external adapters: codex-review-prompter (openai) + gemini-review-prompter (google)
- All four complete successfully; findings consolidated
- `routing_decision == multi-model`
- `continuation_event`: null

## Assertions

- `routing_decision` field equals `"multi-model"`
- Orchestrator invoked (per_reviewer_results includes external entries with status=success)
- Consolidated envelope returned
- path_and_reason_header passes D21 regex

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Input diff stats, config, expected routing |
| `expected_output.json` | Expected unified envelope with all 4 reviewer results |
| `scenario.md` | This document |

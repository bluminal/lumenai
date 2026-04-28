# Scenario (c): auth-path-escalated

## Overview

A small diff — 12 lines changed in `src/auth/handleLogin.ts` — is submitted with
`multi_model_review.enabled: true`. The diff is **below** the quantitative thresholds
(50 lines, 3 files), but the file path matches the `**/auth/**` glob in `always_escalate_paths`.

## Complexity Gate Decision

The complexity gate (FR-MR21a) evaluates in this order:

1. Quantitative thresholds:
   - `threshold_lines_changed: 50` — diff has 12 lines → **below threshold**
   - `threshold_files_touched: 3` — diff touches 1 file → **below threshold**

2. `always_escalate_paths` glob match:
   - `src/auth/handleLogin.ts` matches `**/auth/**` → **MATCH — escalate**

The escalate-glob match overrides the below-threshold quantitative result.
Result: gate decides **multi-model via escalate-glob**.

## Expected Behavior

- `path_and_reason_header`: `"Review path: multi-model (auth path escalated; reviewers: 2 native + 2 external)"`
- Two native reviewers: code-reviewer + security-reviewer
- Two external adapters: codex-review-prompter (openai) + gemini-review-prompter (google)
- Findings are security-heavy because auth code is security-critical
- `continuation_event`: null

## Assertions

- escalate-glob `**/auth/**` matched `src/auth/handleLogin.ts`
- Multi-model dispatched **despite** being below quantitative thresholds
- path_and_reason_header uses "auth path escalated" reason string
- path_and_reason_header passes D21 regex

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Input diff stats, config, escalate_glob_matched fields, below_quantitative_threshold: true |
| `expected_output.json` | Expected unified envelope — all 4 reviewer results |
| `scenario.md` | This document |

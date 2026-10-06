# Scenario (e): rerun-keeps-manual

## Overview

Multi-model review is already enabled. Earlier, the user followed the wizard's manual opt-in
instruction: they added `cursor-review-prompter` to `reviewers` by hand and set its
`per_reviewer` model and family. Now they run `/synthex:configure-multi-model` again, pick
**Re-run the wizard** at the Step 0 re-entry question, and then pick **option 1: Enable with
detected CLIs**.

## Detection Scan Results

| CLI            | Presence | Auth check | Bucket                         |
|----------------|----------|------------|--------------------------------|
| codex          | 0        | 0          | detected-and-authenticated     |
| gemini         | 0        | 0          | detected-and-authenticated     |
| cursor-agent   | 0        | 0          | detected — opt in manually     |
| grok, ollama, llm, aws, claude | non-zero | — | not-detected                |

cursor-agent is logged in and its model and family are set, so its auth check exits 0. It still
goes to the manual bucket (D43): detection never enrolls Cursor, because the check cannot see
a Free plan.

## Expected Behavior

1. The option 1 label lists `codex` and `gemini`; `cursor-agent` is not in it.
2. Before the question, the manual listing prints the cursor-agent line for "logged in, model and
   family set".
3. The FR-MR27 warning is displayed verbatim before any write.
4. Option 1 writes `multi_model_review.reviewers: [codex-review-prompter, gemini-review-prompter,
   cursor-review-prompter]`: the authenticated adapters first, then the kept manual entry. The
   `per_reviewer` block is left as it was.
5. The confirmation output includes `Kept cursor-review-prompter (manual opt-in)`.
6. Preflight runs; `docs/reviews/` exists.

## Fixture Files

| File           | Purpose                                                                |
|----------------|------------------------------------------------------------------------|
| `fixture.json` | Existing config, detection results, choices, expected writes and output |
| `scenario.md`  | This document                                                           |

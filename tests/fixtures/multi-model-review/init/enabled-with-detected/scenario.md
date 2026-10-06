# Scenario (a): enabled-with-detected (mixed authenticated + unauthenticated CLIs)

## Overview

During `/init`, the detection scan (step 4a) runs `which` + auth checks for all candidate CLIs
concurrently. The scan returns a mixed result: codex and ollama are both installed and
authenticated; gemini is installed but unauthenticated; grok and cursor-agent are installed but
go to the "detected — opt in manually" bucket; llm, aws, and claude are not detected.

The user selects **option 1: Enable with detected CLIs**.

## Detection Scan Results

| CLI    | `which` | Auth check | Bucket                        |
|--------|---------|------------|-------------------------------|
| codex  | 0       | 0          | detected-and-authenticated    |
| gemini | 0       | non-zero   | detected-but-unauthenticated  |
| ollama | 0       | 0          | detected-and-authenticated    |
| llm    | non-zero| —          | not-detected                  |
| aws    | non-zero| —          | not-detected                  |
| claude | non-zero| —          | not-detected                  |
| grok   | 0       | 12         | detected — opt in manually (key only, no `allow_api_key_billing` opt-in) |
| cursor-agent | 0 | 12        | detected — opt in manually (always, D43) |

## User Action

The user sees the `AskUserQuestion` prompt listing detection results. The option 1 label reads:

> **Enable with detected CLIs** — write `multi_model_review.enabled: true` + `reviewers: [codex, ollama]` to `.synthex/config.yaml`.

Note: the label includes "codex" and "ollama" but does NOT include "gemini" (unauthenticated).

Gemini is surfaced separately with its remediation hint:
> Detected but unauthenticated: gemini — run `gcloud auth login` to enable

grok and cursor-agent are printed as a plain-text "detected — opt in manually" listing (not a fourth
option): cursor-agent with the `per_reviewer.cursor-review-prompter.model` / `family` instruction and
the paid-plan note, grok with the `allow_api_key_billing: true` opt-in and its per-token billing.

The user chooses option 1.

## Expected Behavior (D22 — auth pre-validation)

After option 1 is selected:

1. The data-transmission warning (FR-MR27) is displayed verbatim.
2. Config writes:
   - `multi_model_review.enabled: true`
   - `multi_model_review.reviewers: [codex-review-prompter, ollama-review-prompter]`
   - gemini-review-prompter is **excluded** (unauthenticated — D22).
   - grok-review-prompter and cursor-review-prompter are **excluded** (manual opt-in).
   - Entries are adapter names from the Step 1a mapping table, never CLI names.
3. Orchestrator preflight (FR-MR20) runs and prints summary.
4. `docs/reviews/` is created via `mkdir -p docs/reviews/`.

## Key Invariants

- `expected_option_label_includes` and `expected_option_label_excludes` are mutually exclusive.
- `expected_docs_reviews_created: true` — only option 1 triggers `docs/reviews/` creation.
- The remediation hints section surfaces gemini + its `gcloud auth login` fix.

## Fixture Files

| File         | Purpose                                                          |
|--------------|------------------------------------------------------------------|
| `fixture.json` | Detection results, user choice, expected config writes, labels |
| `scenario.md`  | This document                                                  |

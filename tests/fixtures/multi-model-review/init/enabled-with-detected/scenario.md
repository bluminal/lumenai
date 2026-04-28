# Scenario (a): enabled-with-detected (mixed authenticated + unauthenticated CLIs)

## Overview

During `/init`, the detection scan (step 4a) runs `which` + auth checks for all candidate CLIs
concurrently. The scan returns a mixed result: codex and ollama are both installed and
authenticated; gemini is installed but unauthenticated; llm, aws, and claude are not detected.

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

## User Action

The user sees the `AskUserQuestion` prompt listing detection results. The option 1 label reads:

> **Enable with detected CLIs** — write `multi_model_review.enabled: true` + `reviewers: [codex, ollama]` to `.synthex/config.yaml`.

Note: the label includes "codex" and "ollama" but does NOT include "gemini" (unauthenticated).

Gemini is surfaced separately with its remediation hint:
> Detected but unauthenticated: gemini — run `gcloud auth login` to enable

The user chooses option 1.

## Expected Behavior (D22 — auth pre-validation)

After option 1 is selected:

1. The data-transmission warning (FR-MR27) is displayed verbatim.
2. Config writes:
   - `multi_model_review.enabled: true`
   - `multi_model_review.reviewers: [codex-review-prompter, ollama-review-prompter]`
   - gemini-review-prompter is **excluded** (unauthenticated — D22).
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

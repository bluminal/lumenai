# Scenario (d): grok-host-self-review

## Overview

The wizard runs inside a Grok session, so `SYNTHEX_HOST=grok`. The detection scan finds `grok`
installed and logged in to a grok.com session (`grok-review.sh --auth-check` exits 0) and `codex`
authenticated. Nothing else is installed.

The user selects **option 1: Enable with detected CLIs**.

## Detection Scan Results

| CLI            | Presence | Auth check | Bucket                         |
|----------------|----------|------------|--------------------------------|
| codex          | 0        | 0          | detected-and-authenticated     |
| grok           | 0        | 0          | detected — opt in manually     |
| cursor-agent   | non-zero | —          | not-detected                   |
| gemini, ollama, llm, aws, claude | non-zero | — | not-detected            |

grok passes its auth check but goes to the manual bucket because the host is Grok (D24): the
native reviewers already run on xAI models, so a grok reviewer would be Grok reviewing its own
family's work and adds no family diversity.

## Expected Behavior

1. The option 1 label lists `codex` only; `grok` is not in it.
2. The "detected — opt in manually" listing is printed as plain text (not a fourth option) with the
   self-review note for grok.
3. The FR-MR27 warning is displayed verbatim before any write.
4. Config writes `multi_model_review.enabled: true` and
   `multi_model_review.reviewers: [codex-review-prompter]` (adapter names, never CLI names).
5. Preflight runs; `docs/reviews/` is created.

## Fixture Files

| File           | Purpose                                                          |
|----------------|------------------------------------------------------------------|
| `fixture.json` | Detection results, host, user choice, expected writes and listing |
| `scenario.md`  | This document                                                     |

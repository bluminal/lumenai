# Scenario (b): enabled-later-with-snippet

## Overview

During `/init`, the detection scan (step 4a) returns the same mixed results as scenario (a):
codex and ollama are authenticated, gemini is unauthenticated, and llm/aws/claude are not
detected.

The user selects **option 2: Enable later (show snippet)**.

## User Action

The user sees the `AskUserQuestion` prompt and chooses option 2. No config changes are written.
Instead, a commented-out YAML snippet is printed to the terminal so the user can copy it into
`.synthex/config.yaml` when ready.

## Expected Behavior

1. **No config writes** — `expected_config_writes` is empty `{}`.
2. **No `docs/reviews/` creation** — only option 1 creates this directory.
3. **Snippet is printed** with the following properties:
   - Begins with `multi_model_review:` as the top-level key (the entire block is commented out)
   - Is syntactically valid YAML when the `#` comment prefixes are stripped — validated by parsing
   - Includes all three detected CLIs (codex, gemini, ollama) as commented-out reviewer entries
     under `reviewers:`. This differs from option 1: ALL detected CLIs appear in the snippet
     (including unauthenticated gemini), because the snippet is for the user to configure manually
     when ready — not a live config write.
   - The snippet is fully commented out so the user can uncomment selectively.

## Snippet Content

The printed snippet matches `expected-snippet.yaml` in this fixture directory:

```yaml
# multi_model_review:
#   enabled: true
#   reviewers:
#     # - codex-review-prompter      # OpenAI / Codex CLI  (codex login)
#     # - gemini-review-prompter     # Google / gcloud     (gcloud auth login)
#     # - ollama-review-prompter     # Local model         (ollama serve)
#   aggregator:
#     command: auto
```

## YAML Validity Note

The snippet is fully commented out — a YAML parser reading the raw text as-is will parse it as
an empty document (null), which is valid YAML. The "valid YAML" assertion confirms the snippet
does not contain syntax errors that would prevent a user from copying it into a YAML config file.

## Fixture Files

| File                    | Purpose                                                              |
|-------------------------|----------------------------------------------------------------------|
| `fixture.json`          | Detection results, user choice, expected snippet assertions          |
| `expected-snippet.yaml` | Literal commented-out YAML snippet expected to be printed            |
| `scenario.md`           | This document                                                        |

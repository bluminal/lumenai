# Scenario (b): enabled-later-with-snippet

## Overview

During `/init`, the detection scan (step 4a) returns the same mixed results as scenario (a):
codex and ollama are authenticated, gemini is unauthenticated, grok and cursor-agent are listed for
manual opt-in, and llm/aws/claude are not detected.

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
   - Includes the detected CLIs (codex, gemini, ollama, grok, cursor-agent) as commented-out
     reviewer entries under `reviewers:`, by adapter name. This differs from option 1: ALL detected CLIs appear in the snippet
     (including unauthenticated gemini), because the snippet is for the user to configure manually
     when ready — not a live config write.
   - Has a commented `per_reviewer:` block: `grok-review-prompter.allow_api_key_billing: false`, and a
     block-style `cursor-review-prompter` with `model` and `family` placeholders and
     `allow_api_key_billing: false`.
   - The snippet is fully commented out so the user can uncomment selectively.

## Snippet Content

The printed snippet matches `expected-snippet.yaml` in this fixture directory (byte-identical to the
wizard's Option 2 block):

```yaml
# multi_model_review:
#   enabled: true
#   reviewers:
#     # - codex-review-prompter      # OpenAI / Codex CLI  (codex login)
#     # - gemini-review-prompter     # Google / gcloud     (gcloud auth login)
#     # - ollama-review-prompter     # Local model         (ollama serve)
#     # - grok-review-prompter       # xAI / Grok CLI      (grok login)
#     # - cursor-review-prompter     # Cursor Agent CLI    (cursor-agent login; paid plan)
#   per_reviewer:
#     grok-review-prompter:
#       allow_api_key_billing: false   # true bills XAI_API_KEY per token
#     cursor-review-prompter:
#       model: gpt-5.6-sol-high        # placeholder: a named slug from `cursor-agent models`, never auto
#       family: openai                 # placeholder: the slug's vendor
#       allow_api_key_billing: false   # true bills CURSOR_API_KEY per request
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

# Scenario: cloud-surface (Task 23c)

## Contract

When every configured external adapter returns `error_code: cli_missing` (because `which <cli>`
returns non-zero on a cloud/web surface with no host bash), the orchestrator MUST emit a **single
remediation error** pointing at the adapter-recipes setup docs — NOT a per-CLI `cli_missing`
cascade of 3 separate error messages.

## Setup

- 2 native reviewers: `code-reviewer`, `security-reviewer`
- 3 external adapters: `codex-review-prompter`, `gemini-review-prompter`, `ollama-review-prompter`
- Surface: cloud/web (no host bash; `which` always returns non-zero for all CLIs)
- All 3 external adapters fail preflight with `error_code: cli_missing`
- Native reviewers complete (they run via the host Claude session, not via host CLIs)

## Expected Behavior (NFR-MR2, FR-MR17)

1. Orchestrator preflight: all `which` checks return non-zero for all 3 external adapters.
2. All 3 external entries recorded in `per_reviewer_results` with `status: failed`,
   `error_code: cli_missing` — for audit purposes.
3. Orchestrator classifies: every external returned `error_code: cli_missing` — cloud-surface
   condition detected.
4. Emits a SINGLE remediation error (NOT 3 separate cli_missing errors):
   > "Multi-model review cannot run on this surface — no external review CLIs are available.
   > See docs/specs/multi-model-review/adapter-recipes.md for setup, or run on a host with the
   > configured CLIs installed."
5. Sets `continuation_event.type = "cloud-surface-no-clis"`.
6. STOPS — returns `findings: []`.

## Single Remediation vs. Per-CLI Cascade

The cloud-surface path MUST NOT emit 3 separate `cli_missing` events to the user. That would be:

```
ERROR: cli_missing — codex-review-prompter: CLI 'codex' not found
ERROR: cli_missing — gemini-review-prompter: CLI 'gemini' not found
ERROR: cli_missing — ollama-review-prompter: CLI 'ollama' not found
```

Instead, it collapses these into ONE remediation message that tells the user where to go for
setup instructions. The per-CLI entries remain in `per_reviewer_results` for audit purposes, but
the user-visible output is the single continuation_event.details string.

## Source authority

- NFR-MR2 (cloud-surface single remediation — not per-CLI cascade)
- FR-MR17 (failure surface classification)
- Step 6 of `plugins/synthex/agents/multi-model-review-orchestrator.md`

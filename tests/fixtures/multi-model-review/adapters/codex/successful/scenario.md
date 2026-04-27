# Scenario: Successful Codex Review

## What Is Tested

The adapter successfully completes the full happy-path flow:
1. `which codex` returns a valid binary path (FR-MR8 step 1 — CLI Presence Check passes).
2. `codex auth status` exits 0 (FR-MR8 step 2 — Auth Check passes).
3. Prompt is constructed from `command: "review-code"` and `context_bundle` (FR-MR8 step 3).
4. CLI is invoked with the mandatory sandbox flags per FR-MR26:
   `--sandbox read-only`, `--approval-mode never`, `--json` (FR-MR8 step 4).
5. Stdout is valid JSON; two findings parse successfully (FR-MR8 step 5).
6. No retry needed (FR-MR8 step 6 — skipped).
7. Each finding is normalized: `source.reviewer_id = "codex-review-prompter"`,
   `source.family = "openai"`, `source.source_type = "external"` (FR-MR8 step 7).
8. Canonical envelope is returned with `status: "success"`, two findings,
   verbatim usage object (NFR-MR4), and echoed `raw_output_path` (FR-MR8 step 8).

## FR-MR / FR-MR8 Steps Exercised

- FR-MR8 steps 1–8 (full flow)
- FR-MR9 (output envelope shape)
- FR-MR16 (error_code is null on success)
- FR-MR26 (sandbox flags in recorded-cli-invocation.txt)
- NFR-MR4 (usage object surfaced verbatim)

## Fixture Files

- `fixture.json` — recorded raw Codex CLI stdout (the `--json` envelope)
- `recorded-cli-invocation.txt` — exact CLI command string Codex was called with
- `expected_envelope.json` — normalized canonical envelope the adapter must produce

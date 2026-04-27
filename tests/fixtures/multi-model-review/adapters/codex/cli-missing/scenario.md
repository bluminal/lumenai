# Scenario: CLI Missing (cli_missing)

## What Is Tested

The adapter exercises the CLI presence-check failure path (FR-MR8 step 1):

1. `which codex` returns an empty string and exits with status code 1, indicating
   the `codex` binary is not installed or not in the system PATH.
2. Adapter returns `error_code: cli_missing` immediately. No auth check, no CLI
   invocation, no retry. This is a terminal error.
3. `error_message` references the install command:
   `npm install -g @openai/codex` and `adapter-recipes.md`.
4. `findings` is empty, `usage` is null.

## FR-MR / FR-MR8 Steps Exercised

- FR-MR8 step 1 (CLI Presence Check — fails, `which codex` returns nothing)
- FR-MR16 (`error_code: cli_missing`)

## Fixture Files

- `fixture.json` — simulated subprocess output for `which codex` (exit 1, empty stdout)
- `expected_envelope.json` — failed envelope with `error_code: cli_missing`

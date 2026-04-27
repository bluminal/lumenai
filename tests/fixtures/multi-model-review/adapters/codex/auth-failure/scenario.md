# Scenario: Auth Failure (cli_auth_failed)

## What Is Tested

The adapter exercises the authentication-check failure path (FR-MR8 step 2):

1. `which codex` returns a valid binary path (CLI Presence Check passes — FR-MR8 step 1).
2. `codex auth status` exits with status code 1 (non-zero), indicating the user is
   not authenticated with the Codex CLI.
3. Adapter returns `error_code: cli_auth_failed` immediately, without invoking
   `codex exec`. This is a terminal error — no retry is performed (per adapter-contract.md).
4. `error_message` references `codex login` as the remediation action.
5. `findings` is empty, `usage` is null.

## FR-MR / FR-MR8 Steps Exercised

- FR-MR8 step 1 (CLI Presence Check — passes)
- FR-MR8 step 2 (Auth Check — fails, non-zero exit from `codex auth status`)
- FR-MR16 (`error_code: cli_auth_failed`)

## Fixture Files

- `fixture.json` — simulated subprocess outputs for `which codex` and `codex auth status`
- `expected_envelope.json` — failed envelope with `error_code: cli_auth_failed`

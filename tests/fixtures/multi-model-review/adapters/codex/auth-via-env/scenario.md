# Scenario: Auth via environment variable (no stored login)

## What Is Tested

FR-MR8 step 2 (Auth Check) when the only credential is `CODEX_API_KEY` or `OPENAI_API_KEY` in the environment:

1. `which codex` finds the binary (CLI Presence Check passes).
2. `CODEX_API_KEY` is non-empty, so the adapter skips `codex login status` and goes straight to `codex exec`.
3. If the adapter ran `codex login status` anyway, it would see exit 1 and "Not logged in" on stderr. That command reports stored credentials only (verified on Codex CLI 0.160.0 with an empty `CODEX_HOME`), so trusting it would return a false `cli_auth_failed` for a Codex that works.
4. A bad key still surfaces: a 401 or login error from `codex exec` maps to `cli_auth_failed`.

## Fixture Files

- `fixture.json`: the environment, the `codex login status` result the adapter must not act on, and the expected next step.

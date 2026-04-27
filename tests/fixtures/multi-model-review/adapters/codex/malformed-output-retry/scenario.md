# Scenario: Malformed Output — Retry Then Fail (parse_failed)

## What Is Tested

The adapter exercises the retry-once-on-parse-failure path (FR-MR8 step 6):

1. `which codex` returns a valid binary path (CLI Presence Check passes).
2. `codex auth status` exits 0 (Auth Check passes).
3. First CLI call returns truncated JSON — the `text` field is cut off mid-string,
   making the entire `--json` envelope unparseable.
4. Adapter detects parse failure and issues a single retry with the clarification prompt
   per FR-MR8 step 6.
5. The retry call returns syntactically invalid JSON (bare unquoted keys with
   explanatory prose prepended — schema mismatch and JSON parse error).
6. Both attempts fail; adapter returns terminal `error_code: parse_failed` with
   `error_message` containing "after retry".
7. `findings` is empty; `usage` is present from the first call's partial envelope
   (best-effort preservation of available token counts).

## FR-MR / FR-MR8 Steps Exercised

- FR-MR8 step 5 (Output Parsing — first call fails)
- FR-MR8 step 6 (Retry-Once on Parse Failure — retry also fails → terminal parse_failed)
- FR-MR16 (`error_code: parse_failed`)
- NFR-MR4 (usage from first call surfaced when available)

## Fixture Files

- `fixture.json` — both recorded CLI stdout blobs (first call + retry)
- `expected_envelope.json` — terminal failed envelope with `error_code: parse_failed`

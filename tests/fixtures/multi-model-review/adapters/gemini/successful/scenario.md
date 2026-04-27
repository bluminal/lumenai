# Scenario: Successful Gemini Review (Quirk-Exercising)

## What Is Tested

This fixture exercises the Gemini adapter's success path with quirk-handling engaged:

1. `which gemini` returns a valid binary path (FR-MR8 step 1 — CLI Presence Check passes).
2. `gcloud auth list` exits 0 with at least one account listed (FR-MR8 step 2 — Auth Check passes).
3. Prompt is constructed from `command: "review-code"` and `context_bundle` (FR-MR8 step 3).
4. CLI is invoked with the mandatory sandbox flag per FR-MR26:
   `--readonly` (FR-MR8 step 4).
5. Raw CLI stdout contains markdown-fence-wrapped JSON (gotcha #1) — adapter strips
   `\`\`\`json ... \`\`\`` fences before calling `JSON.parse`.
6. No retry needed after fence-stripping succeeds (FR-MR8 step 6 — skipped).
7. Each finding is normalized: `source.reviewer_id = "gemini-review-prompter"`,
   `source.family = "google"`, `source.source_type = "external"` (FR-MR8 step 7).
8. Canonical envelope is returned with `status: "success"`, one finding,
   verbatim usage object (NFR-MR4), and `raw_output_path` (FR-MR8 step 8).

## Quirks Exercised

### Gotcha #1 — Markdown-Fence Stripping

`raw_cli_response_with_quirks` in `fixture.json` shows Gemini returning its JSON payload
wrapped in triple-backtick fences (`` ```json ... ``` ``), even though `--output-format json`
was passed. The adapter MUST detect and strip these fences using a regex of the form
`/^```(?:json)?\s*([\s\S]*?)\s*```$/` before calling `JSON.parse`.

`expected_envelope.findings` contains the correctly parsed, fence-free result, proving
the adapter completed this step.

### Gotcha #3 — findings:null Normalization (documented; not the primary focus here)

If Gemini emits `"findings": null`, the adapter normalizes it to `[]`. This fixture
exercises the positive case (non-null findings array) so that gotcha #1 is the focal point.
The null-normalization path is covered by a dedicated failure-path fixture.

## FR-MR / FR-MR8 Steps Exercised

- FR-MR8 steps 1–8 (full success-path flow)
- FR-MR9 (output envelope shape)
- FR-MR16 (error_code is null on success)
- FR-MR26 (sandbox flag `--readonly` in recorded-cli-invocation.txt)
- NFR-MR4 (usage object surfaced verbatim from CLI envelope)

## Fixture Files

- `fixture.json` — raw Gemini CLI stdout including markdown-fence quirk (gotcha #1)
- `recorded-cli-invocation.txt` — exact CLI command string Gemini was called with (includes `--readonly`)
- `expected_envelope.json` — normalized canonical envelope the adapter must produce after quirk handling

# Redaction Strategy

## Purpose
Baseline snapshots compare deterministic envelope structure across runs while excluding
LLM-generated finding bodies (which vary across invocations).

## What gets redacted
- Finding body text → `<<finding-body>>`
- Verdict values → `<<verdict>>`
- Numeric counts → `<<count>>`
- ISO dates → `<YYYY-MM-DD redacted>`

## What is preserved (deterministic envelope)
- Path-and-reason header (when present)
- Per-reviewer table column structure
- Decision-flow log line text
- File-write paths and counts (paths only, not content)
- Exit status

## Used by
- Task 38(a): byte-identical fixture for /review-code native-only path under multi-model-review
- Task 45(b): byte-identical fixture for /write-implementation-plan multi-model-disabled path

## Assertion method
Snapshot tests load each `.snapshot.md` file via `readFileSync` and assert:
1. The file exists and is non-empty.
2. The string `<<finding-body>>` is present (confirming redaction was applied).
3. No known real-finding text patterns appear (negative scan — e.g., `vulnerability found in`).
4. The redaction-strategy doc itself references Tasks 38(a) and 45(b) to anchor it to the
   FR-MR23 byte-comparison criteria those tasks depend on.

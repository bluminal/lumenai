# Redaction Strategy

## Source

This strategy is identical to the parent plan's redaction strategy at
`tests/__snapshots__/multi-model-review/baseline/redaction-strategy.md`.
The multi-model-teams baseline snapshots follow the same rules.

## Purpose

Baseline snapshots compare deterministic envelope structure across runs while
excluding LLM-generated finding bodies (which vary across invocations).

## What gets redacted

- Finding body text → `<<finding-body>>`
- Verdict values → `<<verdict>>`
- Numeric counts → `<<count>>`
- ISO dates → `<YYYY-MM-DD redacted>`
- Team name short-hash → `<short-hash redacted>`

## What is preserved (deterministic envelope)

- Path-and-reason header (when present)
- Per-reviewer table column structure
- Decision-flow log line text
- File-write paths and counts (paths only, not content)
- Template read steps and team composition shape
- Consolidation flow markers (Lead consolidation step presence)
- Exit status

## Used by

- Task 38: byte-identical fixture for inline-discovery routing end-to-end
  (`routed-to-pool` path) — native-only fall-back must produce output
  identical to this baseline when `standing_pools.enabled: false`
- Task 56: byte-identical fixture for `/synthex:performance-audit` routing
  — disabled-pool path must produce output identical to this baseline
- Task 57: byte-identical fixture for `/synthex:review-code` routing
  — disabled-pool path must produce output identical to this baseline

## Assertion method

Snapshot tests load each `.snapshot.md` file via `readFileSync` and assert:
1. The file exists and is non-empty.
2. The string `<<finding-body>>` is present (confirming redaction was applied).
3. No known real-finding text patterns appear (negative scan — e.g.,
   `vulnerability found in`).
4. The redaction-strategy doc itself references Tasks 38, 56, and 57 to anchor
   it to the FR-MMT byte-comparison criteria those tasks depend on.

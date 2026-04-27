# Scenario: Artifact as Largest File — Narrow Scope Required (per-file cap breach)

## Overview

This fixture exercises the assembler's "narrow scope" error path when the artifact itself
exceeds `max_file_bytes`. The artifact (`src/large-feature.ts`) is 80 KB, which is above
the per-file cap of 50,000 bytes. Although 80 KB is still well below `max_bundle_bytes`
(200,000 bytes), the assembler MUST NOT silently summarize the artifact to make it fit.
Instead, it must immediately return `narrow_scope_required` — because reviewing a summary
instead of the actual artifact would corrupt the review fidelity.

## What This Fixture Tests

### 1. Artifact Exceeds max_file_bytes — Error Not Silent Summary

Per Step 1 of the assembler's behavior: "If the artifact alone exceeds `max_bundle_bytes`,
do NOT attempt to summarize it." The same protection applies when the artifact exceeds
`max_file_bytes` — the assembler cannot treat the artifact like a regular touched file and
summarize it on the per-file cap path. Behavioral Rule 1 is categorical: the artifact is
NEVER summarized. The only permissible response is `narrow_scope_required`.

### 2. Error Shape Is Correct

The assembler output must conform to the error contract:
- `status: "error"`
- `error_code: "narrow_scope_required"`
- `error_message`: non-empty string explaining the breach
- `manifest: null`
- `files: []`

This fixture tests the per-file-cap variant of the narrow-scope error. The artifact is
below `max_bundle_bytes` (80 KB < 200 KB) but above `max_file_bytes` (80 KB > 50 KB). The
distinguishing signal in `expected` is `artifact_size_bytes: 80000` and `max_file_bytes:
50000` (not `max_bundle_bytes`).

### 3. Behavioral Rule 1 Enforced

`expected.behavioral_rule_1_enforced: true` and `expected.artifact_NOT_summarized: true`
explicitly document that the test verifies Rule 1 from
`plugins/synthex/agents/context-bundle-assembler.md`, not just the error code shape.

## Key Assertions

| Property | Expected Value |
|---|---|
| `expected.status` | `"error"` |
| `expected.error_code` | `"narrow_scope_required"` |
| `expected.artifact_size_bytes` | `80000` |
| `expected.max_file_bytes` | `50000` |
| `expected.artifact_NOT_summarized` | `true` |
| `expected.behavioral_rule_1_enforced` | `true` |

## References

- `plugins/synthex/agents/context-bundle-assembler.md` — Step 1 (artifact read + never
  summarized), Step 6 (narrow-scope error path), Behavioral Rule 1
- FR-MR28 — review fidelity requirement (reviewing a summary corrupts the review)

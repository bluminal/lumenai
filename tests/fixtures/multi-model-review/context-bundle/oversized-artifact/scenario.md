# Scenario: Oversized Artifact — Narrow Scope Required (bundle cap breach)

## Overview

This fixture exercises the assembler's "narrow scope" error path when the artifact itself
exceeds `max_bundle_bytes`. The artifact (`src/giant-file.ts`) is 250 KB — larger than the
entire bundle cap of 200,000 bytes. Even if the assembler attempted to include only the
artifact and nothing else, the bundle would overflow. The assembler must return
`narrow_scope_required` immediately upon reading the artifact, without attempting any
summarization of the artifact or other files.

## What This Fixture Tests

### 1. Artifact Exceeds max_bundle_bytes — Immediate Error, No Summarization Attempt

Per Step 1 of the assembler behavior: "If the artifact alone exceeds `max_bundle_bytes`,
do NOT attempt to summarize it. Instead, return the narrow scope error path (Step 6)."
This is the most severe variant of the narrow-scope condition — the artifact is simply too
large to fit in any bundle, regardless of what other content is included. No iterative
summarization loop should be entered. The error must fire before Step 5.

### 2. Same Error Code as Fixture (b), Different Failure Signal

Both this fixture and the `artifact-as-largest-file` fixture produce `error_code:
"narrow_scope_required"`. The difference lies in which limit is breached:

| Fixture | Artifact size | Limit breached | Expected field |
|---|---|---|---|
| `artifact-as-largest-file` | 80 KB | `max_file_bytes` (50 KB) | `max_file_bytes: 50000` |
| `oversized-artifact` | 250 KB | `max_bundle_bytes` (200 KB) | `max_bundle_bytes: 200000` |

The test checks the `expected` block to confirm which signal is present in this fixture —
`artifact_size_bytes: 250000` and `max_bundle_bytes: 200000`.

### 3. Behavioral Rule 1 Enforced

As in fixture (b), `expected.behavioral_rule_1_enforced: true` confirms that the test is
explicitly verifying Behavioral Rule 1 from the assembler spec, not merely the error shape.
The artifact is NEVER summarized, even when it is larger than the entire bundle cap.

## Key Assertions

| Property | Expected Value |
|---|---|
| `expected.status` | `"error"` |
| `expected.error_code` | `"narrow_scope_required"` |
| `expected.artifact_size_bytes` | `250000` |
| `expected.max_bundle_bytes` | `200000` |
| `expected.artifact_NOT_summarized` | `true` |
| `expected.behavioral_rule_1_enforced` | `true` |

## References

- `plugins/synthex/agents/context-bundle-assembler.md` — Step 1 (artifact never
  summarized), Step 6 (narrow-scope error path verbatim), Behavioral Rule 1,
  Behavioral Rule 6 (total cap is hard)
- FR-MR28 — context bundle role
- D5 — identical bundle for all proposers

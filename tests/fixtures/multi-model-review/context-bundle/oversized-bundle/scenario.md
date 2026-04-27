# Scenario: Oversized Bundle — Iterative Summarization of Non-Artifact Files

## Overview

This fixture exercises the assembler's iterative summarization behavior when the raw total
of all touched files exceeds `max_bundle_bytes`. The artifact (`src/auth/handleLogin.ts`,
5 KB) is small and comfortably fits. However, three large utility files
(`large-file-1.ts` at 92 KB, `large-file-2.ts` at 88 KB, `large-file-3.ts` at 75 KB)
together with the artifact and conventions push the raw bundle far above the 200,000 byte
cap. The medium-sized file (`medium-file-1.ts`, 12 KB) sits below `max_file_bytes` (50,000)
on its own and therefore qualifies for verbatim inclusion once the large files are
summarized.

## What This Fixture Tests

### 1. Iterative Summarization Targets Largest Non-Artifact Files First

Per Step 5 of the assembler's behavior, when the running bundle total approaches
`max_bundle_bytes`, the assembler summarizes the largest non-artifact, non-convention files
first. In this scenario the three large touched files (92 KB, 88 KB, 75 KB) are each above
`max_file_bytes` (50,000) and are therefore individually summarized per Step 3 as well. The
medium file (12 KB) is left verbatim.

### 2. Artifact Is Never Summarized (Behavioral Rule 1)

The artifact `src/auth/handleLogin.ts` is 5 KB. Even though the total bundle would overflow
without summarization, the assembler never touches the artifact. `manifest.artifact.summarized`
must be `false`. This is the normative "artifact is NEVER summarized" rule documented in
`plugins/synthex/agents/context-bundle-assembler.md` (Step 1 and Behavioral Rule 1).

### 3. Final total_bytes Stays Within Cap

After summarizing the three large files, the manifest reports `total_bytes: 195000` — safely
under the `max_bundle_bytes: 200000` hard cap. The cap check in `validateContextBundle` with
`maxBundleBytes: 200000` must pass.

### 4. Manifest Accurately Identifies Summarized-vs-Verbatim Files

The manifest's `touched_files` array must correctly mark:
- `large-file-1.ts` (92 KB): `summarized: true`
- `large-file-2.ts` (88 KB): `summarized: true`
- `large-file-3.ts` (75 KB): `summarized: true`
- `handleLogin.ts` (5 KB): `summarized: false`
- `medium-file-1.ts` (12 KB): `summarized: false`

## Key Assertions

| Property | Expected Value |
|---|---|
| `expected.status` | `"success"` |
| `expected.total_bytes_within_cap` | `true` |
| `expected.artifact_summarized` | `false` |
| `expected.summarized_count` | `3` |
| `expected.verbatim_count` | `4` |
| `expected.actual_total_bytes` | `195000` |
| `expected.max_bundle_bytes` | `200000` |

## References

- `plugins/synthex/agents/context-bundle-assembler.md` — Step 3 (per-file cap), Step 5
  (iterative summarization), Behavioral Rule 1 (artifact never summarized), Behavioral
  Rule 6 (total cap is hard)
- FR-MR28 — context bundle role in multi-model review
- D5 — identical bundle for every proposer

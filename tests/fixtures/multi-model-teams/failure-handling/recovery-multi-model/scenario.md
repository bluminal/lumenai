# Scenario: Recovery in a Multi-Model Pool (FR-MMT24)

## Overview

This fixture documents the expected behavior when a single reviewer crashes in a multi-model standing pool containing both native and external reviewers. It validates that:

1. Three of four reviewers complete successfully; one native reviewer crashes.
2. The Submitter returns `status: failed` to the submitting command's host session.
3. The host session performs recovery: spawning a fresh instance of the crashed reviewer.
4. The recovered reviewer produces both markdown output and `findings_json`.
5. D19 partial dedup runs Stages 1+2 only (fingerprint + lexical) against the already-consolidated output from the three surviving reviewers.
6. Zero CoVe LLM calls are made during partial dedup.
7. Recovered findings are merged with `source_type: "native-recovery"` attribution.
8. Full re-consolidation is NOT run — only the lightweight partial merge executes.
9. The unified report's header contains a recovery notice.

## Pool Under Test

- **Name:** `mm-pool`
- **multi_model:** `true`
- **Reviewers:** `code-reviewer` (native), `security-reviewer` (native), `codex` (external), `gemini` (external)
- **ttl_minutes:** `60`

## Scenario Steps

### Step 1 — Pool Active (Multi-Model)

The pool `mm-pool` has spawned with 2 native reviewers (`code-reviewer`, `security-reviewer`) and 2 external reviewers (`codex`, `gemini`). `multi_model: true`. Work has been submitted; reviewers are active.

**Frame:** `pool_active`
**Expected:** `multi_model: true`, 4 reviewers present, pool is active.

### Step 2 — Three Reviewers Complete

`security-reviewer`, `codex`, and `gemini` complete their reviews and return findings. `code-reviewer` has not yet responded.

**Frame:** `three_reviewers_completed`
**Expected:** 3 completed reviewers; `code-reviewer` not in completed list; partial findings counts recorded.

### Step 3 — `code-reviewer` Crashes

`code-reviewer` fails due to process termination. Status is `failed`.

**Frame:** `code_reviewer_crashed`
**Expected:** `reviewer: "code-reviewer"`, `status: "failed"`.

### Step 4 — Submitter Returns `status: failed`

The Submitter observes the crashed reviewer, waits for the configured timeout, and returns an envelope with `status: failed` to the submitting command's host session. The envelope includes an error code `reviewer_crashed` and metadata identifying the pool and completed task UUIDs.

**Frame:** `submitter_returns_failed`
**Expected:** `envelope.status: "failed"`, `error.code: "reviewer_crashed"`, completed task UUIDs present in metadata.

### Step 5 — Recovery Invoked by Host Session

The submitting command's host session extracts the crashed reviewer name (`code-reviewer`) from the error envelope, spawns a fresh `code-reviewer` instance via the Task tool, and requests output in both markdown and `findings_json` formats.

**Frame:** `recovery_invoked`
**Expected:** `invoked_by: "submitting_command_host_session"`, `reviewer_name_extracted: "code-reviewer"`, `spawn_method: "Task tool"`, both output formats expected.

### Step 6 — Fresh Reviewer Completes

The freshly spawned `code-reviewer` completes its review, returning 3 findings in both markdown and `findings_json` formats. The source type is tagged `native-recovery`.

**Frame:** `fresh_reviewer_completed`
**Expected:** `findings_count: 3`, `has_findings_json: true`, `source_type: "native-recovery"`.

### Step 7 — D19 Partial Dedup Run (Stages 1+2 Only)

The host session runs D19 partial dedup against the already-consolidated output from the 3 surviving reviewers. Only Stages 1 (fingerprint dedup) and 2 (lexical dedup) execute. Stages 3–6 (CoVe, semantic clustering, impact scoring, re-ranking) are skipped. Zero CoVe LLM calls are made.

**Frame:** `partial_dedup_run`
**Expected:** `stages_run: [1, 2]`, `stages_not_run: [3, 4, 5, 6]`, `cove_llm_calls: 0`, `dedup_mode: "partial"`.

### Step 8 — Lightweight Merge

The 3 recovered findings (post-dedup) are merged with the 9 surviving findings from the original three reviewers. Full re-consolidation is NOT run. Total findings = 12.

**Frame:** `lightweight_merge`
**Expected:** `surviving_findings: 9`, `recovered_findings_after_dedup: 3`, `total_findings: 12`, `full_reconsolidation_run: false`.

### Step 9 — Unified Report Emitted

The unified report is emitted with a header note identifying `code-reviewer` as a recovered reviewer. Recovered findings carry `native-recovery` attribution.

**Frame:** `unified_report_emitted`
**Expected:** `report_header_contains` includes `"was recovered from a pool failure"`, `recovered_findings_attribution: "native-recovery"`.

## Key Invariants

- D19 partial dedup only runs Stages 1 and 2 (2 of 6 total stages)
- CoVe LLM calls = 0 during recovery dedup
- Recovered findings attribution: `native-recovery`
- Full re-consolidation is not triggered
- Recovery report header must contain recovery notice

## References

- `docs/specs/multi-model-teams/` — FR-MMT24 failure handling and recovery
- `tests/fixtures/multi-model-teams/pool-lifecycle/idle-and-claim/` — pool lifecycle reference fixture

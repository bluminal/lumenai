# Scenario: all-natives-fail (Task 23b)

## Contract

When `include_native_reviewers: true` and **all** native Synthex reviewers return error envelopes,
the orchestrator MUST emit a **critical warning** (distinct from the all-externals-failed warning)
and STOP — no consolidation is possible.

## Setup

- 2 native reviewers: `code-reviewer`, `security-reviewer`
- 2 external adapters: `codex-review-prompter`, `gemini-review-prompter`
- `config_include_native_reviewers: true`
- Both natives fail in the same parallel Task batch:
  - `code-reviewer` → `error_code: "timeout"`
  - `security-reviewer` → `error_code: "sub_agent_failure"`
- External adapters complete successfully (they ran in the same batch and returned before the
  orchestrator classified failures).

## Expected Behavior (FR-MR17)

1. Orchestrator classifies: every native returned `status: failed`.
2. Emits critical warning VERBATIM:
   > "All native Synthex reviewers failed. Cannot continue — multi-model review has no findings to consolidate. Check sub-agent error logs."
3. Sets `continuation_event.type = "all-natives-failed"`.
4. STOPS — does NOT proceed to consolidation.
5. Returns unified envelope with `findings: []`.

## Distinction from all-externals-failed

The all-externals-failed path emits:
> "All external reviewers failed; continuing with natives only"

...and **continues** consolidation with native findings.

The all-natives-failed path emits a different, critical-severity warning and **stops**. These two
warning strings are distinct: neither is a substring of the other, and they encode opposite
continuation decisions (continue vs. stop).

## Audit continuation_event

```json
{
  "type": "all-natives-failed",
  "details": "Native reviewers code-reviewer (timeout), security-reviewer (sub_agent_failure) failed. Cannot continue."
}
```

The `details` field MUST name the failing native reviewers and their individual error codes,
distinguishing this event from an external-failure event which would name external adapters instead.

## Source authority

- FR-MR17 (all-natives-failed CRITICAL stop branch)
- Step 6 of `plugins/synthex/agents/multi-model-review-orchestrator.md`

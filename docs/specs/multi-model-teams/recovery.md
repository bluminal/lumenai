# Recovery — FR-MMT24 Per-Task Fallback Recovery Reference

---

## Overview

FR-MMT24 per-task fallback recovery is owned by the **submitting command's host session** — NOT by the pool infrastructure or `standing-pool-submitter.md`. The pool's responsibility ends at routing the request and returning the envelope; recovery is entirely a host-side concern.

When `standing-pool-submitter.md` returns an envelope with `status: failed` and `error.code: reviewer_crashed`, the submitting command (e.g., `/synthex:review-code`, `/synthex:performance-audit`) invokes the recovery procedure below. Recovery runs entirely within the submitting command's execution context — it does not re-enter the pool or re-invoke the submitter agent. This design ensures the pool infrastructure remains stateless: it routes work and reports results; it does not own the logic for what happens when routing fails.

---

## Recovery Decision Tree

```
Pool returns envelope
├── status: success
│   └─→ surface report as normal
└── status: failed
    ├── error.code: reviewer_crashed
    │   └─→ invoke FR-MMT24 recovery (§2 below)
    └── error.code: pool_lead_crashed OR drain_timed_out
        └─→ terminal failure; spawn fresh full review team (no recovery)
```

---

## Related Documentation

- [`routing.md`](./routing.md) — Discovery, submission, and routing mode reference (Task 31)
- [`pool-lifecycle.md`](./pool-lifecycle.md) — Pool storage schemas, state machine, writer-ordering rules, locking primitive (Task 29)
- [`review-code.md`](./review-code.md) — `/synthex:review-code` command; references this document for recovery invocation
- [`performance-audit.md`](./performance-audit.md) — `/synthex:performance-audit` command; references this document for recovery invocation
- [`standing-pool-submitter.md`](./standing-pool-submitter.md) — file-based submission agent; does NOT own recovery logic

---

## 2. Recovery Procedure (FR-MMT24 — Normative)

The following steps execute in the submitting command's host session after receiving an envelope with `status: failed` and `error.code: reviewer_crashed`.

**Step 1: Extract failed reviewer name.**
Read `error.message` from the failed envelope. The Pool Lead embeds the failed reviewer's name in `error.message` per the format: `"Reviewer {name} did not complete: {reason}"`. Extract `{name}` from this message.

**Step 2: Spawn fresh native sub-agent.**
From the submitting command's host session, spawn a fresh native sub-agent for the failed reviewer via the Task tool — the same way the command would spawn a reviewer in non-pool mode. This is the "host session recovery" path: the recovery runs in the submitting command's execution context, not inside the pool or the submitter agent. The fresh sub-agent receives the same inputs the pool reviewer would have received (diff scope, files, specs, focus area).

**Step 3: Wait for fresh sub-agent's findings.**
Wait for the fresh sub-agent to complete. In non-multi-model mode, collect the sub-agent's markdown report only. In multi-model mode, collect both markdown and `findings_json` (same envelope shape as FR-MMT20 expects from native reviewers).

**Step 4: Lightweight merge.**
Append the recovered reviewer's findings to the surviving reviewers' findings from the original envelope. Do NOT run full re-consolidation (Stages 3–6 NOT re-run). The merged result is the union of: original envelope's surviving findings + recovered reviewer's findings.

**Step 5 (multi-model pools only): Partial dedup.**
For multi-model pools, run partial dedup per D19: apply Stages 1+2 from the parent plan's consolidation pipeline (fingerprint dedup + lexical dedup) against the appended findings. Reference parent plan Tasks (the parent plan's Stage 1 = fingerprint dedup, Stage 2 = lexical dedup — exact parent task numbers are established in `docs/plans/multi-model-review.md`; this document delegates to that reference). Stages 3–6 are NOT re-run — this is the D19 "lightweight merge" guarantee.

**Step 6: Attribution.**
Recovered findings carry `source.source_type: "native-recovery"` to distinguish them from primary findings (`source.source_type: "native-team"`) in the unified report.

**Step 7: Emit unified report.**
Prepend the verbatim FR-MMT24 step 5 header to the merged report: **`"Note: reviewer {name} was recovered from a pool failure. Results below include recovered findings."`** (interpolated with actual reviewer name from Step 1). Then surface the merged report as the command's final output.

### 2.1 FR-MMT24 Acceptance Criteria

- Recovery is invoked only when the submitter returns `status: failed` with `error.code: reviewer_crashed`.
- Failed reviewer name is extracted from `error.message` using the `"Reviewer {name} did not complete: {reason}"` format.
- Fresh sub-agent is spawned via the Task tool from the host session (not from inside the pool or submitter).
- Lightweight merge does NOT re-run Stages 3–6 of the consolidation pipeline.
- Multi-model pools apply partial dedup (Stages 1+2 only) per D19.
- Recovered findings carry `source.source_type: "native-recovery"` attribution.
- The FR-MMT24 step 5 header is prepended verbatim to the merged report.
- Recovery does not modify pool state — it is a host-side procedure entirely.

---

## 3. Integration Points

- `review-code.md` (Task 54) and `performance-audit.md` (Task 57) reference this document and invoke recovery when the submitter returns `status: failed` with `error.code: reviewer_crashed`.
- Recovery is NOT invoked for other `error.code` values (e.g., `pool_lead_crashed`, `drain_timed_out`) — those are terminal failures; the command falls back to spawning a completely fresh review team.
- `standing-pool-submitter.md` (Task 35) does NOT own recovery logic. The submitter's responsibility ends at returning the envelope. `standing-pool-submitter.md` does not implement the recovery steps in §2 and should not be extended to do so.
- The Task tool is the mechanism for spawning the fresh native sub-agent in host session recovery (Step 2). This is the same tool used by the submitting command to spawn reviewers in non-pool mode — recovery is intentionally symmetric with non-pool spawning.

---

## 4. D19: Partial Dedup Entry Point

Recovery's partial dedup (multi-model pools only) reuses the parent plan's Stage 1 (fingerprint dedup) and Stage 2 (lexical dedup) as a "partial dedup" entry point — these are the first two stages of the parent's full 6-stage consolidation pipeline. Stages 3–6 (severity normalization, CoVe verification, confidence scoring, cross-cutting synthesis) are NOT re-run in recovery:

- **Why Stages 1+2 only:** Preserves the D19 "~5% of full re-consolidation cost" guarantee. Stages 3–6 are expensive (LLM calls for CoVe, confidence scoring). Re-running them would negate the amortized cost benefit of pool reuse.
- **Tradeoff:** Recovered findings may not be as thoroughly de-duplicated against each other as in a full fresh run — acceptable given they come from a single freshly-spawned reviewer.
- **Reference:** The parent plan's consolidation pipeline stage numbering (Stage 1 = fingerprint dedup, Stage 2 = lexical dedup) is established in `docs/plans/multi-model-review.md`. This document uses those stage numbers by reference; the parent plan is the authoritative source.

### 4.1 D19 Acceptance Criteria

- Partial dedup applies only to multi-model pools.
- Only Stage 1 (fingerprint dedup) and Stage 2 (lexical dedup) are applied from the parent consolidation pipeline.
- Stages 3–6 are explicitly NOT re-run in the recovery path.
- The cost of recovery's partial dedup is approximately 5% of the cost of a full re-consolidation run.

---

## 5. Worked Example

### Scenario

A review command submits to `review-pool-a` (a two-reviewer multi-model pool) with native code-reviewer and security-reviewer sub-agents. After the code-reviewer completes successfully, the security-reviewer crashes mid-analysis.

### Walkthrough

**Pool Lead writes failure envelope:**
```json
{
  "status": "failed",
  "error": {
    "code": "reviewer_crashed",
    "message": "Reviewer security-reviewer did not complete: process terminated (exit code 127)"
  },
  "findings_json": {
    "findings": [
      {
        "file": "auth/login.ts",
        "line": 42,
        "severity": "high",
        "message": "Insufficient input validation on password field",
        "source": { "source_type": "native-team", "reviewer_id": "code-reviewer" }
      }
    ]
  }
}
```

**Host session recovery (Steps 1–7):**

1. Extract reviewer name: `security-reviewer`
2. Spawn fresh security-reviewer sub-agent via Task tool
3. Fresh sub-agent completes, returns security findings
4. Lightweight merge: append security-reviewer's findings to code-reviewer's existing findings (no Stages 3–6 re-run)
5. Apply partial dedup (Stages 1+2 only): fingerprint dedup and lexical dedup across the merged set
6. Tag recovered findings: `source.source_type: "native-recovery"`
7. Prepend header and emit merged report:

**Final merged report:**
```
Note: reviewer security-reviewer was recovered from a pool failure. 
Results below include recovered findings.

## Code Quality Issues

[code-reviewer findings: 1 issue]

## Security Issues

[security-reviewer recovered findings: 2 issues]
```

The original code-reviewer findings remain unchanged; the recovered security findings are de-duplicated (partial dedup only) and combined into the unified final report.

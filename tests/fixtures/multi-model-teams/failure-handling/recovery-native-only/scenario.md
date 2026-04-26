# Scenario: FR-MMT24 Recovery — Native-Only Pool

## Overview

A native-only standing pool (`multi_model: false`) has two reviewers: `code-reviewer` and
`security-reviewer`. Both are submitted tasks concurrently via the standing-pool-submitter.

`security-reviewer` completes normally with 3 findings. `code-reviewer` crashes mid-task. The
submitter agent returns a `status: failed` envelope to the submitting command's host session.

Per FR-MMT24, the **submitting command's host session** (not the submitter agent) detects the
`reviewer_crashed` error code, extracts the failed reviewer name from `error.message`, and
invokes recovery: it spawns a fresh native `code-reviewer` via the Task tool, waits for its
findings (2 findings returned), appends them to the surviving security-reviewer findings via
lightweight merge (Stages 3–6 NOT re-run), and emits a unified report with the FR-MMT24
step-5 header.

## Key Invariants Tested

- **FR-MMT24**: Recovery owned by submitting command host session, not standing-pool-submitter
- **Native-only path**: `multi_model: false`; no external model spawning
- **Lightweight merge**: surviving + recovered findings appended; no full reconsolidation
- **Attribution**: recovered findings carry `source_type: "native-recovery"`
- **Report header**: verbatim FR-MMT24 step-5 note present in unified report

## Frames

| # | Frame | State |
|---|-------|-------|
| 1 | `pool_active` | Pool is active with 2 tasks submitted |
| 2 | `security_reviewer_completed` | security-reviewer finishes with 3 findings |
| 3 | `code_reviewer_crashed` | code-reviewer fails with process termination |
| 4 | `submitter_returns_failed` | Submitter envelope: status failed, reviewer_crashed |
| 5 | `recovery_invoked` | Host session spawns fresh code-reviewer via Task tool |
| 6 | `fresh_reviewer_completed` | Fresh code-reviewer returns 2 findings |
| 7 | `lightweight_merge` | 3 surviving + 2 recovered = 5 total; no full reconsolidation |
| 8 | `unified_report_emitted` | Report with FR-MMT24 step-5 header emitted |

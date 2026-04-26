# Scenario: Concurrent Submitters to the Same Standing Pool

## Overview

This fixture models two independent sessions submitting review tasks to the same standing pool
(`shared-pool`) at nearly the same time. Each session generates its own UUID-based `report_to`
path, so each session receives the correct consolidated report envelope without any collision
between them.

This is the Layer 2 fixture for FR-MMT18 race condition semantics.

---

## FR-MMT18 Behavior: Concurrent Submissions Both Complete

Per `docs/specs/multi-model-teams/routing.md` §5:

> When two standard Synthex commands in different sessions submit tasks to the same standing
> pool concurrently, the file-based task list serializes the work naturally — the pool's
> reviewers process tasks in arrival order, one at a time per reviewer (or in parallel across
> reviewers as today's review teams do). The two sessions get their results back in
> non-deterministic order based on which finishes first.

Both sessions complete successfully. Neither session loses work. The pool processes tasks from
both sessions in arrival order (the order in which the UUID-named task files land on disk).
Which session finishes first is non-deterministic — it depends on task complexity and pool
lead scheduling, not on submission order.

This is documented behavior, not a bug.

---

## How UUID Filenames Prevent Report Collision

Each session independently calls the `standing-pool-submitter` agent. At Step 2 of the
submitter's behavior, the submitter generates two UUIDs per submission:

- **`batch_uuid`** — used for the task file names and the mailbox notification file name.
- **`report_uuid`** — used for the `report_to` path.

These UUIDs are randomly generated (UUID v4) per invocation. Because each session generates
its own `report_uuid` independently, the resulting `report_to` paths are distinct:

| Session | Report UUID | Report-to path |
|---------|-------------|----------------|
| A | `uuid-session-a-report` | `~/.claude/tasks/standing/shared-pool/reports/uuid-session-a-report.json` |
| B | `uuid-session-b-report` | `~/.claude/tasks/standing/shared-pool/reports/uuid-session-b-report.json` |

The Pool Lead writes each consolidated report envelope to the session-specific `report_to`
path it received in the mailbox notification. Session A polls for its path; Session B polls
for its path. Neither session can read the other's report envelope.

---

## The File-Based Task List Serializes Work Naturally

The pool's task directory (`~/.claude/tasks/standing/shared-pool/`) accumulates task files
from both sessions as they arrive. Each task file has a UUID filename (`<uuid>.json`) written
atomically via the `.tmp` + rename pattern (FR-MMT16 §2). The Pool Lead processes task files
in arrival order — whichever UUID file appeared first on disk is processed first.

There is no locking between concurrent submitters at write time. The atomicity guarantee
(`.tmp` + rename) ensures that a partially-written task file is never visible to the Pool
Lead; it only ever sees complete, well-formed task JSON. The POSIX `rename()` syscall is
atomic at the filesystem level, so two concurrent submitters writing to different UUID
filenames never conflict.

---

## This Is Documented Behavior, Not a Bug

The non-deterministic completion order is an explicit design decision:

- The pool primitive **optimizes for amortized cost**, not concurrent throughput.
- The file-based task list is the correct serialization primitive for this use case.
- Each session gets exactly the report it submitted for, via UUID-isolated `report_to` paths.

Users who want guaranteed parallelism across sessions — where both sessions make progress
simultaneously with bounded latency — should use **multiple pools**:

```
/synthex-plus:start-review-team --name review-pool-a --reviewers code-reviewer,security-reviewer
/synthex-plus:start-review-team --name review-pool-b --reviewers code-reviewer,security-reviewer
```

Session A routes to `review-pool-a`; Session B routes to `review-pool-b`. Each pool processes
its own work independently. This is the recommended approach when concurrent throughput is a
priority.

---

## Key Assertions

| Property | Expected Value |
|---|---|
| `session_a.report_to !== session_b.report_to` | `true` (no collision) |
| `session_a.report_uuid !== session_b.report_uuid` | `true` |
| task_uuids overlap between sessions | `false` (no overlap) |
| `expected.report_to_paths_differ` | `true` |
| `expected.no_report_collision` | `true` |
| `expected.pool_serializes_work` | `true` |
| `expected.fr_mmt18_documented_behavior` | non-empty string |

---

## References

- `plugins/synthex-plus/agents/standing-pool-submitter.md` — UUID generation (Step 2),
  UUID-based filenames guarantee, `report_to` field documentation
- `docs/specs/multi-model-teams/routing.md` §5 — FR-MMT18 race condition semantics
- FR-MMT16 §2 — UUID filename atomicity requirement
- FR-MMT18 §5.1 — report-to path isolation per submission

# Scenario: Discovery-and-Submit to Standing Pool

## Overview

This fixture exercises the full Layer 2 flow: a standard `/synthex:review-code` command
discovers a matching standing pool via inline discovery and routes both review tasks through
the `standing-pool-submitter` agent. The pool returns a success envelope containing a
consolidated review report.

## What This Fixture Tests

### 1. Inline Discovery Finds a Matching Pool

The submitting command reads `~/.claude/teams/standing/index.json` at command-invocation
time and finds `review-pool-a` — a pool whose roster `[code-reviewer, security-reviewer]`
covers the required-reviewer-set `[code-reviewer, security-reviewer]` under `matching_mode:
covers`. The pool state is `idle` and the TTL has not expired (`last_active_at` is within
`ttl_minutes: 60`). The routing decision is `routed-to-pool`.

### 2. Submitter Is Invoked with Correct Inputs

The standing-pool-submitter is invoked with the correct input object:

- `pool_name: "review-pool-a"` — matches the discovered pool
- `tasks: [...]` — two task objects, one per reviewer (`code-reviewer`, `security-reviewer`)
- `submission_timeout_seconds: 300` — sourced from `lifecycle.submission_timeout_seconds`

Each task has a `subject` and `description`. Tasks are independent (no `blockedBy` field).

### 3. Tasks Written Atomically (.tmp + rename)

For each task in the batch, the submitter:

1. Serializes the task JSON (with per-task UUID, `report_to` path, `status: "pending"`,
   `submitted_at` ISO-8601 timestamp).
2. Writes to `~/.claude/tasks/standing/review-pool-a/<task_uuid>.json.tmp`.
3. Renames atomically: `mv -f <task_uuid>.json.tmp <task_uuid>.json`.

The `.tmp` + rename pattern (FR-MMT16 §2) ensures a partial write is never visible to the
Pool Lead. Two task UUIDs are collected: `["uuid-1111", "uuid-2222"]`.

### 4. Mailbox Notification Sent to Pool Lead

After writing both task files, the submitter writes a `tasks_submitted` notification to
`~/.claude/teams/standing/review-pool-a/inboxes/lead/<batch_uuid>.json` using the same
`.tmp` + rename pattern. The notification includes the batch UUID, both task UUIDs, and the
shared `report_to` path.

### 5. Report Envelope Polled and Returned

The submitter polls `~/.claude/tasks/standing/review-pool-a/reports/<report_uuid>.json`
with exponential backoff (start 2s, max 10s). The Pool Lead writes the consolidated
report envelope to the `report_to` path before the 300s timeout. The submitter reads and
returns the envelope.

### 6. Success Envelope Surfaced as Final Review Output

The submitter returns the envelope with `status: "success"`, a non-null `report` string,
`error: null`, and `metadata` containing `pool_name`, `multi_model: false`, `task_uuids`,
and `completed_at`. The calling command (`review-code`) surfaces this report as the final
review output.

### 7. Provenance Line Prepended (NFR-MMT7 Item 4)

Per NFR-MMT7 Item 4, the calling command prepends the verbatim provenance line to the
report header before surfacing it to the user:

```
Review path: standing pool 'review-pool-a' (multi-model: no).
```

This line is also the normative text documented in
`plugins/synthex/commands/review-code.md` as:

```
Review path: standing pool '{pool_name}' (multi-model: {yes|no}).
```

## Pool Under Test

- **Name:** `review-pool-a`
- **Roster:** `code-reviewer`, `security-reviewer`
- **multi_model:** `false`
- **pool_state:** `idle`
- **ttl_minutes:** `60`
- **routing_mode:** `prefer-with-fallback`
- **matching_mode:** `covers`

## Key Assertions

| Property | Expected Value |
|---|---|
| `routing_decision` | `"routed-to-pool"` |
| `pool_name` | `"review-pool-a"` |
| `multi_model` | `false` |
| `submitter_invoked` | `true` |
| `tasks_submitted_count` | `2` |
| `envelope_status` | `"success"` |
| `report_surfaced` | `true` |
| `notification_contains` | `"Routing to standing pool 'review-pool-a' (multi-model: no)."` |
| `provenance_line` | `"Review path: standing pool 'review-pool-a' (multi-model: no)."` |

## References

- `plugins/synthex/commands/review-code.md` — submitting command, inline discovery, NFR-MMT7 provenance line
- `plugins/synthex-plus/agents/standing-pool-submitter.md` — drain check, atomic writes, polling, output contract
- `docs/specs/multi-model-teams/routing.md` §1.4 — inline discovery is the caller's responsibility
- FR-MMT14a — pre-submission drain check
- FR-MMT16 — atomic task write and mailbox notification
- FR-MMT16a — report envelope polling and timeout fallback
- FR-MMT17 — routing notification verbatim text
- NFR-MMT7 Item 4 — provenance line verbatim text

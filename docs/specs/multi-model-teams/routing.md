## Status: Skeleton

# Routing — Discovery, Submission, and Routing Mode Reference

This document is the normative source of truth for how standard Synthex commands discover standing review pools, submit work to them, poll for reports, and resolve routing mode semantics. Phase 8 (Task 67) replaces this skeleton with narrative prose, tutorial examples, and extended cross-references. The normative procedures, schemas, and verbatim requirement text below are complete from the start.

---

## Related Documentation

- [`architecture.md`](./architecture.md) — Option B rationale, native-team-vs-orchestrator separation, cross-session lifetime model (forthcoming, Task 3 / Task 65)
- [`pool-lifecycle.md`](./pool-lifecycle.md) — Pool storage schemas, state machine, writer-ordering rules, locking primitive (Task 29)
- [`recovery.md`](./recovery.md) — FR-MMT24 per-task fallback, stale-pool cleanup, partial-dedup entry point (forthcoming)
- [`standing-pools.md`](../../plugins/synthex-plus/docs/standing-pools.md) — User-facing design doc (forthcoming, NFR-MMT8)

---

## 1. Discovery (FR-MMT15)

### 1.1 v1 Routing Scope

In v1, two standard Synthex commands gain a discovery step:

| Command | v1/v2 | Required reviewer set (default) | Override sources |
|---------|-------|--------------------------------|------------------|
| `/synthex:review-code` | **v1** | `code-reviewer, security-reviewer` (from `code_review.reviewers` config) | `--reviewers` flag at invocation; `code_review.reviewers` config |
| `/synthex:performance-audit` | **v1** | `performance-engineer` (static) | (none in v1 — set is hardcoded) |
| `/synthex:next-priority` | v2 extension | Varies by triggered work | n/a |
| `/synthex:write-implementation-plan` | v2 extension | `architect, designer, tech-lead` (planning roles) | `implementation_plan.reviewers` config |
| `/synthex:refine-requirements` | v2 extension | `product-manager, tech-lead, designer` | `refine_requirements.reviewers` config |
| `/synthex:write-rfc` | v2 extension | `architect, product-manager, tech-lead, security-reviewer` | n/a |
| `/synthex:reliability-review` | v2 extension | `sre-agent, terraform-plan-reviewer` (optional) | `reliability.reviewers` config |

The other five commands are listed as **v2 extension points** because their default standing-pool roster (`code-reviewer, security-reviewer`) does not cover their planning-role reviewers; hit rate for pool routing on those commands would be effectively zero in v1.

### 1.2 Required-Reviewer-Set Computation (Normative)

For each v1 command, the required-reviewer-set is computed at invocation time per the resolution chain documented for that command:

- **`/synthex:review-code`** — **dynamic per-invocation**: (a) the command's `--reviewers` flag if present, else (b) `code_review.reviewers` from `.synthex/config.yaml`, else (c) the command's hardcoded fallback set.
- **`/synthex:performance-audit`** — **static**: hardcoded `[performance-engineer]`. As of v1, `/performance-audit` does not expose a configurable reviewer set (no `performance_audit.reviewers` config key in `plugins/synthex/config/defaults.yaml`; no `--reviewers` flag — verified against `plugins/synthex/commands/performance-audit.md`). The discovery step uses the static set directly. If a future Synthex release introduces `performance_audit.reviewers` or a `--reviewers` flag, this resolution chain extends to mirror `/review-code`'s pattern; that is a v2 concern.

The discovery procedure (§1.3) uses the resolved set as the "needs" side of the matching check against each pool's roster.

### 1.3 Discovery Procedure (FR-MMT15 — Verbatim)

The discovery procedure executes once per command invocation:

1. **Compute** the required-reviewer-set per the rule in §1.2.
2. **Read** `~/.claude/teams/standing/index.json` and filter to pools where `standing: true`, `pool_state` is not `draining` or `stopping`, and TTL has not expired (`now - last_active_at < ttl_minutes`). Pools failing the TTL check trigger the FR-MMT13 cleanup path inline.
3. **Apply matching mode** (from `standing_pools.matching_mode`):
   - `covers` (default) — pool's roster must be a superset of the required-reviewer-set
   - `exact` — pool's roster must equal the required-reviewer-set
4. **Among matching pools**, pick the first one (deterministic by name sort order). Multiple matching pools is unusual and not optimized for in v1.
5. **If a pool matches**, route to it (FR-MMT16). If no pool matches, apply routing mode (FR-MMT17).

### 1.4 Inline-Discovery Convention (Architect Cycle 1 Finding)

Discovery executes **inline in the submitting command's workflow markdown** — NOT delegated to a sub-agent via the Task tool.

**Why inline:** Wrapping the discovery filter logic in a Task-tool LLM invocation would blow the NFR-MMT3 < 500 ms cold-case routing budget. NFR-MMT3 requires discovery to complete in < 100 ms for up to 10 pools (local SSD). The discovery filter is pure mechanical file I/O: read one `index.json`, compare roster sets, pick first match. It contains no judgment that requires an LLM. A Task-tool invocation adds model-call latency that is incompatible with the < 100 ms primitive target.

**Operationally:** The submitting command (Task 54 for `/review-code`, Task 57 for `/performance-audit`) reads `~/.claude/teams/standing/index.json` directly as a Bash workflow step. The result — one of `{routing_decision: "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch" | "fell-back-pool-draining" | "fell-back-pool-stale", pool_name?: string, multi_model?: bool, match_rationale?: string}` — is an inline output of that step, not a sub-agent response.

**Exception — stale-pool cleanup:** When inline discovery detects a stale pool (FR-MMT13 TTL expiry, or FR-MMT22 dead-process detection), it DOES invoke the `standing-pool-cleanup` Haiku utility agent (Task 32) for the multi-step coordinated cleanup under index lock. The cleanup agent is invoked because cleanup requires acquiring `.index.lock`, removing index entries, and potentially removing the metadata directory — coordinated writes that are cleanly encapsulated in the agent. Discovery itself remains inline; the cleanup side-effect delegates only the filesystem coordination.

### 1.5 FR-MMT15 Acceptance Criteria

- Discovery runs at command-invocation time (not at session start) so newly-spawned pools become routable immediately.
- The required-reviewer-set is computed per-invocation from the resolution chain above; verifiable by inspecting two invocations of `/review-code` with different `--reviewers` flags.
- `covers` matching correctly identifies a pool with `code-reviewer + security-reviewer + design-system-agent` as a match for a command needing `code-reviewer + security-reviewer`.
- Discovery is fast (< 100 ms for a project with up to ~10 standing pools, on local SSD) and does not require enumerating teammates.
- Discovery does not modify any pool state — it only reads (the cleanup path it may trigger via FR-MMT13 is a separate write, gated by `.index.lock`).
- A pool whose TTL has expired is skipped in matching AND triggers cleanup (per FR-MMT13).
- A pool in `draining` or `stopping` state is skipped in matching (per FR-MMT14a).
- v1 routing is implemented for `/review-code` and `/performance-audit` only; the other five commands listed in the table are extension points and have no routing logic in v1.

---

## 2. Submission (FR-MMT16)

When a standard Synthex command routes work to a standing pool, it does so via the file-based mechanism that synthex-plus already uses for intra-team coordination:

1. **Submit task(s)** by writing to the pool's task list at `~/.claude/tasks/standing/<name>/`. Each task has the same shape as a non-standing review task: subject, description (with diff scope, files, specs, focus area per reviewer), no `blockedBy` (review tasks are independent). **Filename:** each submitted task uses a UUID-based filename `<uuid>.json` to guarantee uniqueness across concurrent submitters. **Atomicity:** write to `<uuid>.json.tmp`, then `rename` to `<uuid>.json` — a partial write is never visible to the Pool Lead.
2. **Send a notification** (optional, recommended) by writing to the Pool Lead's mailbox at `~/.claude/teams/standing/<name>/inboxes/lead/`. Filename `<uuid>.json` (same uuid as the task), atomic write per the same `.tmp` + rename pattern. The notification's payload: pool tasks just submitted, expected report destination.
3. **Specify report destination.** The submitting command writes a "report-to" path in the task description (recommended convention: `~/.claude/tasks/standing/<name>/reports/<uuid>.json` so the report-to path is also unique-per-submission). The Pool Lead, after consolidation (or — if the pool is multi-model-enabled — after the orchestrator finishes), writes the report envelope (§3) to that path. The submitting command polls or watches the path for the report.
4. **Wait for completion.** The submitting command polls the task list (every 2 seconds, with backoff to a maximum of 10 seconds between polls) until all submitted tasks reach `completed` status (or `failed` per FR-MMT24, or the polling timeout fires per §3 below). Then reads the report envelope from the report-to path.

### 2.1 FR-MMT16 Acceptance Criteria

- Tasks submitted to a standing pool are picked up within the standard idle-poll interval (verified via fixture).
- Tasks and mailbox messages use UUID filenames written with the `.tmp` + rename atomic pattern.
- The report-to path mechanism allows multiple sessions to submit concurrent work to the same pool without report collision (each session's submission uses a unique uuid-based report-to path per step 3 above).
- The submitting command waits gracefully — does not race past task submission to read a report that doesn't exist yet.
- The submitting command times out after `lifecycle.submission_timeout_seconds` and falls back per FR-MMT24.
- The report envelope shape is enforced (Layer 1 schema test) and the submitter handles both `status: success` and `status: failed`.
- The route-to-pool path is functionally equivalent to the spawn-fresh-sub-agents path: same report shape, same FAIL semantics, same caller experience modulo timing.

---

## 3. Report Envelope (FR-MMT16a)

### 3.1 Envelope Shape (Verbatim)

The report at the report-to path is **always a JSON envelope** with this top-level shape:

```json
{
  "status": "success" | "failed",
  "report": "<consolidated review report markdown>" | null,
  "error": {
    "code": "<one of: pool_lead_crashed, orchestrator_failed, drain_timed_out, ...>",
    "message": "<human-readable detail>"
  } | null,
  "metadata": {
    "pool_name": "<name>",
    "multi_model": true | false,
    "task_uuids": ["..."],
    "completed_at": "<ISO-8601 UTC>"
  }
}
```

### 3.2 Success and Failure Semantics

- `status: "success"` ⇒ `report` is a non-null string, `error` is `null`. The submitting command surfaces `report` as it would surface a fresh-spawn review's output.
- `status: "failed"` ⇒ `report` is `null`, `error` is non-null. The submitting command treats this as a pool-routing failure and applies FR-MMT24 per-task fallback (re-spawn the failed reviewer's equivalent native sub-agent).

### 3.3 Atomicity Rule

The Pool Lead writes the envelope to `<report-to>.tmp` then `rename`s — partial writes are never visible to the polling submitter.

### 3.4 Polling Timeout

The submitting command polls for at most `lifecycle.submission_timeout_seconds` (default `300` = 5 minutes; settable in `.synthex-plus/config.yaml` under `lifecycle.submission_timeout_seconds` — top-level sibling of `standing_pools:` per D23). If the timeout fires before all submitted tasks reach `completed` or before the report envelope appears, the submitting command:

1. Marks the pool task(s) as `abandoned` (a new task status) so the Pool Lead can detect and stop work on them.
2. Treats the routing as a pool failure and applies the FR-MMT24 per-task fallback path.
3. Emits a one-line user-visible note: `"Pool '{name}' did not return a report within {timeout}s; falling back to fresh-spawn review."`

### 3.5 Why Explicit Timeout

Without an explicit timeout, three failure modes produce indefinite hangs: (a) Pool Lead crashes after marking tasks `completed` but before writing the report; (b) orchestrator fails inside a multi-model pool; (c) the host process tree owning the pool dies between submission and completion, leaving tasks `in_progress` forever.

### 3.6 FR-MMT16a Acceptance Criteria

- Tasks submitted to a standing pool are picked up within the standard idle-poll interval (verified via fixture).
- Tasks and mailbox messages use UUID filenames written with the `.tmp` + rename atomic pattern.
- The report-to path mechanism allows multiple sessions to submit concurrent work to the same pool without report collision (each session's submission uses a unique uuid-based report-to path).
- The submitting command times out after `lifecycle.submission_timeout_seconds` and falls back per FR-MMT24.
- The report envelope shape is enforced (Layer 1 schema test, Task 37) and the submitter handles both `status: success` and `status: failed`.

---

## 4. Routing Modes (FR-MMT17)

### 4.1 `prefer-with-fallback` (Default — D11)

When `standing_pools.routing_mode: prefer-with-fallback`:

- **Pool exists and matches** → route to pool (per FR-MMT16). User-visible note (verbatim): `"Routing to standing pool '{name}' (multi-model: {yes|no})."` The `(multi-model: yes|no)` suffix surfaces the pool's effective multi-model status to users who specifically configured the pool for multi-model lift; it answers "am I getting the multi-model review I think I'm getting?" without requiring a separate `/list-teams`.
- **No pool exists OR no matching pool exists** → spawn fresh sub-agents (today's behavior — same artifacts, same path, same report shape). No user-visible note (silent fallback per persona expectation; audit artifact records the decision per FR-MMT30).

### 4.2 `explicit-pool-required`

When `standing_pools.routing_mode: explicit-pool-required`:

- **Pool exists and matches** → route to pool. Same notification as §4.1.
- **No pool exists OR no matching pool exists** → abort with this verbatim error message (substituting concrete reviewer list):

  ```
  No standing pool matches the required reviewers (code-reviewer, security-reviewer).
  Routing mode is 'explicit-pool-required', so this command will not fall back to
  fresh-spawn reviewers. To proceed, either:
    1. Start a matching pool:
         /synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer
    2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
  ```

  The example uses the actual `--reviewers` flag (not a `{reviewer_list}` placeholder) and shows the value comma-joined to match the `/start-review-team` flag format.

### 4.3 Per-Invocation Routing Flags

In v1, no `--use-pool` / `--no-use-pool` flags are added to standard Synthex commands (per OQ-2's recommendation: revisit only if users complain). Routing mode is set via config only.

### 4.4 FR-MMT17 Acceptance Criteria

- Default mode silently falls back when no pool matches — no error, no spawn-blocking.
- The pool-routing notification includes the `(multi-model: yes|no)` suffix verbatim.
- `explicit-pool-required` mode aborts with the verbatim error message above (substituting the actual required reviewer list), and the message includes a runnable `start-review-team` command.
- The `--use-pool` and `--no-use-pool` invocation flags are NOT added in v1 (per OQ-2).

---

## 5. Race Conditions (FR-MMT18)

When two standard Synthex commands in different sessions submit tasks to the same standing pool concurrently, the file-based task list serializes the work naturally — the pool's reviewers process tasks in arrival order, one at a time per reviewer (or in parallel across reviewers as today's review teams do). The two sessions get their results back in non-deterministic order based on which finishes first.

**This is documented behavior, not a bug.** Users who want guaranteed parallelism across sessions should run multiple pools (e.g., `review-pool-a`, `review-pool-b`) and route to them differently. The pool primitive optimizes for amortized cost, not concurrent throughput.

### 5.1 FR-MMT18 Acceptance Criteria

- Concurrent submissions to the same pool both complete successfully without lost work.
- Each session receives the correct report for its own submission (report-to path isolation per §2).
- `start-review-team.md` and `standing-pools.md` call out the race-condition semantics explicitly.

---

## 6. Draining-State Submission Semantics (FR-MMT14a)

When `pool_state: draining`, the pool will not accept new tasks. The submission contract on the routing side (FR-MMT16) is:

1. **Submitter behavior:** Before writing a task to a pool's task list (§2 step 1), the submitting command re-reads the pool's `~/.claude/teams/standing/<name>/config.json` and inspects `pool_state`. If `pool_state` is `draining` or `stopping`, the submitting command does NOT write to the pool's task list. Instead, it treats the pool as not-present for routing purposes and applies `routing_mode` per §4 (silent fallback in `prefer-with-fallback`; abort in `explicit-pool-required`).
2. **Pool Lead behavior:** When the Pool Lead transitions to `draining`, it updates `config.json.pool_state` atomically (write to `config.json.tmp`, rename) before processing any further mailbox messages. This ensures the visibility window between "I am draining" and "submitters know" is bounded by the time between submitter discovery checks (typically < 1 second).
3. **Race with discovery and the index:** Between a pool transitioning to `draining` and discovery removing it from the index, a submitter could see the index entry but read `pool_state: draining`. Step 1 above handles this case explicitly — the submitter falls back, treating the pool as not-present.
4. **No "pool is draining" user message in submitting commands** in v1 — the silent fallback per `prefer-with-fallback` covers this case. Audit artifact (FR-MMT30) records the "would-have-routed-but-pool-was-draining" event for analytics.

See `pool-lifecycle.md` for the producer-side draining semantics (Pool Lead state machine, in-flight task completion, `draining → stopping` transition).

### 6.1 FR-MMT14a Acceptance Criteria

- A pool in `draining` state correctly rejects new submissions (the routing path falls back to fresh-spawn or aborts per `routing_mode`).
- The Pool Lead's transition to `draining` updates `config.json.pool_state` atomically before any further task processing.
- Audit artifact records "pool-was-draining" as a routing-decision reason when applicable.

---

## 7. Stale-Pool Cleanup (FR-MMT22)

### 7.1 Detection Conditions

A pool is detected as "stale" by either of two conditions during inline discovery:

1. **Metadata directory missing.** The index entry exists but `~/.claude/teams/standing/<name>/` is gone (e.g., user manually deleted it).
2. **Process likely dead.** The metadata directory exists but `last_active_at` has not been updated for longer than `max(ttl_minutes, 24h)` — the pool's idle hook has not run, suggesting the host process tree owning the teammate processes has died (host reboot, OS-level kill, parent Claude Code process exit).

### 7.2 Cleanup Procedure (FR-MMT22 Normative)

Single path for both detection conditions:

1. Acquire `.index.lock` per FR-MMT9a.
2. Remove the index entry (atomic `.tmp` + rename on `index.json`).
3. If the metadata directory still exists, remove it (`rm -rf ~/.claude/teams/standing/<name>/`).
4. Release the lock.
5. Emit a one-time-per-session user-visible warning: `"Standing pool '{name}' appears to have died unexpectedly (no activity for {idle_minutes} min). Cleaned up its metadata. If this happens repeatedly, check host process state or use /list-teams to inspect remaining pools."` The "one-time-per-session" guarantee avoids spamming the warning on repeated commands within the same session.
6. Continue with the routing decision per `routing_mode` (silent fallback in `prefer-with-fallback`; abort in `explicit-pool-required`).

### 7.3 Inline-Discovery Side-Effect and `standing-pool-cleanup` Agent

Stale-pool cleanup is a **side-effect of inline discovery** in the submitting command. When inline discovery encounters a stale pool (step 2 of §1.3), it invokes the `standing-pool-cleanup` Haiku utility agent (Task 32) to perform the multi-step coordinated cleanup under index lock (steps 1–4 of §7.2). The cleanup agent's scope is limited to filesystem coordination — it does NOT perform the discovery filter step.

The user-visible warning text for TTL-expired pools (FR-MMT13 "probably dead" path — distinct from FR-MMT22 post-death orphan cleanup) is:

- **Alive-path (pool responded to idle hook recently enough):** `"Pool {name} expired after {idle_minutes} min idle (TTL was {ttl_minutes}); cleaned up."`
- **Dead-path (stale — no idle hook activity):** `"Pool {name} appears stale (no activity for {idle_minutes} min); reaping orphan metadata."`

The FR-MMT22 step-5 warning for general stale detection (not TTL-specific):

`"Standing pool '{name}' was stale and has been cleaned up. {fallback_action}."` (Task 47 will embed this in command bodies; this document is the schema-of-record.)

See `pool-lifecycle.md` for the producer-side TTL and draining semantics.

### 7.4 FR-MMT22 Acceptance Criteria

- Stale index entries are detected and cleaned automatically when the metadata directory is missing OR `last_active_at` is older than `max(ttl_minutes, 24h)`.
- Cleanup is atomic: index entry removed and (if present) metadata directory removed under the cross-session lock.
- The user-visible warning fires at most once per session per stale pool detection.
- The command continues without erroring (in `prefer-with-fallback` mode); aborts in `explicit-pool-required` mode if the cleanup leaves no matching pool.

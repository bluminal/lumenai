# Scenario: draining-rejection

## Summary

The pool `review-pool-b` transitions to `draining` state between the moment inline discovery reads `index.json` (which shows `pool_state: idle`) and the moment the standing-pool-submitter agent runs its mandatory Step 1 drain check. The submitter re-reads `config.json` directly, discovers `pool_state: draining`, and returns `fell-back-pool-draining` without writing any task files or mailbox notifications.

---

## The Race Condition FR-MMT14a Addresses

### Why the race exists

Inline discovery and submission are two distinct steps with a temporal gap between them:

1. **Inline discovery** (executed inside the submitting command's workflow): reads `~/.claude/teams/standing/index.json`, finds `review-pool-b` with `pool_state: idle`, selects it as the routing target.
2. **Between steps**: the pool operator (or `stop-review-team`) calls `pool_state: draining` — updating `config.json` atomically. The index entry has not yet been updated.
3. **Submitter invocation**: the standing-pool-submitter agent is invoked with `pool_name: review-pool-b`.

The index snapshot seen by discovery is now stale. If the submitter trusted the index, it would attempt to write task files to a pool that has already rejected new work — a lost submission.

### How FR-MMT14a bounds the visibility window

FR-MMT14a (routing.md §6) mandates that the submitter ALWAYS re-reads `config.json` before writing any task files, regardless of what the inline discovery step found in the index. This re-read is the "drain check" (Step 1 of the submitter's behavior):

> Before writing any task files, re-read the pool's config at `~/.claude/teams/standing/<pool_name>/config.json`. Inspect `pool_state`.

The config.json re-read is the authoritative source of truth for current pool state. The index is an eventually-consistent cache; config.json is updated atomically by the pool before any further processing. The visibility window for the race condition is therefore bounded by the time between the submitter invoking the drain check and the pool updating config.json — typically sub-second.

---

## Submitter's Mandatory Step 1 Drain Check

Per `plugins/synthex-plus/agents/standing-pool-submitter.md`, Step 1 (Pre-Submission Drain Check, FR-MMT14a):

1. The submitter re-reads `~/.claude/teams/standing/<pool_name>/config.json`.
2. It inspects `pool_state`.
3. If `pool_state` is `draining` or `stopping`:
   - Does **NOT** write any task files.
   - Does **NOT** send any mailbox notifications.
   - Returns immediately: `{ "routing_decision": "fell-back-pool-draining" }`.

This check fires before Steps 2-5 (UUID generation, atomic task write, mailbox notification, polling). When the drain check fires, the submission is cleanly aborted with no filesystem side effects.

---

## On `draining` or `stopping`: Returns fell-back-pool-draining

When the drain check detects `pool_state: draining` or `stopping`, the submitter returns:

```json
{ "routing_decision": "fell-back-pool-draining" }
```

This is a structured fallback routing decision. The calling command receives this and applies `routing_mode` semantics:

- **`prefer-with-fallback`** (default): silently falls back to fresh-spawn review. No error shown to the user. Audit artifact records `fell-back-pool-draining`.
- **`explicit-pool-required`**: aborts with the FR-MMT17 verbatim error message (no matching pool, pool was draining).

---

## Submitter Handles Missing config.json the Same as Draining

If `config.json` is missing entirely (e.g., the pool's metadata directory was cleaned up concurrently by `standing-pool-cleanup`), the submitter treats this identically to `pool_state: draining`:

> If `config.json` is missing (pool metadata was cleaned up concurrently), treat this the same as `draining` and return `routing_decision: "fell-back-pool-draining"`.

This ensures that partially-cleaned-up pools cannot receive new task submissions even transiently.

---

## Calling Command's Fallback Behavior

After receiving `fell-back-pool-draining`, the calling command:

- **`prefer-with-fallback`**: falls back to spawning fresh native sub-agents (code-reviewer, security-reviewer) as it would if no pool existed. The user sees a standard review output with no routing note about the draining pool (silent fallback per FR-MMT14a §4).
- **`explicit-pool-required`**: aborts with the FR-MMT17 error, instructing the user to start a matching pool or change routing mode.

---

## Assertions

- `expected.routing_decision === "fell-back-pool-draining"`
- `expected.task_files_written === false` (no task files created when drain check fires)
- `expected.mailbox_notification_sent === false` (no mailbox notification when drain check fires)
- `expected.drain_check_exercised === true` (Step 1 ran and detected draining)
- `expected.config_reread === true` (submitter re-read config.json, not index)
- `setup.index_state.pool_state === "idle"` (stale snapshot — the race condition window)
- `setup.config_json_state.pool_state === "draining"` (real state — what config.json contains)

---

## Acceptance Criteria Covered

- FR-MMT14a: submitter always re-reads `config.json` before writing tasks (drain check is mandatory)
- FR-MMT14a §6.3: race condition between discovery and submission is handled explicitly
- FR-MMT14a: `pool_state: draining` and `stopping` both reject submission cleanly
- FR-MMT14a: missing `config.json` treated same as draining
- Submitter's Step 1 fires before any filesystem writes (task files, mailbox notifications)
- Calling command applies `routing_mode` semantics on fallback decision

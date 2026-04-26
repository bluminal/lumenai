## Status: Skeleton

# Pool Lifecycle — Normative Schema and Contract Reference

This document is the normative source of truth for standing-pool storage schemas, state machine, writer-ordering rules, dual-write responsibility, locking primitive, and reconciliation rules. All implementation work in this plan builds against these contracts.

Phase 8 (Task 66) replaces this skeleton with narrative prose, examples, and cross-references. The normative content below is complete from the start.

---

## Related Documentation

- [`architecture.md`](./architecture.md) — Option B rationale, native-team-vs-orchestrator separation, cross-session lifetime model (forthcoming, Task 3 / Task 65)
- [`routing.md`](./routing.md) — Discovery procedure, required-reviewer-set computation, routing mode semantics (forthcoming)
- [`recovery.md`](./recovery.md) — FR-MMT24 per-task fallback, stale-pool cleanup, partial-dedup entry point (forthcoming)
- [`standing-pools.md`](../../plugins/synthex-plus/docs/standing-pools.md) — User-facing design doc (forthcoming, NFR-MMT8)

---

## 1. Pool `config.json` Schema

### 1.1 Normative Schema (FR-MMT7)

Every standing pool writes its configuration at spawn time to `~/.claude/teams/standing/<name>/config.json`. This file is the canonical source of truth for pool state. It is NOT re-read from `.synthex-plus/config.yaml` after spawn — config drift is prevented by design.

```json
{
  "name": "review-pool",
  "standing": true,
  "reviewers": ["code-reviewer", "security-reviewer"],
  "multi_model": false,
  "ttl_minutes": 60,
  "spawn_timestamp": "2026-04-25T14:32:11Z",
  "host_pid": 12345,
  "host_session_id": "<opaque>",
  "last_active_at": "2026-04-25T14:32:11Z",
  "pool_state": "idle"
}
```

### 1.2 Field Semantics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Pool name. Matches the `<name>` directory component in `~/.claude/teams/standing/<name>/`. Must satisfy regex `^[a-z0-9][a-z0-9-]{0,47}$`. |
| `standing` | boolean | Yes | Always `true` for standing pools. Presence of this field (with value `true`) is what distinguishes a standing pool from a per-invocation team in storage. |
| `reviewers` | string[] | Yes | Ordered list of Synthex reviewer agent names (e.g., `code-reviewer`, `security-reviewer`). Fixed at spawn time; changing the roster requires stop + recreate. |
| `multi_model` | boolean | Yes | Whether the multi-model orchestrator (Feature A) is enabled on this pool. Defaults to `standing_pools.default_multi_model` at spawn; immutable after spawn. |
| `ttl_minutes` | integer | Yes | Idle-time threshold (minutes) after which this pool is eligible for lazy TTL cleanup. `0` means no TTL (pool only terminates on manual stop or host-level event). Non-negative integer. |
| `spawn_timestamp` | string | Yes | ISO-8601 UTC timestamp at which `/synthex-plus:start-review-team` completed the spawn. Set once at spawn; never updated. |
| `host_pid` | integer | Yes | PID of the Claude Code host process that spawned the pool. Used by stale-pool detection (FR-MMT22) to check whether the host process is still alive. |
| `host_session_id` | string | Yes | Opaque session identifier of the spawning Claude Code session. Used alongside `host_pid` for cross-session lifetime tracking. |
| `last_active_at` | string | Yes | ISO-8601 UTC timestamp of the most recent task claim or task-list state change. Updated by Pool Lead on each task claim, and by the TeammateIdle hook on each idle event using max-semantics (see §4). Used by lazy TTL discovery (FR-MMT13) and stale-pool detection (FR-MMT22). |
| `pool_state` | string | Yes | One of `idle`, `active`, `draining`, `stopping`. See §3 for state machine. Updated by Pool Lead on each state transition; denormalized into `index.json` on every write (see §5). |

### 1.3 FR-MMT7 Acceptance Criteria

- All four flags (`--name`, `--reviewers`, `--multi-model`, `--ttl`) work and override the corresponding `standing_pools.*` setting for that invocation.
- The pool's `config.json` records its effective configuration (resolved at spawn) for inspection by `/list-teams` and routing-discovery checks.
- The pool's `config.json` includes a `pool_state` field, initialized to `idle` at spawn time, updated on state transitions.
- The pool's `config.json` includes a `last_active_at` field, updated atomically on each task claim and on each transition to `idle`.
- Editing `.synthex-plus/config.yaml` after a pool is running has no effect on the running pool — only on subsequently-spawned pools.

---

## 2. Index Entry Schema

### 2.1 Normative Schema (FR-MMT9b)

`~/.claude/teams/standing/index.json` is the discovery source of truth for FR-MMT15 routing and FR-MMT22 stale-pool detection. Discovery reads only this file during the filter step — no per-pool `config.json` reads required, meeting NFR-MMT3 (< 100 ms discovery for up to 10 pools).

```json
{
  "pools": [
    {
      "name": "review-pool",
      "pool_state": "idle",
      "last_active_at": "2026-04-25T14:32:11Z",
      "metadata_dir": "~/.claude/teams/standing/review-pool"
    }
  ]
}
```

### 2.2 Denormalized Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | The pool name. Matches the `name` field in the pool's `config.json`. |
| `pool_state` | string | Yes | Denormalized from the pool's `config.json.pool_state`. One of `idle`, `active`, `draining`, `stopping`. |
| `last_active_at` | string | Yes | Denormalized from the pool's `config.json.last_active_at`. ISO-8601 UTC. |
| `metadata_dir` | string | Yes | Absolute path to the pool's metadata directory (`~/.claude/teams/standing/<name>`). |

### 2.3 Why These Fields Are Denormalized

FR-MMT15 discovery filters on `pool_state` (skip `draining` / `stopping`) and `last_active_at` (TTL check). FR-MMT22 stale-pool cleanup filters on the same two fields. Without denormalization, every discovery operation would have to read each pool's `config.json` in addition to `index.json` — an extra N filesystem reads per discovery, breaking NFR-MMT3's "discovery completes in < 100 ms for up to 10 pools" target on slow filesystems. Denormalization keeps discovery to a single read.

### 2.4 Reconciliation Rule

`config.json` is canonical. `index.json` is the cache.

If `index.json` and a pool's `config.json` disagree on `pool_state` or `last_active_at`, the pool's `config.json` is treated as the source of truth and the index entry is updated to match on the next discovery operation that encounters the disagreement. Discovery implementations must be prepared to reconcile stale index entries rather than treating index disagreements as fatal errors.

### 2.5 FR-MMT9b Acceptance Criteria

- `index.json` entries conform to the schema above; Layer 1 schema test validates each entry.
- Pool Lead writes both `config.json` and `index.json` on every state transition and every `last_active_at` update.
- Discovery operations (FR-MMT15, FR-MMT22) read only `index.json` for filtering — no per-pool `config.json` reads required for the filter step.
- If `index.json` and a pool's `config.json` disagree on `pool_state` or `last_active_at`, the pool's `config.json` is treated as canonical and the index is updated to match on next discovery.

---

## 3. Pool State Machine

### 3.1 States

| State | Description |
|-------|-------------|
| `idle` | No tasks pending or in-progress. Available for routing. Task list is empty; Pool Lead is waiting. |
| `active` | One or more tasks pending or in-progress. Available for routing. Pool Lead is coordinating task execution. |
| `draining` | Completing in-flight tasks before shutdown; not accepting new submissions. Entered when TTL fires with in-flight tasks, or when `/stop-review-team` is received while tasks are in-progress. |
| `stopping` | Shutdown signal sent, in-flight tasks complete, awaiting final confirmation before exit. Not routing-eligible. The pool will disappear from `/list-teams` shortly after entering this state. |
| `removed` | Terminal state. Pool metadata and index entry deleted. Not a value stored in `config.json` — it represents the pool's absence from storage entirely. |

### 3.2 Transitions

```
idle ↔ active              # Task claim (idle → active); last task completes (active → idle)
idle → draining            # TTL fires with no in-flight tasks; /stop-review-team received
active → draining          # TTL fires while tasks are in-progress (FR-MMT14)
draining → stopping        # All in-flight tasks complete (or stuck-task timeout fires)
stopping → removed         # Pool Lead exits; metadata directory and index entry deleted
```

| Transition | Trigger | Writer |
|------------|---------|--------|
| `idle → active` | Pool Lead claims a task from the task list | Pool Lead |
| `active → idle` | Last in-progress task completes, task list empty | Pool Lead |
| `idle → draining` | TTL elapsed (FR-MMT13) and no in-flight tasks, OR `/stop-review-team` with no in-flight tasks | Pool Lead (on receiving shutdown message) |
| `active → draining` | TTL elapsed (FR-MMT13) while tasks are in-progress (FR-MMT14), OR `/stop-review-team` with in-flight tasks | Pool Lead (on receiving shutdown message) |
| `draining → stopping` | All in-flight tasks complete, OR `lifecycle.stuck_task_timeout_minutes` exceeded | Pool Lead |
| `stopping → removed` | Pool Lead exits; discovery reconciles by deleting stale index entry | Pool Lead / FR-MMT22 cleanup |

### 3.3 Routing Eligibility by State

| State | Routing eligible? | Notes |
|-------|-------------------|-------|
| `idle` | Yes | Standard case for a pool with no current work |
| `active` | Yes | Pool accepts additional tasks while in-progress tasks run |
| `draining` | No | Submitting commands fall back per FR-MMT17 routing mode |
| `stopping` | No | Pool is exiting; submitting commands fall back per FR-MMT17 routing mode |

---

## 4. Writer-Ordering Rules for `last_active_at`

### 4.1 Max-Semantics (FR-MMT12)

Two writers update `last_active_at` on a standing pool concurrently:

1. **Pool Lead** — on every task claim (transition from `idle` → `active`).
2. **TeammateIdle hook** — on every idle event observed for a pool teammate.

To keep the timestamp monotonic and correct regardless of write interleaving, both writers use **`take max(existing, new)` semantics**: read the current `last_active_at` from `config.json`, compare against the writer's own proposed timestamp, and write the larger of the two. A Pool-Lead-observed task claim never gets clobbered by a slightly-earlier idle-hook timestamp landing later, and vice versa.

The atomic write pattern is the same as elsewhere: write to `config.json.tmp`, then `rename` to `config.json`.

### 4.2 FR-MMT12 Writer-Ordering Rules (Verbatim)

> Two writers update `last_active_at` on a standing pool:
> - The Pool Lead, on every task claim (transition from `idle` → `active`).
> - The TeammateIdle hook, on every idle event observed for a pool teammate.
>
> To keep the timestamp monotonic and correct regardless of write interleaving, both writers use **`take max(existing, new)` semantics**: read the current `last_active_at` from `config.json`, compare against the writer's own proposed timestamp, and write the larger of the two. A Pool-Lead-observed task claim never gets clobbered by a slightly-earlier idle-hook timestamp landing later, and vice versa. The atomic write pattern is the same as elsewhere (`config.json.tmp` + `rename`).

### 4.3 FR-MMT12 Acceptance Criteria

- The TeammateIdle hook reads the `standing` flag from team config and branches behavior.
- Standing pool teammates remain spawned even when their task list is empty for indefinite durations.
- `last_active_at` is updated on each idle event, allowing the TTL watcher to compute idle time accurately.
- Both Pool Lead writes and TeammateIdle hook writes use `max(existing, new)` semantics — `last_active_at` is monotonically non-decreasing under any write interleaving.

---

## 5. Dual-Write Pool-Lead Responsibility

### 5.1 Write Protocol (FR-MMT9b)

On every state transition (`idle ↔ active`, `* → draining`, `* → stopping`) AND on every `last_active_at` update, the Pool Lead writes BOTH:

1. **The pool's own `config.json` (canonical):** write to `~/.claude/teams/standing/<name>/config.json.tmp`, then `rename` to `~/.claude/teams/standing/<name>/config.json`.
2. **The corresponding entry in `index.json` (cache):** acquire `.index.lock` per the locking primitive (§6), write to `~/.claude/teams/standing/.index.json.tmp`, then `rename` to `~/.claude/teams/standing/index.json`, then release the lock.

### 5.2 Crash Safety

The dual-write is sequenced config.json first, index.json second. If the Pool Lead crashes between the two writes:

- The pool's own `config.json` has the correct state (canonical).
- `index.json` may lag by one write — it holds a stale value.
- The next discovery operation will read `index.json` (stale) and then confirm by reading `config.json` (canonical), reconciling the index to match.

This ordering ensures the system never has a situation where `index.json` has a state that `config.json` does not agree with in the authoritative direction — the config file is always equal or more recent than the index.

---

## 6. Locking Primitive

### Locking primitive

**Mechanism:** Cross-session locking uses `mkdir`-based atomic directory creation — the only POSIX-atomic primitive available through Claude Code's Bash tool without runtime code.

**Acquire:** `mkdir ~/.claude/teams/standing/.index.lock`

POSIX guarantees that `mkdir` is atomic: exactly one caller succeeds; all others receive a non-zero exit code when the directory already exists. A non-zero exit on `mkdir` indicates contention — the lock is held by another process.

**Release:** `rmdir ~/.claude/teams/standing/.index.lock`

**Wait timeout:** If acquisition fails (directory exists), wait up to **10 seconds** with **100 ms polling** between retries. If the lock is still held after 10 seconds, abort with the following verbatim error message:

> `"Standing pool index is locked by another process. Wait a moment and retry, or — if a previous command crashed — remove the stale lock: rmdir ~/.claude/teams/standing/.index.lock"`

**Stale lock handling:** If a process crashes while holding the lock, the `.index.lock` directory remains. The error message above gives users the actionable manual cleanup command. There is no automatic stale-lock detection in v1 (no PID file, no wall-clock age check) — the 10-second wait catches most transient contention; stale locks require manual intervention.

**Call sites:** This locking primitive is used by:
- **Phase 5 commands** — `/synthex-plus:start-review-team` (step 6, wrapping steps 7–8), `/synthex-plus:stop-review-team` (step 5)
- **Phase 6 Pool-Lead writes (Task 27)** — every Pool Lead `index.json` dual-write, including state transitions and `last_active_at` updates

**Task 25 Acceptance Criteria:**
- `mkdir`/`rmdir` atomic semantics documented above.
- Verbatim stale-lock cleanup error message present (see above).
- 10-second timeout and 100 ms polling cadence documented above.

# Scenario: Pool Lead Draining State Transition

## Overview

This scenario validates the Pool Lead's draining state transition lifecycle (FR-MMT14). It covers the sequence from an active pool with an in-flight task through TTL expiration, drain window behavior, task completion, and final cleanup.

Submitter-side rejection during the drain window is covered separately in Task 30b.

## Scenario Narrative

1. **Spawn**: A standing pool named `review-pool` starts in the `idle` state with `ttl_minutes: 30`. No tasks are in-flight.

2. **Task claimed**: The Pool Lead claims a task (`task-001`), transitioning the pool to `active`. The Pool Lead writes both `config.json` and `index.json` atomically (config first, index second per crash-safety ordering).

3. **TTL fires while task in-flight**: 30 minutes of idle time elapses. The Pool Lead detects TTL expiration via the lazy TTL watcher (FR-MMT13). Because `task-001` is still in-progress, the pool cannot shut down immediately. The Pool Lead transitions to `draining` (FR-MMT14: `active → draining`). Dual-write ordering: `config.json` written first, `index.json` second. If a crash occurs between the two writes, the config holds the authoritative `draining` state; the index lags one write and is reconciled on next discovery.

4. **New task rejected during drain window**: A new task (`task-002`) is submitted during the drain window. The Pool Lead is in `draining` state and does NOT claim `task-002`. The task remains unowned (no `owner` field). The pool stays in `draining` state. The submitter falls back per FR-MMT17 routing mode (covered in Task 30b).

5. **In-flight task completes**: `task-001` transitions to `completed`. The Pool Lead observes that no more in-flight tasks remain. With zero in-flight tasks and the drain condition satisfied, the pool transitions `draining → stopping`.

6. **Stopping**: The Pool Lead writes `pool_state: "stopping"` to both `config.json` and `index.json`. The pool is no longer routing-eligible.

7. **Removed**: The Pool Lead exits. The pool's metadata directory and `index.json` entry are deleted. The pool is absent from `index.json` (empty `pools` array or entry removed). FR-MMT22 stale-pool cleanup reconciles any residual index state.

## State Transitions Demonstrated

```
idle → active          (task-001 claimed)
active → draining      (TTL fires while task-001 in-progress; FR-MMT14)
draining stays         (task-002 arrives; Pool Lead refuses to claim it)
draining → stopping    (task-001 completes; no more in-flight work)
stopping → removed     (Pool Lead exits; index entry deleted)
```

## Crash-Safety Ordering

Per §5.2 of pool-lifecycle.md, all state-transition dual-writes sequence `config.json` first, `index.json` second. A crash between the two leaves `config.json` authoritative and `index.json` one write behind. Discovery reconciles the stale entry. This ordering ensures `index.json` never holds a state that `config.json` does not agree with in the authoritative direction.

## Stuck-Task Timeout

If `task-001` had not completed within `lifecycle.stuck_task_timeout_minutes`, the Pool Lead would have transitioned `draining → stopping` anyway (stuck-task timeout fires). This scenario uses the happy path where the in-flight task completes naturally.

## FR References

- **FR-MMT13**: Lazy TTL watcher — idle time threshold triggers drain/stop
- **FR-MMT14**: `active → draining` when TTL fires with in-flight tasks
- **FR-MMT15**: Routing skips `draining` and `stopping` pools
- **FR-MMT17**: Submitter falls back when pool is not routing-eligible
- **FR-MMT22**: Stale-pool cleanup reconciles orphaned index entries

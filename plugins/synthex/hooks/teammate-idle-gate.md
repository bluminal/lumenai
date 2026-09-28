# TeammateIdle Work Assignment Gate (FR-HM23)

> Script doc for the `TeammateIdle` command hook. See [`task-completed-gate.md`](task-completed-gate.md) for why `TaskCompleted` and `TeammateIdle` support only command hooks (exit 2 to block), never a prompt-type hook. This file documents what the script does; it is not itself read or interpreted as behavioral logic.

- Shell entry point: [`plugins/synthex/scripts/teammate-idle-gate.sh`](../scripts/teammate-idle-gate.sh) — the matching/dependency logic and payload contract live in that script's header and body, not here.
- Hook registration: `plugins/synthex/hooks/hooks.json` (event: `TeammateIdle`)
- Config: `hooks.teammate_idle.work_assignment.enabled` (default `true`) and `.allow_cross_functional` (default `false`), gated by `standing_pools.enabled` (default `false`) — see `config/defaults.yaml`. Falls back to the legacy `.synthex-plus/config.yaml` for one major version (D6), printing a deprecation warning when a value only resolves there.

## What it does

On each idle teammate, the script first checks the payload's `standing` field: a standing-pool teammate always allows idle (exit 0) and nothing else runs — its lifecycle (including `last_active_at` maintenance) is the Pool Lead's responsibility, per the "Standing Pool Lifecycle Overlay" in `templates/review.md`. This mirrors the standing-pool exemption from one-team-per-session accounting (FR-MMT26): a standing team's lifecycle is never governed by per-idle-event bookkeeping.

For a non-standing teammate, the script filters the payload's `pending_tasks` to those matching the teammate's role and not blocked, and picks the lowest task id (matching the original hook's priority rule). If none match and `allow_cross_functional` is `true`, it falls back to any unblocked task regardless of role. If a task is found, the script blocks (exit 2) and names it on stderr; the calling agent performs the actual `TaskUpdate` and mailbox notification. The script does not read the shared task list itself — `pending_tasks` is the caller's own computation, passed in the hook payload.

**Loop safety net:** a block is only safe if the calling agent actually assigns the named task before the teammate goes idle again. If it can't — the assignment fails, or a caller ignores the instruction and re-polls with the same unchanged `pending_tasks` — the same task id would otherwise be re-suggested and re-blocked forever, the same structural bug `task-completed-gate.sh` had before its fix (see that doc). This script applies the same fix: the first time it would block on a given task id, it records that under `.synthex/tmp/idle-gate/<task_id>`; if that exact task id is still the top match on a later idle event, the second block is skipped (allow idle instead). This only stops the specific stuck id from recurring — a *different* matching task is still offered normally. As with `task-completed-gate.sh`, an unwritable marker directory fails open (allows) rather than risk the same deadlock from the other direction.

## Exit codes

| Exit code | Meaning | When |
|-----------|---------|------|
| 0 | Allow idle | `standing_pools.enabled` is not `true`, work assignment is disabled, no Synthex config exists in the project, `node` is unavailable, the payload is unparseable, the teammate belongs to a standing pool, no matching unblocked task exists, this exact task id was already suggested once before, or the idle-gate marker directory is unwritable |
| 2 | Keep working | A matching (or, with `allow_cross_functional`, any) unblocked task was found for the first time; it is printed on stderr |

## What changed from the prose-mediated version

The original `hooks/teammate-idle-gate.md` (still current in synthex-plus) described reading `~/.claude/teams/<team>/config.json` directly, dual-writing `last_active_at` with lock files, and sending mailbox notifications — all actions requiring tool calls a command hook cannot make (it fires with no model turn attached). This script keeps the matching/priority/dependency logic as deterministic code over a payload the caller assembles, and drops the direct state-file writes and mailbox I/O; those remain the calling agent's job, guided by the block reason.

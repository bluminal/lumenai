# TeammateIdle Work Assignment Gate (FR-HM23)

> Script doc for the `TeammateIdle` command hook. See [`task-completed-gate.md`](task-completed-gate.md) for why `TaskCompleted` and `TeammateIdle` support only command hooks (exit 2 to block), never a prompt-type hook. This file documents what the script does; it is not itself read or interpreted as behavioral logic.

- Shell entry point: [`plugins/synthex/scripts/teammate-idle-gate.sh`](../scripts/teammate-idle-gate.sh) — the matching/dependency logic and payload contract live in that script's header and body, not here.
- Hook registration: `plugins/synthex/hooks/hooks.json` (event: `TeammateIdle`)
- Config: `hooks.teammate_idle.work_assignment.enabled` (default `true`) and `.allow_cross_functional` (default `false`), gated by `standing_pools.enabled` (default `false`) — see `config/defaults.yaml`. Falls back to the legacy `.synthex-plus/config.yaml` for one major version (D6), printing a deprecation warning when a value only resolves there.

## What it does

On each idle teammate, the script first checks the payload's `standing` field: a standing-pool teammate always allows idle (exit 0) and nothing else runs — its lifecycle (including `last_active_at` maintenance) is the Pool Lead's responsibility, per the "Standing Pool Lifecycle Overlay" in `templates/review.md`. This mirrors the standing-pool exemption from one-team-per-session accounting (FR-MMT26): a standing team's lifecycle is never governed by per-idle-event bookkeeping.

For a non-standing teammate, the script filters the payload's `pending_tasks` to those matching the teammate's role and not blocked, and picks the lowest task id (matching the original hook's priority rule). If none match and `allow_cross_functional` is `true`, it falls back to any unblocked task regardless of role. If a task is found, the script blocks (exit 2) and names it on stderr; the calling agent performs the actual `TaskUpdate` and mailbox notification. The script does not read the shared task list itself — `pending_tasks` is the caller's own computation, passed in the hook payload.

## Exit codes

| Exit code | Meaning | When |
|-----------|---------|------|
| 0 | Allow idle | `standing_pools.enabled` is not `true`, work assignment is disabled, no Synthex config exists in the project, `node` is unavailable, the payload is unparseable, the teammate belongs to a standing pool, or no matching unblocked task exists |
| 2 | Keep working | A matching (or, with `allow_cross_functional`, any) unblocked task was found; it is printed on stderr |

## What changed from the prose-mediated version

The original `hooks/teammate-idle-gate.md` (still current in synthex-plus) described reading `~/.claude/teams/<team>/config.json` directly, dual-writing `last_active_at` with lock files, and sending mailbox notifications — all actions requiring tool calls a command hook cannot make (it fires with no model turn attached). This script keeps the matching/priority/dependency logic as deterministic code over a payload the caller assembles, and drops the direct state-file writes and mailbox I/O; those remain the calling agent's job, guided by the block reason.

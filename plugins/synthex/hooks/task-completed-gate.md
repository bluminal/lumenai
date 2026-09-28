# TaskCompleted Review Gate (FR-HM23)

> Script doc for the `TaskCompleted` command hook. `TaskCompleted` and `TeammateIdle` are Claude-only Agent Teams events that fire outside any model turn, so they support only command hooks (exit 2 to block) — there is no prompt-type hook on these events. This file documents what the script does; it is not itself read or interpreted as behavioral logic.

- Shell entry point: [`plugins/synthex/scripts/task-completed-gate.sh`](../scripts/task-completed-gate.sh) — the classification table, reviewer-routing table, and payload contract all live in that script's header and body, not here.
- Hook registration: `plugins/synthex/hooks/hooks.json` (event: `TaskCompleted`)
- Config: `hooks.task_completed.review_gate.enabled` (default `true`), gated by `standing_pools.enabled` (default `false`) — see `config/defaults.yaml`. Falls back to the legacy `.synthex-plus/config.yaml` for one major version (D6), printing a deprecation warning when a value only resolves there.

## What it does

On each completed task, the script classifies the touched files into a work type (infrastructure, frontend, test, code, or documentation) using the same priority-ordered extension/path rules as synthex-plus's original hook, then either allows the completion (documentation-only changes, or the gate is off/unconfigured) or blocks it with a stderr message naming the reviewers that work type requires. The script cannot invoke those reviewers itself — a command hook has no model turn to spend — so blocking is the mechanism that forces the calling agent to route to them before re-marking the task complete.

## Exit codes

| Exit code | Meaning | When |
|-----------|---------|------|
| 0 | Allow completion | `standing_pools.enabled` is not `true`, the review gate is disabled, no Synthex config exists in the project, `node` is unavailable, the payload is unparseable, or the classified work type is `documentation` |
| 2 | Block completion | A non-documentation work type was classified; the required reviewers are printed on stderr |

## What changed from the prose-mediated version

The original `hooks/task-completed-gate.md` (still current in synthex-plus) described a full review-and-verdict cycle: invoke reviewers as subagents, wait for `PASS`/`WARN`/`FAIL`, and reopen the task with findings on `FAIL`. A command hook cannot run that cycle — it fires with no model turn attached, so it cannot call reviewer subagents or wait for their output. This script keeps the classification and routing half (which reviewers a given work type needs) as deterministic code, and drops the verdict-evaluation half (`auto_reopen_on_fail`); getting the review done, and deciding what its verdict means, remains the calling agent's job once it sees the block reason.

# TaskCompleted Review Gate (FR-HM23)

> Script doc for the `TaskCompleted` command hook. `TaskCompleted` and `TeammateIdle` are Claude-only Agent Teams events that fire outside any model turn, so they support only command hooks (exit 2 to block) — there is no prompt-type hook on these events. This file documents what the script does; it is not itself read or interpreted as behavioral logic.

- Shell entry point: [`plugins/synthex/scripts/task-completed-gate.sh`](../scripts/task-completed-gate.sh) — the classification table, reviewer-routing table, and payload contract all live in that script's header and body, not here.
- Hook registration: `plugins/synthex/hooks/hooks.json` (event: `TaskCompleted`)
- Config: `hooks.task_completed.review_gate.enabled` (default `true`), gated by `standing_pools.enabled` (default `false`) — see `config/defaults.yaml`. Falls back to the legacy `.synthex-plus/config.yaml` for one major version (D6), printing a deprecation warning when a value only resolves there.

## What it does

On each completed task, the script classifies the touched files into a work type (infrastructure, frontend, test, code, or documentation) using the same priority-ordered extension/path rules as synthex-plus's original hook. A documentation-only change always allows. Anything else blocks — **unless the completion payload's free text already carries a recorded verdict**: write `Review verdict: PASS` or `Review verdict: WARN` (case-insensitive) into the completion note (or the task description) once the named reviewers have looked at the work, and re-marking the task complete allows through. `Review verdict: FAIL` keeps blocking, naming the same reviewers again, until the note is updated to `PASS` or `WARN`.

The script cannot invoke those reviewers itself, or evaluate their output — a command hook has no model turn to spend — so the block message is the whole mechanism: it names the reviewers, and tells the calling agent exactly what to write (`Review verdict: PASS|WARN`) before retrying. **Without that marker, the gate would block every single completion attempt forever, including the re-mark after review actually happened** — that was a real bug in the first version of this script, fixed by the verdict-marker check above and, as a second line of defense, a once-per-task safety net: the first time a given task id blocks with no verdict marker, the script records it under `.synthex/tmp/task-gate/<task_id>`; a second completion attempt for that same id is allowed through even without a marker, so a teammate that never learns the marker convention is nagged once, not deadlocked. If `.synthex/tmp/` cannot be written to, the gate fails open (allows) instead of risking that same deadlock from an unwritable marker directory. A payload with no task id at all cannot be tracked this way, so only the verdict marker can unblock it — the block message says so explicitly in that case.

## Exit codes

| Exit code | Meaning | When |
|-----------|---------|------|
| 0 | Allow completion | `standing_pools.enabled` is not `true`, the review gate is disabled, no Synthex config exists in the project, `node` is unavailable, the payload is unparseable, the classified work type is `documentation`, a `PASS`/`WARN` verdict marker is present, this task id already blocked once before with no marker, or the task-gate marker directory is unwritable |
| 2 | Block completion | A non-documentation work type with no `PASS`/`WARN` marker (first attempt for this task id), or an explicit `FAIL` marker; the required reviewers and the verdict-marker instructions are printed on stderr |

## What changed from the prose-mediated version

The original `hooks/task-completed-gate.md` (still current in synthex-plus) described a full review-and-verdict cycle: invoke reviewers as subagents, wait for `PASS`/`WARN`/`FAIL`, and reopen the task with findings on `FAIL`. A command hook cannot run that cycle — it fires with no model turn attached, so it cannot call reviewer subagents or wait for their output, and it has no memory of a prior invocation's outcome beyond what the caller writes back into the payload. This script keeps the classification and routing half (which reviewers a given work type needs) as deterministic code, and replaces the subagent-driven verdict cycle with a text convention the calling agent writes into the completion note (`Review verdict: PASS|WARN|FAIL`) plus the once-per-task fallback above; `auto_reopen_on_fail` from the synthex-plus version has no equivalent here since a blocked completion is never a task list write this script performs.

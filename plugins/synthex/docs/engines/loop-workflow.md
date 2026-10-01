# Loop Engine Protocol (FR-HM19 Stage 2)

Claude Code only; a `--loop` command's engine selector loads this (D34). `L` = `bash "${CLAUDE_PLUGIN_ROOT}/scripts/loop-step.sh"`, plugin root resolved as in the command. Never write the completion promise here; end the loop with `L finish`. Headless runs need a `Workflow(synthex:loop-engine)` allow rule (D31).

Start once: `L begin /synthex:<command> --args '<verbatim>' --max <n> [--name <slug>] [--completion-promise <text>] --session-id "$CLAUDE_CODE_SESSION_ID"`, or `--resume <id>` (`/synthex:loop` keeps its own begin step).

Each iteration:

1. **Lease.** next-priority: `L advance <id> --run`. Others: `L advance <id>`, run the iteration body as Stage 1 does (no promise), summarize it in at most 1,500 characters (what changed, what remains, what the user accepted or must decide), then `L hold <id> --run`. The lease prints `run-id: R`; on any non-zero exit print stderr and stop.
2. **Launch** `Workflow` `synthex:loop-engine` with args `{runId: R, loopId, command}` (`command` without the slash prefix) plus: next-priority `planPath`, `concurrentTasks`; refine-requirements `requirementsPath`, `summary`; write-implementation-plan `planPath`, `requirementsPath`, `summary`; review-code `report` (this iteration's Code Review Report), `summary`; loop `prompt` or `promptFile`, `summary`. If refused or failed: `L hold <id>`, print `Loop engine unavailable; continuing on the prose path.`, then `fallback`.
3. **Wait.** End the turn: `Waiting for loop verdict R.` The Stop gate stays silent while `runId` is fresh (900 s).
4. **Resume.** Ignore a result whose `runId` is not R (the state file's `runId`). Otherwise `L hold <id>` (non-zero: stop). A failed or killed run is `fallback`.
5. **Act** on `action`:
   - `finish`: `L finish <id> completed <reason>`, print `verdict.summary`, stop.
   - `work`: next-priority runs §2–§9 for `tasks` only (skip §1; Read and Edit the plan at each task's `line`, Grep if moved; pass `description` and `criteria` verbatim; ask `blocked_on_human` at §7), then if `exit_on_milestone_complete` is true and every `milestone_remaining` id is `done`, `L finish <id> completed milestone-complete` and stop. Then start the next iteration.
   - `ask`: `AskUserQuestion` with `blocked_on_human`; record the answers as the workflow records decisions; `L hold <id>`; next iteration. A deferral is `idle`.
   - `idle`: print one line; run `loop-idle-wait.sh <id> <watch paths>` (Bash `timeout: 600000`; watch the plan, the PRD, the reviewed files, or the files the prompt waits on); `L hold <id>`. On `timeout` with watch paths: `L advance <id>` (non-zero: stop) and idle again, with no body and no `Workflow` call. Otherwise: next iteration.
   - `fallback`: use the Stage 1 prose for the rest of the loop, resuming this iteration after its `advance` (next-priority: Read `${CLAUDE_PLUGIN_ROOT}/docs/next-priority-loop.md`).

Cancel is re-read at every `advance` and `hold`; an in-flight run is discarded. next-priority sees plan completion one `advance` after Stage 1 would.

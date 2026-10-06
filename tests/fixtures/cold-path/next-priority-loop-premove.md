When running under `--loop`, this is the primary emission condition — emit the completion promise per [Emission Point](#emission-point) below.
<!-- premove-block -->
Under `--loop`, keep this report to one line and run the [idle wait](#idle-iterations-wait-in-turn) before the next iteration — the user may be completing manual tasks or `[H]` reviews in a separate thread, which will unblock work for the next pass.
<!-- premove-block -->
After updating the plan, if running under `--loop`, check the [Emission Point](#emission-point) conditions:

1. If every task across all milestones and phases now has status `done`, emit `<promise>{completion_promise}</promise>` (literal XML tags required).
2. Otherwise, if `exit_on_milestone_complete` is `true` and all tasks in the **current milestone** are now `done`, emit `<promise>{completion_promise}</promise>`.

If neither condition is met, the loop continues on the next iteration.
<!-- premove-block -->
### Imperative Loop Protocol (read FIRST when `--loop` is set)

If your invocation includes `--loop`, you are NOT running this command once. You are running it inside a **self-driven shared-context loop** (D-NL1). The harness does **not** re-invoke you between iterations — you re-enter the workflow yourself, in the same turn, until you emit the completion promise or hit `--max-iterations`. This subsection is the authoritative checklist; the prose in the rest of "Native Looping" describes the framework, this section tells you what to do.

#### For every iteration, in order

FR-HM18: step 1 is now ONE Bash call, `plugins/synthex/scripts/loop-step.sh advance <loop-id>` (resolved from the installed plugin root, same as the idle-wait script below). It performs the boundary check, the increment, and the atomic persist, then prints the marker on exit 0 — the old three-step breakdown is now internal to that single call.

1. **Advance — one Bash call, the durability boundary.** Run `loop-step.sh advance <loop-id>`. On exit 0, its stdout IS the iteration marker `[loop <loop-id> iteration <N>/<max>]` (visibility for the user — survives auto-compaction) — print it and continue. On any non-zero exit, STOP: print the script's stderr (`Loop "<loop-id>" is <status> — nothing to do.` for a cancelled/terminal loop, or the max_iterations resume hint) and exit. This call also catches cancellation and the max-iterations cap — no separate check is needed; a cancelled or exhausted loop simply makes this call fail.
2. **Execute Workflow §1–§9 below in full.** Use the implementation plan, worktrees, Tech Lead delegation, validation gates, and immediate merged-worktree cleanup — the entire body of this command runs **once per iteration**.
3. **Decide the iteration's exit.** At the END of the iteration's work, do one of:
   - **(A) Emit the promise** — `<promise>{completion_promise}</promise>` on its OWN line, only when the Emission Point conditions below hold, THEN run `loop-step.sh finish <loop-id> completed` (one Bash call — sets `status: "completed"`, `exit_reason: "completion-promise-emitted"`, `exited_at` atomically), exit.
   - **(B) Continue to the next iteration — in the SAME turn.** Re-enter step 1 without ending your turn and without an "## Iteration N — Complete" summary or a "want me to continue?" hand-off. Every turn-end fires Stop hooks: the [`loop-advance-gate`](../hooks/loop-advance-gate.md) recovers it (ADR-003), but each one prints a "Stop hook error" line and triggers "agent finished" notifications from other tools' Stop hooks (e.g. Orca). The gate is a safety net, not the loop driver. Do NOT emit the promise to escape; emit it only when the Emission Point conditions hold.
   - **(B′) Idle — wait in-turn, then continue.** If this iteration found no actionable tasks (and the plan is not complete), run the [idle wait](#idle-iterations-wait-in-turn), THEN run `loop-step.sh hold <loop-id>` (one Bash call — re-validates the loop is still `running` WITHOUT consuming an iteration; a decision-wait re-entry per D30) before re-entering step 1 in the same turn. On non-zero exit from `hold`, stop instead.
   - **(C) Await required input.** If an `[H]` acceptance criterion needs user approval, ask via `AskUserQuestion`. That releases the gate for this turn — it will not force-continue past a pending question.

#### State-file schema (v1) — inline reference

Write the state file with exactly these fields. The `status` enum is closed — do NOT invent values like `"loop_exhausted_no_promise"` or `"in_flight"`. Read `$CLAUDE_CODE_SESSION_ID` via Bash for `session_id` — the [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook only drives the loop when this matches the live session, so `null` leaves it permanently undriven (see [native-looping.md § Obtaining the session id](../docs/native-looping.md#obtaining-the-session-id)). `completion_promise` comes from `loop-step.sh begin`'s `completion promise: <value>` line, or from this file's own `completion_promise` field on resume — never recompute it, except the no-shell fallback below.

```json
{
  "schema_version": 1,
  "loop_id": "next-priority-<4-char-hex>",
  "session_id": "<value of $CLAUDE_CODE_SESSION_ID; null ONLY if empty>",
  "command": "/synthex:next-priority",
  "args": "<CLI args, verbatim>",
  "prompt_file": null,
  "completion_promise": "<--completion-promise if given, else default ALLDONE<session_id> (ALLDONE<loop_id> with no session id)>",
  "max_iterations": <int, default 20, max 200>,
  "iteration": <int, 0 on creation>,
  "isolation": "shared-context",
  "status": "running",
  "started_at": "<UTC ISO 8601>",
  "last_updated": "<UTC ISO 8601>",
  "exited_at": null,
  "exit_reason": null
}
```

`status ∈ {"running","completed","cancelled","max-iterations-reached","crashed"}` — exactly these five values, lowercase, hyphenated. See [`state`](../docs/native-looping.md#state) for full field-by-field semantics.

**No-shell fallback (FR-HM3):** on a host with no Bash tool, when writing this file directly (e.g. via the Write tool) and no `--completion-promise` was given, compute `completion_promise` the same way `loop-step.sh begin` does: `ALLDONE` + the session id, or `ALLDONE` + the loop id when no session id is available.

#### What ends the loop (only these)

- You emit `<promise>{completion_promise}</promise>` on its own line in the iteration's final response (Emission Point conditions met).
- `iteration >= max_iterations` after increment.
- Another session sets `status: "cancelled"` via `/synthex:cancel-loop <loop-id>` or `/synthex:cancel-loop --all`.

The [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook re-invokes you on a turn-end while the loop is still `running`, so ending a turn no longer breaks the loop (ADR-003) — but stay in-turn anyway (step 3B/B′); turn-ends are noisy. The gate bounds runaway with a progress-aware counter capped below Claude Code's 8-consecutive-block override — it relinquishes after a few no-progress turns — and steps aside for a pending `AskUserQuestion`. The one self-inflicted failure mode that remains is **emitting the completion promise before the Emission Point conditions hold**, which terminates the loop early.

#### Idle iterations (wait in-turn)

When an iteration finds nothing actionable, do NOT end the turn and do NOT re-run the workflow immediately. Print one line (e.g. `Idle: 3 tasks blocked on [H] review — waiting for plan changes.`), then run the idle-wait script `plugins/synthex/scripts/loop-idle-wait.sh` (resolved from the installed plugin root) as ONE foreground shell command with the tool's timeout set to at least 600 seconds (Claude Code: Bash with `timeout: 600000`):

```bash
# Claude Code
bash "${CLAUDE_PLUGIN_ROOT}/scripts/loop-idle-wait.sh" <loop-id> <implementation-plan-path>
```

On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

It blocks until the plan file changes, the loop leaves `running` (e.g. `/synthex:cancel-loop`), or a backoff limit elapses (60s → 120s → 300s → 540s over consecutive idle iterations; it tracks `idle_streak` in the state file itself). It prints one `idle-wait <loop-id>: <reason> …` line and always exits 0. Then run `loop-step.sh hold <loop-id>` (one Bash call — re-validates without consuming an iteration) and, on exit 0, continue with step 1 of the next iteration in the same turn. If the `loop-advance-gate` block reason (Claude Code only) gives an absolute path, prefer that. If your shell tool cannot allow 600s, prefix the command with `SYNTHEX_LOOP_IDLE_MAX=<your cap minus 30>`. If the script cannot be found or the host has no shell tool, continue to the next iteration without waiting — never end the turn instead. Hosts without the Stop hook (Codex, Grok, and others) have no gate to re-invoke you, so a turn-end there stops the loop.

### Emission Point

Emit `<promise>{completion_promise}</promise>` (the resolved `completion_promise`) in the iteration's final response when ANY of the following hold:

- Every task across all milestones and phases of the implementation plan has status `done`. This is the primary exit condition.
- `exit_on_milestone_complete` is `true` AND every task in the current milestone is `done` (milestone-boundary exit).

Do NOT emit the promise when no actionable tasks were picked up THIS iteration but unfinished work remains (e.g., `[H]` reviews pending, blocked tasks). The next iteration will pick up newly-unblocked work — emitting the promise would falsely terminate the loop.

#### Anti-pattern — never write the `<promise>` tag in prose

The promise tag is a **control signal**, not a discussion topic. Never write the literal string `<promise>` in:

- narrative text ("we should consider signalling `<promise>ALLDONE</promise>` next iteration"),
- table cells, status summaries, or "what I might do next" suggestions,
- thinking text or intermediate (non-final) responses,
- code fences or quoted examples *unless* you replace the tag characters (e.g., `&lt;promise&gt;`) so the literal regex cannot match.

The framework scans the iteration's final response with the literal regex `<promise>\s*<completion_promise_text>\s*</promise>` (see [`promise-emission`](../docs/native-looping.md#promise-emission)). Any in-prose reference is a landmine: depending on whitespace and quoting, the scan may or may not match, leading to **silent loop termination** mid-discussion or, worse, a contaminated state on the next iteration. If you need to refer to the tag conversationally, call it "the completion promise" — never the tag itself.

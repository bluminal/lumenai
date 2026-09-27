---
model: sonnet
---

# Loop a prompt natively

Run an arbitrary prompt iteratively in the same agent thread until the completion promise is emitted or `max_iterations` is reached. State is per-project in `.synthex/loops/<loop-id>.json`. Resumable across sessions.

The mechanical iteration framework — state-file schema, loop-id rules, shared-context vs. fresh-subagent iteration, auto-compaction guarantees, promise emission, iteration markers — is documented once in [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md). This command cross-references that document rather than duplicating the mechanics.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `--prompt <string>` | Literal prompt text to loop. Mutually exclusive with `--prompt-file`. | — | One of `--prompt` / `--prompt-file` / `--resume*` required |
| `--prompt-file <path>` | Path to a file whose contents become the prompt. Mutually exclusive with `--prompt`. | — | One of `--prompt` / `--prompt-file` / `--resume*` required |
| `--completion-promise <string>` | Literal text the agent emits inside `<promise>…</promise>` to terminate the loop. | — | Required unless `--resume` / `--resume-last` |
| `--max-iterations <int>` | Iteration cap. Hard ceiling is 200. | `20` | No |
| `--loop-isolated` | Spawn a fresh subagent per iteration (no shared context). See [`subagent-iter`](../docs/native-looping.md#subagent-iter). | off (shared-context default per [D-NL1](../docs/native-looping.md#shared-iter)) | No |
| `--name <slug>` | User-supplied loop-id (slug `^[a-z0-9][a-z0-9-]{0,63}$`). | auto: `loop-<4-char-hex>` | No |
| `--resume <loop-id>` | Resume a known loop. Re-uses persisted `--prompt`/`--prompt-file`/`--completion-promise`/`--max-iterations`. | — | No |
| `--resume-last` | Resume the most-recent running loop in this project (FR-NL27 selection rules). | — | No |

## Workflow (FR-HM18 — script-backed)

`plugins/synthex/scripts/loop-step.sh` now owns the state-file schema, loop-id assignment, the archive scan, and the per-iteration boundary check + counter + marker that this section used to spell out step by step. This command's own job shrinks to: validate the `--prompt`/`--prompt-file` argument shape (below — the two refusals the script does not know about, since it never sees prompt content), call `begin` once to resolve/create the loop-id, then call `advance` once per iteration and stop on any non-zero exit.

Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/loop-step.sh" ...`. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

### Prompt-source refusals (command-owned — not in the script)

Apply these **before** calling the script. Each prints a single-line error to stderr and exits non-zero:

- **No prompt source AND no resume** — refuse: `Pass --prompt, --prompt-file, --resume <loop-id>, or --resume-last.` (FR-NL37 generalization)
- **`--prompt` AND `--prompt-file` both supplied** — refuse: `--prompt and --prompt-file are mutually exclusive.` (FR-NL38)
- **`--prompt-file <path>` does not exist** — refuse: `Prompt file not found: <path>` (FR-NL39)
- **`--resume <loop-id>` AND a new prompt source supplied** (`--prompt`, `--prompt-file`, or any positional/extra arg) — refuse: `--resume re-uses the persisted prompt; do not pass --prompt or --prompt-file alongside --resume.` (E11)

### begin — resolve or create the loop (one Bash call)

Call `loop-step.sh begin /synthex:loop --completion-promise <text> --name <slug> --max <n> --args <verbatim CLI args> [--prompt-file <path>] [--isolation shared-context|subagent] --session-id <$CLAUDE_CODE_SESSION_ID>` for a fresh start, or `loop-step.sh begin /synthex:loop --resume <loop-id> --session-id <$CLAUDE_CODE_SESSION_ID> [--isolation ...]` to resume. Read `$CLAUDE_CODE_SESSION_ID` via Bash first (the gate matches on it; `null`/empty leaves the loop undriven — see [native-looping.md § Obtaining the session id](../docs/native-looping.md#obtaining-the-session-id)). On success it prints the resolved `loop-id` on stdout; remember it (re-derive from `.synthex/loops/` on compaction loss, never cache the state-file path itself). It also performs the archive scan as a side effect (D-NL10) — no separate step needed.

The remaining four refusal paths (FR-NL11, FR-NL41, FR-NL42, and the FR-NL37 completion-promise-required case) — plus FR-NL40's "no such loop" and the "already running" / "terminal, cannot resume" collision cases — are the script's own refusals; print its stderr verbatim and stop:

- **`--name <slug>` violates the loop-id pattern** — `Invalid --name "<slug>". Must match ^[a-z0-9][a-z0-9-]{0,63}$.`
- **`--max-iterations` > 200 OR < 1 OR non-integer** — `--max-iterations must be an integer in [1, 200]; got <value>.`
- **`--loop` (implicit here) without `--completion-promise`**, and no resume — `--completion-promise <text> is required when starting a new loop. Resume an existing loop with --resume <loop-id> or --resume-last.`
- **`--name <slug>` collides with an already-running loop** — `Loop "<slug>" is already running (iteration <N>/<M>). Use /synthex:loop --resume <slug> to continue or /synthex:cancel-loop <slug> to stop it.`
- **`--resume <loop-id>` unknown** (FR-NL40) — `No loop found: <slug>. Run /synthex:list-loops.`
- **`--resume <loop-id>` has an unrecognized `schema_version`** (FR-NL41) — names the mismatch and the delete-then-restart instructions.
- **`--resume <loop-id>` is terminal** — `Loop "<slug>" is <status>. Cannot resume a terminal loop. Start a new loop or pick a different one.`

For `--resume-last`: enumerate `.synthex/loops/*.json` yourself (exclude `.archive/`), filter `status == "running"`, and pick by FR-NL27 rules (session-id match preferred, then `last_updated` desc) — this selection logic has no dedicated subcommand since it is a read-only, project-wide policy choice, not a per-loop mutation. If none found, refuse: `No running loops in this project. /synthex:list-loops shows recent loops.` Print the chosen `loop-id`, then call `begin --resume <chosen-id>` as above.

### Iteration loop

Follow [`shared-iter`](../docs/native-looping.md#shared-iter) (shared-context, default) or [`subagent-iter`](../docs/native-looping.md#subagent-iter) (fresh-subagent, when `--loop-isolated` is set). Each iteration:

1. **Advance — one Bash call, the durability boundary (D-NL13).** Run `loop-step.sh advance <loop-id>`. On exit 0 its stdout IS the iteration marker `[loop <loop-id> iteration <N>/<max>]` (see [`markers`](../docs/native-looping.md#markers)) — print it, then continue to step 2. On any non-zero exit, STOP: print the script's stderr and exit. This single call replaces the old boundary-check + increment + marker-print steps, and it also catches cancellation and the max-iterations cap (no separate checks needed — a cancelled or exhausted loop simply makes the NEXT `advance` call fail).
2. **Execute the iteration's work.**
   - **Shared-context (`isolation == "shared-context"`)**: read the prompt (literal `--prompt` value or the contents of `--prompt-file`) and respond to it inline in this agent thread. Apply [`compaction-safety`](../docs/native-looping.md#compaction-safety) — persist any iteration work to disk artifacts, not to the conversation.
   - **Fresh-subagent (`isolation == "subagent"`)**: spawn a sub-agent via the Agent (Task) tool with the prompt content plus the `[loop iteration N/M]` framing. Wait for its final response. The sub-agent's output becomes this iteration's output.
3. **Promise detection.** Scan the iteration's final response for the literal regex `<promise>\s*<completion_promise_text>\s*</promise>` (where `<completion_promise_text>` is the persisted value). If matched: run `loop-step.sh finish <loop-id> completed` (one Bash call — sets `exit_reason: "completion-promise-emitted"`, `exited_at`, atomically), print `Loop "<loop-id>" completed at iteration <N>/<max>.`, exit. See [`promise-emission`](../docs/native-looping.md#promise-emission).
4. **Idle wait (only when the iteration had nothing to do).** If the prompt's work was a no-op this iteration — e.g. it is waiting on an external change — print one line, then run `plugins/synthex/scripts/loop-idle-wait.sh <loop-id> [watch-path …]` (same plugin-root resolution as above) as ONE foreground shell command with the tool's timeout set to at least 600 seconds (Claude Code: Bash `timeout: 600000`). If the host caps shell timeouts lower, prefix `SYNTHEX_LOOP_IDLE_MAX=<cap minus 30>`. Pass the files whose change would make the next iteration productive (the `--prompt-file`, a plan, a status file). It returns on change, on the loop leaving `running`, or after a backoff limit (60s → 120s → 300s → 540s). See [Idle iterations](../hooks/loop-advance-gate.md#idle-iterations). Then run `loop-step.sh hold <loop-id>` (one Bash call — re-validates the loop is still `running` WITHOUT consuming an iteration; a decision-wait re-entry per D30). On non-zero exit from `hold`, stop; on exit 0, re-enter step 1 in the same turn.
5. **Continue to the next iteration — in the SAME assistant turn.** Re-enter step 1 without ending your turn. If you do end your turn while the loop is still `running` and unfinished, the [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook re-invokes you for the next iteration — a turn-end is recovered, not fatal (ADR-003) — but every turn-end prints a "Stop hook error" line and triggers "agent finished" notifications from other tools' Stop hooks (e.g. Orca), so treat the gate as a safety net, not the driver. On hosts without the Stop hook (Codex, Grok, and others) there is no gate at all: a turn-end stops the loop. The one self-inflicted way to break the loop early is emitting the completion promise before the completion conditions hold; emit it only when you truly intend to terminate. To stop intentionally, emit the promise or run `/synthex:cancel-loop <loop-id>` (itself one Bash call to `loop-step.sh cancel`).

### Compaction-loss recovery (FR-NL25)

If during the loop you cannot recall the loop-id or the state-file path (e.g., the conversation was auto-compacted and the framing line is gone), recover by listing `.synthex/loops/` and choosing the file with `status: "running"` matching this command (`/synthex:loop`). If multiple match, exit with: `Multiple running /synthex:loop loops in this project. Resume explicitly with /synthex:loop --resume <loop-id>.` Do not guess. See [`compaction-safety`](../docs/native-looping.md#compaction-safety).

## Anti-patterns

- **Do NOT accumulate iteration state in the conversation.** All state lives in `.synthex/loops/<loop-id>.json`. The conversation may be auto-compacted at any time.
- **Do NOT cache the state-file path as a literal string in the conversation.** Always re-derive from the loop-id.
- **Do NOT emit `<promise>...</promise>` in thinking text or intermediate responses.** Emit only in the iteration's final response, only when you intend to terminate the loop.
- **Do NOT write the literal `<promise>` tag in prose, table cells, or "what I might do next" suggestions.** The promise is a control signal, not a discussion topic. The scan regex `<promise>\s*<completion_promise_text>\s*</promise>` does not distinguish narrative from intent — an in-prose mention can either terminate the loop accidentally or contaminate the next iteration. If you need to refer to it conversationally, call it "the completion promise"; if you must include the literal characters in a code fence or example, escape the angle brackets (`&lt;promise&gt;`) so the regex cannot match.
- **Do NOT emit the completion promise before the loop is actually done.** Ending a turn mid-loop is recovered by the [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook (ADR-003), so a turn-end no longer breaks the loop — but a premature `<promise>` does, by terminating it early. Emit the promise only when the completion conditions hold.
- **Do NOT invent state-file fields or status values.** The [`state`](../docs/native-looping.md#state) schema is authoritative; `status` is a closed enum (`running`, `completed`, `cancelled`, `max-iterations-reached`, `crashed`). New status values like `"loop_exhausted_no_promise"` will cause `--resume` to refuse and break observability tools.
- **Do NOT pass `--prompt` or `--prompt-file` alongside `--resume*`.** Resume re-uses persisted args.

## See also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration framework spec (state schema, loop-id rules, iteration mechanics, compaction safety, promise convention, markers).
- `/synthex:list-loops` — enumerate running and recent loops in this project.
- `/synthex:cancel-loop <loop-id>` / `--all` — cancel one or all running loops.
- Plan: `docs/plans/native-looping.md` (Task 4, FR-NL4–FR-NL45).

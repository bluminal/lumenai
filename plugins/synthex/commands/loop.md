---
model: sonnet
---

# Loop a prompt natively (no Ralph Loop dependency)

Run an arbitrary prompt iteratively in the same agent thread until the completion promise is emitted or `max_iterations` is reached. State is per-project in `.synthex/loops/<loop-id>.json`. Resumable across sessions. Coexists with the external `ralph-loop` plugin (see Precedence below).

The mechanical iteration framework — state-file schema, loop-id rules, shared-context vs. fresh-subagent iteration, auto-compaction guarantees, promise emission, iteration markers, Ralph precedence — is documented once in [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md). This command cross-references that document rather than duplicating the mechanics.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `--prompt <string>` | Literal prompt text to loop. Mutually exclusive with `--prompt-file`. | — | One of `--prompt` / `--prompt-file` / `--resume*` required |
| `--prompt-file <path>` | Path to a file whose contents become the prompt. Mutually exclusive with `--prompt`. | — | One of `--prompt` / `--prompt-file` / `--resume*` required |
| `--completion-promise <string>` | Literal text the agent emits inside `<promise>…</promise>` to terminate the loop. | — | Required unless `--resume` / `--resume-last` |
| `--max-iterations <int>` | Iteration cap. Hard ceiling is 200 (per FR-NL13). | `20` | No |
| `--loop-isolated` | Spawn a fresh subagent per iteration (no shared context). See [`subagent-iter`](../docs/native-looping.md#subagent-iter). | off (shared-context default per [D-NL1](../docs/native-looping.md#shared-iter)) | No |
| `--name <slug>` | User-supplied loop-id (slug `^[a-z0-9][a-z0-9-]{0,63}$`). | auto: `loop-<4-char-hex>` | No |
| `--resume <loop-id>` | Resume a known loop. Re-uses persisted `--prompt`/`--prompt-file`/`--completion-promise`/`--max-iterations`. | — | No |
| `--resume-last` | Resume the most-recent running loop in this project (FR-NL27 selection rules). | — | No |

## Workflow

### 0. Input validation (refusal paths)

Apply these refusals **in order**, before any state-file I/O. Each prints a single-line error to stderr and exits non-zero. Do NOT proceed to iteration on refusal.

- **No prompt source AND no resume** — refuse: `Pass --prompt, --prompt-file, --resume <loop-id>, or --resume-last.` (FR-NL37 generalization)
- **`--prompt` AND `--prompt-file` both supplied** — refuse: `--prompt and --prompt-file are mutually exclusive.` (FR-NL38)
- **`--prompt-file <path>` does not exist** — refuse: `Prompt file not found: <path>` (FR-NL39)
- **`--loop` (implicit here) without `--completion-promise`** and no resume — refuse: `--completion-promise <text> is required when starting a new loop. Resume an existing loop with --resume <loop-id> or --resume-last.` (FR-NL37)
- **`--max-iterations` > 200 OR < 1 OR non-integer** — refuse: `--max-iterations must be an integer in [1, 200]; got <value>.` (FR-NL42 / FR-NL13)
- **`--resume <loop-id>` AND a new prompt source supplied** (`--prompt`, `--prompt-file`, or any positional/extra arg) — refuse: `--resume re-uses the persisted prompt; do not pass --prompt or --prompt-file alongside --resume.` (E11)
- **`--name <slug>` violates the loop-id pattern** — refuse: `Invalid --name "<slug>". Must match ^[a-z0-9][a-z0-9-]{0,63}$ — got <offending characters>.` (FR-NL11)

### 1. Resolve loop-id

- **`--resume <loop-id>` supplied**: use the slug verbatim. Validate the file exists at `.synthex/loops/<slug>.json` (FR-NL40 — refuse with `No loop found: <slug>. Run /synthex:list-loops.` if missing). Validate `schema_version == 1` (FR-NL41 — refuse with delete-instructions if mismatched). Validate `status == "running"` — if not, refuse: `Loop "<slug>" is <status>. Cannot resume a terminal loop. Start a new loop or pick a different one.`
- **`--resume-last` supplied**: enumerate `.synthex/loops/*.json` (exclude `.archive/`), filter `status == "running"`. Pick by FR-NL27 rules (session-id match preferred, then `last_updated` desc). If none found, refuse: `No running loops in this project. /synthex:list-loops shows recent loops.`. Print the chosen `loop-id` before continuing.
- **`--name <slug>` supplied (fresh start)**: use the slug verbatim. If `.synthex/loops/<slug>.json` exists with `status == "running"`, refuse per FR-NL12: `Loop "<slug>" is already running (iteration <N>/<M>). Use /synthex:loop --resume <slug> to continue or /synthex:cancel-loop <slug> to stop it.` If the existing file is in a terminal status, archive it (next step) and proceed.
- **Auto-generate (no `--name`, no resume)**: produce `loop-<4-char-hex>` where the hex suffix derives from 2 bytes of `/dev/urandom` (fall back to a timestamp-derived hash if `/dev/urandom` is unavailable). On collision with an existing running loop, regenerate. See [`loop-id`](../docs/native-looping.md#loop-id) for the full rules.

### 2. Archive terminal state files (incidental cleanup)

Once `.synthex/loops/` is opened, scan for files with terminal `status` values (`completed`, `cancelled`, `max-iterations-reached`, `crashed`). Move each to `.synthex/loops/.archive/<loop-id>-<ISO-timestamp>.json` (D-NL10). Create `.archive/` lazily. This step is a side-effect of any loop invocation; it has no effect on the loop being started or resumed.

### 3. Initialize or restore state

- **Fresh start**: `mkdir -p .synthex/loops`. Write the state file via tmp-file + atomic `mv`:

```json
{
  "schema_version": 1,
  "loop_id": "<resolved>",
  "session_id": "<Claude Code session id, or null if unavailable>",
  "command": "/synthex:loop",
  "args": "<canonicalized CLI args, redacted for prompt content if --prompt-file>",
  "prompt_file": "<--prompt-file path, or null>",
  "completion_promise": "<--completion-promise>",
  "max_iterations": <--max-iterations or 20>,
  "iteration": 0,
  "isolation": "<shared-context | subagent>",
  "status": "running",
  "started_at": "<UTC ISO 8601>",
  "last_updated": "<UTC ISO 8601>",
  "exited_at": null,
  "exit_reason": null
}
```

- **Resume**: read the existing state file. Validate per [`state`](../docs/native-looping.md#state) and FR-NL9. If `--loop-isolated` / `--loop-shared` override is supplied on the resume invocation, update `isolation` accordingly (FR-NL28). Update `last_updated` to now and persist.

### 4. Iteration loop

Follow [`shared-iter`](../docs/native-looping.md#shared-iter) (shared-context, default) or [`subagent-iter`](../docs/native-looping.md#subagent-iter) (fresh-subagent, when `--loop-isolated` is set). The high-level loop body is the same:

1. **Boundary check.** Re-read the state file. If `status != "running"`, exit immediately with `Loop "<loop-id>" is <status> — nothing to do.`. If `iteration >= max_iterations`, set `status: "max-iterations-reached"`, `exit_reason: "Reached max_iterations=<N> without completion promise"`, `exited_at` to now, write state, print the FR-NL21 resume hint, exit.
2. **Increment + persist counter.** `iteration += 1`; update `last_updated`; atomic write. This is the durability boundary (D-NL13).
3. **Print iteration marker.** `[loop <loop-id> iteration <N>/<max>]` to stdout. See [`markers`](../docs/native-looping.md#markers).
4. **Execute the iteration's work.**
   - **Shared-context (`isolation == "shared-context"`)**: read the prompt (literal `--prompt` value or the contents of `--prompt-file`) and respond to it inline in this agent thread. Apply [`compaction-safety`](../docs/native-looping.md#compaction-safety) — persist any iteration work to disk artifacts, not to the conversation.
   - **Fresh-subagent (`isolation == "subagent"`)**: spawn a sub-agent via the Agent (Task) tool with the prompt content plus the `[loop iteration N/M]` framing. Wait for its final response. The sub-agent's output becomes this iteration's output.
5. **Promise detection.** Scan the iteration's final response for the literal regex `<promise>\s*<completion_promise_text>\s*</promise>` (where `<completion_promise_text>` is the persisted value). If matched: set `status: "completed"`, `exit_reason: "completion-promise-emitted"`, `exited_at` to now, write state, print `Loop "<loop-id>" completed at iteration <N>/<max>.`, exit. See [`promise-emission`](../docs/native-looping.md#promise-emission).
6. **Cancellation check.** Re-read the state file. If another session set `status: "cancelled"` (via `/synthex:cancel-loop`), exit immediately with `Loop "<loop-id>" cancelled.`.
7. **Loop back to step 1.**

### 5. Compaction-loss recovery (FR-NL25)

If during the loop you cannot recall the loop-id or the state-file path (e.g., the conversation was auto-compacted and the framing line is gone), recover by listing `.synthex/loops/` and choosing the file with `status: "running"` matching this command (`/synthex:loop`). If multiple match, exit with: `Multiple running /synthex:loop loops in this project. Resume explicitly with /synthex:loop --resume <loop-id>.` Do not guess. See [`compaction-safety`](../docs/native-looping.md#compaction-safety).

### 6. Precedence with Ralph Loop (FR-NL44)

If `.claude/ralph-loop.local.md` exists with `active: true` at loop start:

- Honor `/synthex:loop` (this command's iteration framework takes precedence).
- Print the one-line advisory verbatim: `Note: --loop overrides Ralph Loop. The ralph-loop plugin's state file is unchanged; cancel the ralph loop separately if you want it gone.`
- Do **not** mutate `.claude/ralph-loop.local.md`.

See [`precedence`](../docs/native-looping.md#precedence) for the full rule.

## Anti-patterns

- **Do NOT accumulate iteration state in the conversation.** All state lives in `.synthex/loops/<loop-id>.json`. The conversation may be auto-compacted at any time.
- **Do NOT cache the state-file path as a literal string in the conversation.** Always re-derive from the loop-id.
- **Do NOT emit `<promise>...</promise>` in thinking text or intermediate responses.** Emit only in the iteration's final response, only when you intend to terminate the loop.
- **Do NOT modify `.claude/ralph-loop.local.md`.** It is owned by the external `ralph-loop` plugin.
- **Do NOT pass `--prompt` or `--prompt-file` alongside `--resume*`.** Resume re-uses persisted args.

## See also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration framework spec (state schema, loop-id rules, iteration mechanics, compaction safety, promise convention, markers, Ralph precedence).
- `/synthex:list-loops` — enumerate running and recent loops in this project.
- `/synthex:cancel-loop <loop-id>` / `--all` — cancel one or all running loops.
- Plan: `docs/plans/native-looping.md` (Task 4, FR-NL4–FR-NL45).

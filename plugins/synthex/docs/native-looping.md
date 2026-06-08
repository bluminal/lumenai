# Native Synthex Looping — Framework Specification

This document is the canonical specification for Synthex's native looping primitive (introduced in synthex 0.7.0 / synthex-plus 0.4.0 per `docs/plans/native-looping.md`). Every command that accepts a `--loop` flag cross-references this doc rather than duplicating the iteration mechanics. Seven section anchors are defined below — keep their IDs stable, as schema tests and other commands link to them.

## Seven cross-reference anchors

| Anchor | Section |
|--------|---------|
| `state` | State file schema and location |
| `loop-id` | Loop-id assignment rules |
| `shared-iter` | Shared-context iteration mechanics |
| `subagent-iter` | Fresh-subagent iteration mechanics |
| `compaction-safety` | Auto-compaction guarantees |
| `promise-emission` | Completion-promise convention |
| `markers` | Iteration markers (stdout visibility) |

When linking from another command's `--loop` instructions, use `plugins/synthex/docs/native-looping.md#<anchor>`.

## <a id="state"></a>State file schema and location

Loop state lives at `<project>/.synthex/loops/<loop-id>.json`. One file per loop. The directory is created lazily on first loop invocation; its absence is not an error. Loop state is **per-developer**, gitignored alongside `.synthex/state.json`.

### Schema (v1)

```json
{
  "schema_version": 1,
  "loop_id": "next-priority-3f2a",
  "session_id": "<value of the $CLAUDE_CODE_SESSION_ID env var; null ONLY if it is empty>",
  "command": "/synthex:next-priority",
  "args": "@docs/plans/main.md 3",
  "prompt_file": null,
  "completion_promise": "ALLDONE",
  "max_iterations": 20,
  "iteration": 5,
  "consecutive_stop_blocks": 0,
  "last_gate_iteration": 5,
  "isolation": "shared-context",
  "status": "running",
  "started_at": "2026-05-13T18:22:04Z",
  "last_updated": "2026-05-13T18:48:11Z",
  "exited_at": null,
  "exit_reason": null
}
```

| Field | Type | Notes |
|-------|------|-------|
| `schema_version` | integer | Always `1` in v1. Future bumps reserved. Unknown values cause `--resume` to refuse; never auto-mutate forward. |
| `loop_id` | string | Per FR-NL11 rules (see `loop-id` anchor). |
| `session_id` | string\|null | The Claude Code session id at loop start, read from `$CLAUDE_CODE_SESSION_ID` (see [Obtaining the session id](#obtaining-the-session-id)). The [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook only drives loops whose `session_id` matches the live session, so this MUST be the real id — `null` leaves the loop permanently undriven and is a fallback only when the env var is genuinely empty. |
| `command` | string | The slash-command path that owns the loop (e.g., `/synthex:next-priority`). |
| `args` | string | The arguments the command was invoked with, preserved verbatim for resume. |
| `prompt_file` | string\|null | Populated only for `/synthex:loop --prompt-file <path>` invocations. |
| `completion_promise` | string | The literal text the agent emits inside `<promise>…</promise>` to terminate the loop. |
| `max_iterations` | integer | Cap. Default 20, hard ceiling 200. |
| `iteration` | integer | Current iteration count. Incremented and persisted **before** each iteration's work begins (durability boundary per D-NL13). |
| `isolation` | enum | `"shared-context"` (default) or `"subagent"` (when `--loop-isolated`). |
| `status` | enum | `"running"`, `"completed"`, `"cancelled"`, `"max-iterations-reached"`, `"crashed"`. |
| `started_at` | ISO 8601 UTC | When the loop was created. |
| `last_updated` | ISO 8601 UTC | Updated on every iteration boundary. |
| `exited_at` | ISO 8601 UTC \| null | Set when status transitions to a terminal value. |
| `exit_reason` | string \| null | Human-readable; null while running. |
| `consecutive_stop_blocks` | integer | Optional; managed by the `loop-advance-gate` Stop hook. Count of consecutive no-progress turn-ends. Resets to 0 (well, to 1 on the counting block) when `iteration` advances. Defaults to 0 when absent. |
| `last_gate_iteration` | integer | Optional; gate-managed. The `iteration` value the last time the Stop hook fired — used to detect progress between turn-ends. Defaults to -1 when absent. |

### Obtaining the session id

The live Claude Code session id is exposed to the agent's shell as the **`$CLAUDE_CODE_SESSION_ID`** environment variable — the same 36-char UUID the [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook receives as `.session_id` on stdin. When writing or refreshing a loop's `session_id`, read it with a Bash call (e.g. `printf '%s' "$CLAUDE_CODE_SESSION_ID"`) and use that value verbatim. Write `null` **only** when the variable is genuinely empty.

This is load-bearing: the gate's ownership match is `loop.session_id == live session_id`. A `null` (or any stale/guessed value) never matches, so the gate falls through to allow the stop and the loop is **never re-driven** — it dies at the first turn-end. Stamping the real id at creation is what makes hands-off looping work at all.

### Resume refreshes `session_id` (gate ownership)

When a loop is resumed — `/synthex:loop --resume` / `--resume-last`, or any `--loop` command resuming an existing loop — the resuming session MUST overwrite `session_id` with its **own** session id (from `$CLAUDE_CODE_SESSION_ID`, see [Obtaining the session id](#obtaining-the-session-id)) before iterating. The [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook only drives loops whose `session_id` matches the current session; a stale id carried over from the original session would leave the resumed loop undriven (it would silently stall on the first turn-end). This is part of the resume mutation alongside `last_updated` and any `isolation` override.

### Atomic writes

Every mutation MUST be atomic: write to `<state-file>.tmp.<pid>`, then `mv -f` over the real path. The `.tmp.<pid>` suffix prevents collision when two iterations on the same loop overlap (which should not happen but the file system is the only durability surface).

### Archive

When any loop command touches `.synthex/loops/`, it MUST scan the directory once for terminal-status state files and move each to `.synthex/loops/.archive/<loop-id>-<ISO-timestamp>.json`. This implements D-NL10 and is documented in detail here (Task 12) so every command's iteration instructions reference a single source.

#### Which commands run the archive scan

The archive scan fires at the **start** of every invocation of:

- `/synthex:loop` — fresh start, resume, or `--resume-last`.
- `/synthex:list-loops` — enumeration. (Archive runs even though the list excludes archived loops; this keeps the active directory tight.)
- `/synthex:cancel-loop` — single-loop cancel only. `--all` runs the scan **after** mutating running loops to cancelled, so newly-cancelled state files are NOT immediately archived in the same invocation (they'll archive on the next touch).
- Any `--loop`-bearing command on its first iteration when it lazily creates `.synthex/loops/`.

The scan is best-effort: it does not block on filesystem errors, and individual archive failures are logged as warnings but never abort the calling command.

#### Scan algorithm

1. List `.synthex/loops/*.json` (skip `.archive/`).
2. For each file:
   - Parse the JSON. Skip silently if corrupt or unreadable.
   - Read `status`. If it is one of `{"completed", "cancelled", "max-iterations-reached", "crashed"}`, it's a candidate for archival.
   - Read `exited_at`. If it's `null` (anomaly — terminal status without a timestamp), use `last_updated` as a fallback for the archive filename.
3. For each candidate:
   - Compute the archive path: `.synthex/loops/.archive/<loop_id>-<exited_at-in-filename-safe-form>.json`. The filename-safe form replaces `:` with `-` so the file is portable across filesystems (e.g., `2026-05-13T18-48-11Z`).
   - `mkdir -p .synthex/loops/.archive/` (lazy creation; the directory may not exist yet).
   - Move atomically: `mv -f <source> <archive-path>`. If the destination already exists (the same loop archived twice — should not happen, but possible if someone manually copied a file), append `-1`, `-2`, ... to the basename until a free name is found.
   - Log the move at debug level (not user-visible by default).
4. If any archive move fails (filesystem error, permission denied), do NOT abort the calling command. Skip the file and continue.

#### Archive directory layout

```
.synthex/loops/
├── next-priority-3f2a.json         # running
├── team-implement-7e1d.json        # running
└── .archive/
    ├── refine-requirements-9b22-2026-05-13T18-22-04Z.json   # completed
    ├── loop-write-rfc-1a08-2026-05-13T16-44-31Z.json        # max-iterations-reached
    └── team-plan-4c66-2026-05-13T15-10-22Z.json             # cancelled
```

The `.archive/` directory is gitignored (covered by the `.synthex/loops/` entry that `init.md` Step 5 / `team-init.md` Step 6 add).

#### Retention

v1 has no automatic time-based or count-based purge. Archived files accumulate until the user manually cleans them up. Retention policy is tracked as Q-NL1; v2 will likely cap at the 20 most-recent archived loops or apply a 30-day TTL.

For now, users who want to clean up old archives can run:

```sh
rm -rf .synthex/loops/.archive
```

This is safe at any time — the active directory is unaffected, and loop-id collisions with previously-archived loops are not a concern (active loops never reuse archived ids by definition).

#### Anti-pattern: do NOT delete terminal-status files directly

`/synthex:cancel-loop` and other commands mutate `status: "cancelled"` in place and let the next archive scan move the file. They do NOT `rm` the file. This preserves the loop's history (iteration count, exit_reason, started_at) for the user to inspect via `ls .synthex/loops/` or by reading the JSON directly between cancel and the next archive scan.

## <a id="loop-id"></a>Loop-id assignment rules

- If `--name <slug>` is supplied at loop start: the slug becomes the loop-id verbatim. Slugs must match `^[a-z0-9][a-z0-9-]{0,63}$` (lowercase, hyphens, ≤ 64 chars). Reject invalid slugs with an error that names the offending characters.
- If `--name` is omitted: auto-generate as `<command-slug>-<4-char-hex>`. The hex suffix derives from `/dev/urandom` (2 bytes, hex-encoded) with a timestamp-derived hash fallback.

### Command slugs

| Command | Slug |
|---------|------|
| `/synthex:next-priority` | `next-priority` |
| `/synthex:write-implementation-plan` | `write-implementation-plan` |
| `/synthex:refine-requirements` | `refine-requirements` |
| `/synthex:review-code` | `review-code` |
| `/synthex:loop` | `loop` |
| `/synthex-plus:team-implement` | `team-implement` |
| `/synthex-plus:team-review` | `team-review` |
| `/synthex-plus:team-plan` | `team-plan` |
| `/synthex-plus:team-refine` | `team-refine` |

### Collision handling

If a state file already exists at the resolved path and is in `status: "running"`:
- With `--name`: refuse with an error directing the user to `--resume <slug>` or `/synthex:cancel-loop <slug>`.
- With an auto-generated name: regenerate the hex suffix and retry. Collision is rare (16-bit suffix; ≤ 256 expected loops before ~50% collision chance per project).

If the existing state file is terminal (`completed`, `cancelled`, `max-iterations-reached`, `crashed`): archive it (see `state` § Archive) and start fresh.

## <a id="shared-iter"></a>Shared-context iteration mechanics

This is the **default** isolation mode (D-NL1). The looping command runs as a single agent thread that internally iterates. Claude Code's built-in auto-compaction manages the context window across iterations.

### Iteration loop pseudo-flow

Each `--loop`-bearing command authors a concrete adaptation of this flow. The structure below is shared across all commands.

1. **Initialize or restore.** Read `.synthex/loops/<loop-id>.json` if it exists. Otherwise create it with `iteration: 0`, `status: "running"`, and the fields from CLI args.
2. **Iteration boundary check.**
   - If `status != "running"`: exit immediately. Print one line: `Loop "<loop-id>" is <status> — nothing to do`.
   - If `iteration >= max_iterations`: set `status: "max-iterations-reached"`, `exited_at`, `exit_reason: "Reached max_iterations=<N> without completion promise"`, write state, exit. Print the resume hint per FR-NL21.
3. **Increment iteration counter and persist** (D-NL13 durability boundary). Write `iteration += 1` and `last_updated` to the state file **before** doing iteration work. A crash mid-iteration costs one iteration of work but the counter remains accurate.
4. **Print iteration marker.** See `markers` anchor.
5. **Execute the command's normal workflow.** This is the existing body of `next-priority`, `team-implement`, etc., or the user's prompt for `/synthex:loop`.
6. **Promise detection.** After the workflow's final response, scan that response for the literal regex `<promise>\s*<completion_promise_text>\s*</promise>`. If matched, set `status: "completed"`, `exit_reason: "completion-promise-emitted"`, `exited_at`, write state, exit.
7. **Cancellation check.** Re-read the state file. If `status == "cancelled"` (set by another session via `/synthex:cancel-loop`), exit immediately.
8. **Loop back to step 2.**

### Turn-per-iteration: the Stop hook re-invokes you

You do NOT have to keep the entire loop inside one assistant turn. Synthex's [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook re-drives the next iteration whenever you end a turn while the loop is still `running` and you have not emitted the completion promise. Ending a turn mid-loop is **recovered, not fatal** (ADR-003). Continuing in the same turn is still fine and marginally cheaper, but it is no longer the thing that keeps the loop alive — the promise keeps it from over-running, and the gate keeps it advancing. The gate bounds runaway with a progress-aware counter (`consecutive_stop_blocks`) capped below Claude Code's 8-consecutive-block override: if you genuinely cannot advance, it relinquishes after a few no-progress turns rather than forcing you forever, and it steps aside for a pending `AskUserQuestion` (the `[H]`-approval escape).

### What the agent's instructions must NOT do

- Do NOT accumulate iteration state in the conversation history. The state file is the source of truth (FR-NL16).
- Do NOT persist iteration work output in the conversation. Write to the user's primary artifact (implementation plan, review report, ADR) so the next iteration reads from disk (FR-NL17).
- Do NOT cache the state-file path as a literal string in the conversation; always re-derive it from the loop-id (FR-NL24).

## <a id="subagent-iter"></a>Fresh-subagent iteration mechanics

When `--loop-isolated` is passed, the looping command spawns a sub-agent per iteration via the Agent (Task) tool. Each sub-agent starts with a cleared context.

### Outer-command responsibilities

1. Maintain the loop counter and state file (same FR-NL14 mechanics).
2. For each iteration, invoke the Agent tool with the looping command's full body as the sub-agent prompt, plus an `[loop <loop-id> iteration N/M]` framing line.
3. Capture the sub-agent's final output.
4. Scan the sub-agent's output for the completion promise (same as `shared-iter` step 6).
5. Continue or exit at the iteration boundary.

### When to use fresh-subagent mode

Fresh-subagent is slower (per-iteration model spin-up + full context re-priming) and pricier (no carry-over of prior reasoning). It is the correct choice when:
- Prior iterations' conversation actively interferes with subsequent ones.
- Long-running plans need sensitive context isolated between iterations.
- Debugging an iteration that produces inconsistent output across runs.

The generic `/synthex:loop` supports `--loop-isolated` by spawning a fresh sub-agent that runs the user's prompt (D-NL18 — no "command body" to spawn; the prompt itself is the body).

## <a id="compaction-safety"></a>Auto-compaction guarantees

Shared-context loops rely on Claude Code's built-in auto-compaction to keep the conversation within the context window. The framework guarantees correctness under compaction iff three conditions hold:

1. **All iteration state lives in `.synthex/loops/<loop-id>.json`**, never in the conversation. The state file is the durable source of truth.
2. **All iteration work output lives in the user's persistent artifact** (implementation plan, review report, ADR, etc.), not in the conversation.
3. **The state-file path is re-derived from the loop-id in each iteration** — never cached in the conversation as a literal path.

### Compaction-loss safeguard

On the iteration boundary, the agent's instructions explicitly say:

> If you cannot recall the loop-id or the state-file path, recover from `.synthex/loops/` by listing the directory and choosing the file with `status: "running"` matching this command. If multiple match, exit with an error directing the user to resume explicitly.

This handles the edge case where compaction summaries omit the loop-id from the conversation.

## <a id="promise-emission"></a>Completion-promise convention

The promise format is `<promise>X</promise>` XML tags (D-NL4). A single emission point per command produces the tag; the loop framework scans for it to decide whether to terminate.

### Emission rules for the agent

- Emit the promise tag in the agent's **final response** of each iteration (the response that ends the iteration's workflow), not in intermediate thinking text.
- Emit the promise **only when you intend to terminate the loop**. False-positive promises in earlier responses are not scanned (see `shared-iter` step 6: the scan targets the iteration's final response only).
- The promise text must match `completion_promise` from the state file **literally**. Whitespace inside the tag is tolerated (`\s*` around the value).

### Where each command emits

Each `--loop`-bearing command's "Native Looping" section declares its emission point. Examples (from the plan):

| Command | Emission point |
|---------|----------------|
| `next-priority` | When the implementation plan has no remaining tasks, OR `exit_on_milestone_complete` fires. |
| `write-implementation-plan` | When the plan covers all PRD requirements without TBDs. |
| `refine-requirements` | When the PRD's open questions are resolved enough to start planning. |
| `review-code` | When a review cycle ends with zero blocking findings AND zero recommended changes. |
| `team-implement` | When the team has completed all assigned tasks across the plan. |
| `team-review` | When the consolidated report has no remaining open critiques. |
| `team-plan` | When the team's plan covers the PRD without TBDs. |
| `team-refine` | When the team's refined requirements resolve all open questions. |
| `/synthex:loop` | User-defined (the user's prompt specifies the completion condition). |

### Team commands: lead-output-only scan (E7)

For team commands, only the **lead teammate's** consolidated output is scanned for the promise. Transient teammate outputs are not promise sources. This prevents accidental loop termination when a single teammate emits the tag in their own report.

## <a id="markers"></a>Iteration markers

Each iteration boundary prints one short line to stdout:

```
[loop <loop-id> iteration <N>/<max>]
```

Markers are short by design (D-NL9) so they survive auto-compaction summaries. They print before the iteration's workflow begins (after the counter is persisted in shared-context mode; after the sub-agent is invoked in fresh-subagent mode).

Markers print unconditionally — no `--quiet`, no `--verbose` (Q-NL2 resolved). The cost is one line per iteration; the benefit is visibility into long-running loops.

## Implementation note (for command authors)

When adding `--loop` to a command, the command's "Native Looping" section must include three sub-anchors:

1. **Emission Point** — where in this command's workflow the promise tag is emitted. Reference the table above; do not invent a new emission rule.
2. **Iteration Body** — a brief paragraph noting that the command's existing workflow runs once per iteration. Cross-reference `shared-iter` and `subagent-iter` anchors above.
3. **See Also** — cross-reference this document and the relevant FR-NL identifiers.

Keep "Native Looping" sections concise. The mechanical heft lives in this document; the command body just specifies the per-command emission point.

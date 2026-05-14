# Native Synthex Looping — Framework Specification

This document is the canonical specification for Synthex's native looping primitive (introduced in synthex 0.7.0 / synthex-plus 0.4.0 per `docs/plans/native-looping.md`). Every command that accepts a `--loop` flag cross-references this doc rather than duplicating the iteration mechanics. Eight section anchors are defined below — keep their IDs stable, as schema tests and other commands link to them.

## Eight cross-reference anchors

| Anchor | Section |
|--------|---------|
| `state` | State file schema and location |
| `loop-id` | Loop-id assignment rules |
| `shared-iter` | Shared-context iteration mechanics |
| `subagent-iter` | Fresh-subagent iteration mechanics |
| `compaction-safety` | Auto-compaction guarantees |
| `promise-emission` | Completion-promise convention |
| `markers` | Iteration markers (stdout visibility) |
| `precedence` | Precedence with the official Ralph Loop plugin |

When linking from another command's `--loop` instructions, use `plugins/synthex/docs/native-looping.md#<anchor>`.

## <a id="state"></a>State file schema and location

Loop state lives at `<project>/.synthex/loops/<loop-id>.json`. One file per loop. The directory is created lazily on first loop invocation; its absence is not an error. Loop state is **per-developer**, gitignored alongside `.synthex/state.json`.

### Schema (v1)

```json
{
  "schema_version": 1,
  "loop_id": "next-priority-3f2a",
  "session_id": "<Claude Code session id, or null if unavailable>",
  "command": "/synthex:next-priority",
  "args": "@docs/plans/main.md 3",
  "prompt_file": null,
  "completion_promise": "ALLDONE",
  "max_iterations": 20,
  "iteration": 5,
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
| `session_id` | string\|null | The Claude Code session id at loop start. May be null if unavailable. |
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

### Atomic writes

Every mutation MUST be atomic: write to `<state-file>.tmp.<pid>`, then `mv -f` over the real path. The `.tmp.<pid>` suffix prevents collision when two iterations on the same loop overlap (which should not happen but the file system is the only durability surface).

### Archive

When any loop command touches `.synthex/loops/`, it scans for terminal-status state files and moves them to `.synthex/loops/.archive/<loop-id>-<ISO-timestamp>.json` (D-NL10). The archive directory is gitignored. v1 has no automatic time-based purge; retention policy is tracked in Q-NL1.

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

The promise format is `<promise>X</promise>` XML tags, **identical to Ralph Loop's convention** (D-NL4). This means commands that already emit the tag for Ralph Loop integration do not need a separate emission point for native looping — the same tag works for both consumers.

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

## <a id="precedence"></a>Precedence with the official Ralph Loop plugin

Synthex's native looping coexists with the official `ralph-loop` plugin. Users on `ralph-loop` continue to use it via the existing Ralph Loop Integration sections in commands. Users on native looping use `--loop` directly.

### When both are active

If `--loop` is passed AND `.claude/ralph-loop.local.md` exists with `active: true`:

- `--loop` takes precedence. The command iterates natively.
- The command prints a one-line advisory: `Note: --loop overrides Ralph Loop. The ralph-loop plugin's state file is unchanged; cancel the ralph loop separately if you want it gone.`
- `.claude/ralph-loop.local.md` is **not mutated** by the synthex command.

### When only Ralph is active

If `--loop` is NOT passed AND `.claude/ralph-loop.local.md` exists with `active: true`: the existing Ralph Loop Integration section governs. No behavior change for Ralph users.

### When neither is active

The command runs once (no looping).

---

## Implementation note (for command authors)

When adding `--loop` to a command, the command's "Native Looping" section must include four sub-anchors:

1. **Emission Point** — where in this command's workflow the promise tag is emitted. Reference the table above; do not invent a new emission rule.
2. **Iteration Body** — a brief paragraph noting that the command's existing workflow runs once per iteration. Cross-reference `shared-iter` and `subagent-iter` anchors above.
3. **Precedence with Ralph Loop** — link to `precedence` anchor above; quote the one-line advisory verbatim.
4. **See Also** — cross-reference this document and the relevant FR-NL identifiers.

Keep "Native Looping" sections concise. The mechanical heft lives in this document; the command body just specifies the per-command emission point.

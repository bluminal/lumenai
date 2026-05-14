# Implementation Plan: Native Synthex Looping

## Overview

Adds a native looping primitive to Synthex so users can iterate Synthex commands until a completion promise is emitted or a max-iteration cap is reached — without depending on the external `ralph-loop` plugin. The mechanism is **internal-iteration**: when invoked with `--loop`, a command's markdown instructs the agent to re-run its own workflow in the same agent thread, relying on Claude Code's built-in auto-compaction to manage context. Per-session state files in `.synthex/loops/` enable concurrent sessions and cross-session resume. A generic `/synthex:loop` command loops arbitrary prompts. Teams commands (`team-implement`, `team-review`, `team-plan`, `team-refine`) gain the same `--loop` flag. Existing Ralph Loop Integration sections in commands stay intact — users on the `ralph-loop` plugin keep their current workflow.

## Goals

- Provide a Synthex-native `--loop` flag on iteration-friendly commands so users get reliable looping without the `ralph-loop` plugin.
- **Default isolation is shared-context** — each iteration sees the prior iteration's conversation, with auto-compaction handling context-window pressure. Opt-in `--loop-isolated` spawns a fresh subagent per iteration.
- **Per-session state** in `.synthex/loops/<loop-id>.json` so two Claude Code sessions on the same project can run independent loops without colliding.
- **Resume across sessions** via `/synthex:loop --resume <loop-id>` or `--resume-last`.
- **Generic loop surface** (`/synthex:loop`) for prompts that don't have a dedicated Synthex command.
- **Teams parity** — `team-*` commands accept `--loop` and operate under the same iteration framework.
- **Coexists with the official `ralph-loop` plugin.** Existing Ralph Loop Integration sections remain functional for users on that plugin.

## Non-Goals

- **Do NOT replace or remove the user's `ralph-loop` plugin.** This is a parallel, optional surface. Users who prefer Ralph can keep using it.
- **Do NOT remove the existing "Ralph Loop Integration" section from any command** (`next-priority.md`, `team-implement.md`). They stay byte-identical except where this plan explicitly amends them to document `--loop` precedence (FR-NL30).
- **Do NOT introduce a Stop hook for shared-context mode.** Iteration is internal to the command. (Fresh-subagent mode uses the Agent tool, not a hook.)
- **Do NOT introduce a background daemon, watcher, or external runtime.** All state lives in JSON files on disk; iteration runs inside the agent thread.
- **Do NOT change `--loop`-less behavior of any command.** When `--loop` is not passed, every command's observable output is byte-identical to today.
- **Do NOT auto-mutate `.claude/ralph-loop.local.md`.** That file is owned by the `ralph-loop` plugin. Native looping uses an entirely separate state directory (`.synthex/loops/`).
- **Do NOT introduce major-version bumps.** The automated release workflow will lockstep-bump on `feat:` commits (minor) as appropriate; this plan ships at most one minor bump.
- **Do NOT introduce a `--checkpoint` interactive pause for v1** (deferred — see Q-NL4).
- **Do NOT hand-edit `marketplace.json`, `plugins/*/.claude-plugin/plugin.json` versions, or `CHANGELOG.md` in this plan's commits.** The automated release workflow (`.github/workflows/release.yml`, added to origin post-plan-authoring) owns version bumps and CHANGELOG generation from Conventional Commit subjects. This plan ships via `feat:` commits; the workflow handles the rest.

## Functional Requirements

### Iteration surface

- **FR-NL1** — Add a `--loop` flag to the following commands. The flag is opt-in; when absent, the command behaves identically to today.
  - `plugins/synthex/commands/next-priority.md`
  - `plugins/synthex/commands/write-implementation-plan.md`
  - `plugins/synthex/commands/refine-requirements.md`
  - `plugins/synthex/commands/review-code.md`
  - `plugins/synthex-plus/commands/team-implement.md`
  - `plugins/synthex-plus/commands/team-review.md`
  - `plugins/synthex-plus/commands/team-plan.md`
  - `plugins/synthex-plus/commands/team-refine.md`
- **FR-NL2** — Each `--loop`-bearing command MUST add the following parameter rows to its existing Parameters table (using the established `Parameter | Description | Default | Required` schema):
  - `--loop` — enable native looping (boolean flag)
  - `--completion-promise <string>` — promise text the agent emits to terminate the loop; required when `--loop` is set
  - `--max-iterations <int>` — cap (default per FR-NL13)
  - `--loop-isolated` — opt into fresh-subagent isolation mode (FR-NL18)
  - `--name <slug>` — user-supplied loop-id (FR-NL11)
- **FR-NL3** — Commands that have no useful exit condition (`init`, `configure-multi-model`, `configure-teams`, `write-adr`, `write-rfc`, `dismiss-upgrade-nudge`, `retrospective`, `team-init`, `start-review-team`, `stop-review-team`, `list-teams`, `design-system-audit`, `performance-audit`, `reliability-review`, `test-coverage-analysis`) do NOT receive `--loop`. They remain one-shot.

### Generic loop command

- **FR-NL4** — A new command `plugins/synthex/commands/loop.md` (slash command `/synthex:loop`) loops an arbitrary prompt. Parameters:
  - `--prompt <string>` — literal prompt text (mutually exclusive with `--prompt-file`)
  - `--prompt-file <path>` — path to a file containing the prompt
  - `--completion-promise <string>` — required unless `--resume`
  - `--max-iterations <int>` — default per FR-NL13
  - `--loop-isolated` — fresh-subagent mode
  - `--name <slug>` — user-supplied loop-id
  - `--resume <loop-id>` — resume a known loop
  - `--resume-last` — resume the most recent loop in the project
- **FR-NL5** — Register `loop.md` in `plugins/synthex/.claude-plugin/plugin.json` `commands` array.
- **FR-NL6** — synthex-plus does NOT ship its own generic loop command in v1; `synthex-plus`'s declared dependency on `synthex` means users always have `/synthex:loop` available. (See Q-NL3 for v2 reconsideration.)

### State file schema and location

- **FR-NL7** — Loop state files live at `<project>/.synthex/loops/<loop-id>.json`. The `.synthex/loops/` directory is created on first loop invocation; absence is not an error.
- **FR-NL8** — State file JSON schema (v1):

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

  - `isolation`: `"shared-context"` (default) or `"subagent"` (when `--loop-isolated`).
  - `status`: `"running"`, `"completed"`, `"cancelled"`, `"max-iterations-reached"`, `"crashed"`.
  - `exit_reason`: human-readable; null while `status == "running"`.
  - `prompt_file`: populated only for generic-loop invocations using `--prompt-file`.

- **FR-NL9** — `schema_version` is reserved for forward compatibility; v1 emits `1`. Unknown values cause `--resume` to refuse with a clear error (do not auto-mutate).
- **FR-NL10** — State files MUST be added to `.gitignore` by `init.md` and `team-init.md` (append `.synthex/loops/` to the existing `.gitignore` step). Loop state is per-developer/per-clone.

### Loop-id assignment

- **FR-NL11** — Loop-id rules:
  - If `--name <slug>` is supplied, the slug becomes the loop-id verbatim. Slugs must match `^[a-z0-9][a-z0-9-]{0,63}$` (lowercase, hyphenated, ≤ 64 chars). Reject invalid slugs with an actionable error message that names the offending characters.
  - If `--name` is omitted, auto-generate as `<command-slug>-<4-char-hex>` where the hex suffix is derived from `crypto-strength random bytes` (e.g., `next-priority-3f2a`). The agent generates this by reading 2 bytes from `/dev/urandom` and hex-encoding, falling back to a timestamp-derived hash if `/dev/urandom` is unavailable.
  - `<command-slug>` derivations: `next-priority`, `write-implementation-plan`, `refine-requirements`, `review-code`, `team-implement`, `team-review`, `team-plan`, `team-refine`, `loop` (for the generic command).
- **FR-NL12** — If a state file already exists at the resolved path and is in `status: running`:
  - With `--name <slug>` supplied: refuse with an error directing the user to `--resume <slug>` or `/synthex:cancel-loop <slug>` (E3).
  - With an auto-generated name: regenerate the hex suffix and retry (collision is rare but handled).
  - If the existing state file is in any terminal status (`completed`, `cancelled`, `max-iterations-reached`, `crashed`), the new invocation overwrites it after archiving to `<.synthex/loops/.archive/<loop-id>-<timestamp>.json>` (D-NL10).

### Iteration mechanics — shared-context mode (default)

- **FR-NL13** — Max-iterations default is **20**, matching Ralph Loop's common usage. Override via `--max-iterations`. Hard ceiling is 200 (refuse values above this — protects against runaway loops; the user can re-invoke with `--resume` to continue past 200 if they really need to).
- **FR-NL14** — When invoked with `--loop`, the command's markdown executes the following pseudo-flow (each command authors a concrete adaptation; the structure is shared and documented in `plugins/synthex/docs/native-looping.md` per FR-NL27):
  1. **Initialize or restore.** Read `.synthex/loops/<loop-id>.json` if it exists; otherwise create it with `iteration: 0`, `status: "running"`, fields from CLI args.
  2. **Iteration boundary check.** If `status != "running"`, exit immediately with a one-line message ("Loop `<loop-id>` is `<status>` — nothing to do"). If `iteration >= max_iterations`, set `status: "max-iterations-reached"` and exit (FR-NL21).
  3. **Increment iteration counter and persist.** Write `iteration += 1` and updated `last_updated` to the state file BEFORE doing iteration work. This is the durability boundary — a crash mid-iteration loses one iteration's work but the counter remains accurate.
  4. **Print iteration marker.** Print `[loop <loop-id> iteration <N>/<max>]` to stdout (Q-NL2 resolved — markers ship in v1 for visibility).
  5. **Execute the command's normal workflow** (the existing body of `next-priority`, `team-implement`, etc., or the user's prompt for `/synthex:loop`).
  6. **Promise detection.** After workflow execution completes, scan the agent's most recent response for the literal regex `<promise>\s*<completion_promise_text>\s*</promise>` (XML tags, same as Ralph). If matched, set `status: "completed"`, `exit_reason: "completion-promise-emitted"`, `exited_at` to now, and exit.
  7. **Cancellation check.** Re-read the state file. If another session set `status: "cancelled"`, exit immediately (FR-NL22).
  8. **Loop back to step 2.**
- **FR-NL15** — The iteration loop body itself is rendered as numbered markdown instructions in each command. Per CLAUDE.md conventions, no runtime code is shipped; the agent follows the instructions textually.
- **FR-NL16** — Each command's iteration instructions MUST explicitly tell the agent: **do NOT accumulate iteration state in the conversation history**. All iteration state (counter, promise text, args) lives in the state file. The conversation may be auto-compacted at any time without losing the loop's progress.
- **FR-NL17** — Each iteration's command-specific work output MUST be persisted to the user's primary artifact (implementation plan, review report, etc.) — not summarized in the conversation. The next iteration reads the artifact, not the conversation. This is what makes auto-compaction safe (FR-NL24).

### Iteration mechanics — fresh-subagent mode (opt-in)

- **FR-NL18** — When `--loop-isolated` is passed, the outer command spawns a sub-agent per iteration via the Agent (Task) tool:
  1. Outer command maintains the loop counter and state file.
  2. For each iteration, outer command invokes the Task tool with the full command body as the sub-agent prompt, plus `[loop iteration N/M]` framing.
  3. Sub-agent returns its output to the outer command.
  4. Outer command scans the sub-agent's output for the completion promise.
  5. Outer command loops at the boundary.
- **FR-NL19** — Fresh-subagent mode does NOT rely on auto-compaction (each sub-agent starts fresh). It is the correct choice when context isolation matters (e.g., long-running plans with sensitive context, or workflows where prior iterations' conversation actively interferes with subsequent ones).
- **FR-NL20** — Trade-off documented in `docs/native-looping.md`: shared-context is faster and cheaper but accumulates context; fresh-subagent is slower and pricier but isolated. Default is shared-context (D-NL1).

### Termination conditions

- **FR-NL21** — Max-iterations reached: `status: "max-iterations-reached"`, exit_reason: `"Reached max_iterations=<N> without completion promise"`. The final message printed to the user names the loop-id and tells them how to resume past the cap.
- **FR-NL22** — Cancellation: `status: "cancelled"` (set by `/synthex:cancel-loop`), exit_reason: `"Cancelled by /synthex:cancel-loop"`. The next iteration boundary check exits immediately.
- **FR-NL23** — Completion promise emitted: `status: "completed"`, exit_reason: `"completion-promise-emitted"`, `exited_at` set.

### Auto-compaction safety

- **FR-NL24** — Shared-context loops rely on Claude Code's built-in auto-compaction to keep the conversation within the context window. Each command's iteration instructions MUST satisfy:
  - **All iteration state lives in `.synthex/loops/<loop-id>.json`**, never in the conversation. The state file is the durable source of truth.
  - **All iteration work output lives in the user's persistent artifact** (implementation plan, review report, ADR, etc.), not in the conversation.
  - **Iteration markers (`[loop <loop-id> iteration N/M]`) are short** so they survive compaction summaries.
  - **The state file path is re-derived from the loop-id in each iteration** — never cached in the conversation as a literal path.
- **FR-NL25** — On the iteration boundary, the agent's instructions explicitly say: "If you cannot recall the loop-id or the state file path, recover from `.synthex/loops/` by listing the directory and choosing the file with `status: running` matching this command. If multiple match, exit with an error directing the user to resume explicitly." This is the compaction-loss safeguard.

### Resume

- **FR-NL26** — `/synthex:loop --resume <loop-id>` reads `.synthex/loops/<loop-id>.json`, validates `status == "running"` (refuse otherwise with a clear message), and re-enters the iteration loop at step 2 of FR-NL14. The loop-id resolves to the same command + args; the resume command does NOT accept new args — it re-uses the persisted ones.
- **FR-NL27** — `/synthex:loop --resume-last` picks the most-recent state file (by `started_at`) with `status == "running"` in the current project and resumes it. If multiple running loops exist, prefer the one whose `session_id` matches the current Claude Code session; if none match, prefer the most-recent `last_updated`. Print the chosen loop-id before proceeding.
- **FR-NL28** — Resume MAY change isolation mode mid-loop only via explicit `--loop-isolated` / `--loop-shared` override on the resume invocation. Without an override, the persisted `isolation` value is used.

### Cancel

- **FR-NL29** — `/synthex:cancel-loop <loop-id>` reads the state file, sets `status: "cancelled"` and `exited_at`, writes back, prints a one-line confirmation. If the loop is in a terminal status, print "already <status>" and exit. Idempotent.
- **FR-NL30** — `/synthex:cancel-loop --all` cancels every running loop in `.synthex/loops/` in the current project. Prints one line per cancelled loop.
- **FR-NL31** — Cancellation does not interrupt an iteration in flight — the next iteration boundary check (FR-NL14 step 7) reads the state and exits. Worst case, the user waits one iteration before the loop stops.

### List

- **FR-NL32** — `/synthex:list-loops` enumerates `.synthex/loops/*.json` (excluding `.archive/`). Output format:

```
RUNNING (2):
  next-priority-3f2a    iter 5/20    started 2h ago      session abc12345
  team-implement-7e1d   iter 11/30   started 4h ago      session (none, resumable)

COMPLETED (3):
  refine-requirements-9b22  completed (promise) iter 3/20    finished 1h ago
  loop-write-rfc-1a08       max-iterations    iter 20/20   finished 30m ago
  team-plan-4c66            cancelled          iter 6/15    finished 5m ago
```

- **FR-NL33** — Sorted: running first (by `last_updated` desc), then terminal-status loops (by `exited_at` desc). Cap output at 20 most-recent terminal loops; mention truncation count if more exist.

### Teams-command specifics

- **FR-NL34** — Team commands' existing parallel-execution model (multiple teammates per iteration) is **internal to a single iteration**. `--loop` iterates the entire team-command workflow (spawn → assign tasks → wait for completion → write report → exit-condition-check) across iterations.
- **FR-NL35** — Each iteration of a team-command MUST tear down or reuse the team per the command's existing semantics. The plan does not change team lifecycle — only adds a re-invocation outer loop.
- **FR-NL36** — Team commands' completion-promise emission point is the same as their existing Ralph Loop Integration's emission point (when the plan/review/work is complete). The `<promise>X</promise>` XML convention is identical.

### Error handling

- **FR-NL37** — `--loop` without `--completion-promise` (and without `--resume`): refuse with error directing the user to add `--completion-promise <text>`.
- **FR-NL38** — `--prompt` and `--prompt-file` both supplied: refuse with error (mutually exclusive).
- **FR-NL39** — `--prompt-file <path>` where the file doesn't exist: refuse with error listing the path checked.
- **FR-NL40** — `--resume <loop-id>` where the state file doesn't exist: refuse with error and suggest `/synthex:list-loops`.
- **FR-NL41** — `--resume <loop-id>` where `schema_version` is unknown: refuse with error directing the user to delete the state file manually (FR-NL9). Never auto-mutate forward.
- **FR-NL42** — `--max-iterations` > 200: refuse with error (FR-NL13 ceiling).
- **FR-NL43** — Loop runs when the user invokes a command that has no native `--loop` support (e.g., `/synthex:write-adr --loop`): the command's `--loop` is undefined behavior. Recommended documentation in `docs/native-looping.md`: "Only commands listed in FR-NL1 support `--loop`." For unsupported commands, the flag is silently dropped (it's not a registered parameter; Claude Code parses it as a typo). The generic `/synthex:loop` is the workaround.

### Precedence with Ralph Loop plugin

- **FR-NL44** — When `--loop` is passed AND `.claude/ralph-loop.local.md` exists with `active: true`, the command:
  - Honors `--loop` (native looping takes precedence).
  - Prints a one-line advisory: `Note: --loop overrides Ralph Loop. The ralph-loop plugin's state file is unchanged; cancel the ralph loop separately if you want it gone.`
  - Does NOT mutate `.claude/ralph-loop.local.md`.
- **FR-NL45** — When `--loop` is NOT passed AND `.claude/ralph-loop.local.md` exists with `active: true`, the existing Ralph Loop Integration section governs. No behavior change for Ralph users.

### NFR

- **NFR-NL1** — Loop overhead (state file read + write + iteration marker) MUST be ≤ 200 ms per iteration boundary. Validated by Layer 2 fixture.
- **NFR-NL2** — Two concurrent loops in different Claude sessions on the same project MUST not corrupt each other's state files. Achieved by per-loop-id files (no shared file). Validated by Layer 2 fixture.

## Edge Cases

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| E1 | Loop crashes mid-iteration (process killed, network drop, etc.) — state file `last_updated` is stale, `status` still `"running"` | `/synthex:list-loops` shows it as RUNNING. User can `/synthex:loop --resume <loop-id>` to continue from `iteration + 1` (one iteration of work may be lost — acceptable per FR-NL14 step 3 durability boundary). Optionally, `--resume` could detect a `last_updated` older than N minutes and warn — deferred to Q-NL6. |
| E2 | Two sessions on the same project both running loops | Each session writes to its own `.synthex/loops/<loop-id>.json` (different loop-ids — auto-generated names diverge via random suffix, or user-supplied names diverge by definition). No collision. `/synthex:list-loops` shows both. NFR-NL2 validates. |
| E3 | User invokes `/synthex:next-priority --loop --name foo` twice while `foo` is running | Second invocation refuses with: `Loop "foo" is already running (iteration 4/20). Use /synthex:loop --resume foo to continue it, or /synthex:cancel-loop foo to stop it.` (FR-NL12) |
| E4 | Auto-compaction mid-iteration loses the conversation context including the loop-id | FR-NL25 safeguard: agent re-derives loop-id by listing `.synthex/loops/` and choosing the running file matching the current command. If unambiguous, continues. If ambiguous (>1 running loop for the same command), exits with error directing the user to resume explicitly. |
| E5 | Cancelled loop's state file lingers indefinitely | Per D-NL10: archived to `.synthex/loops/.archive/<loop-id>-<timestamp>.json` on the next loop invocation that touches `.synthex/loops/`. Archive directory is also gitignored. No automatic time-based cleanup in v1; Q-NL1 covers retention. |
| E6 | Loop reaches max-iterations with no promise emitted | Final message: `Loop "<loop-id>" reached max_iterations=<N> without completion. State preserved at .synthex/loops/<loop-id>.json. Resume with: /synthex:loop --resume <loop-id> --max-iterations <N + more>`. Status: `max-iterations-reached`. |
| E7 | Teams command's parallel teammates emit `<promise>X</promise>` from multiple teammate outputs simultaneously | The outer command scans only the **lead's** consolidated output (the same emission point as today's Ralph Loop Integration). Teammates' transient outputs are not promise sources. Documented in each team command's `--loop` instructions. |
| E8 | Generic loop's `--prompt-file` doesn't exist | FR-NL39 refusal with path listed. |
| E9 | User passes `--loop` to a command that doesn't list it in FR-NL1 (e.g., `/synthex:write-adr --loop`) | The flag is silently ignored (Claude Code's slash-command parameter parsing treats unknown args as typos). Documented in `docs/native-looping.md`. Workaround: `/synthex:loop --prompt "Write an ADR for X"`. |
| E10 | `.synthex/` directory does not exist (user has not run `/synthex:init`) | First `--loop` invocation creates `.synthex/loops/` lazily (`mkdir -p`). Does not touch `.synthex/config.yaml`. User can use looping without running `init` (documented). |
| E11 | User passes `--resume` AND a positional arg (e.g., `/synthex:next-priority --loop --resume foo @docs/plans/x.md`) | Refuse with error: `--resume re-uses the persisted args; do not pass new positional args alongside --resume`. |
| E12 | User cancels a loop, then re-invokes with `--name <same-id>` | Per FR-NL12: the cancelled state file is in terminal status, so the new invocation archives it (D-NL10) and starts a fresh loop with the same name. Print one-line confirmation noting the archive. |
| E13 | User invokes `--loop` on a command that has no completion-promise emission in its workflow (e.g., a hypothetical command that doesn't know when it's "done") | All commands in FR-NL1 already have a completion condition documented in their existing Ralph Loop Integration section. New commands gaining `--loop` MUST add a completion condition. The generic `/synthex:loop` defers the completion-condition definition to the user's prompt. |
| E14 | `--loop-isolated` with a command whose workflow internally writes to state shared across iterations (e.g., `next-priority` updates the plan) | Compatible — each sub-agent in fresh-subagent mode still reads the same on-disk plan file. The isolation is conversation-level, not filesystem-level. Documented in `docs/native-looping.md`. |
| E15 | `/synthex:list-loops` in a project with no `.synthex/loops/` directory | Print `No loops in this project.` and exit 0. |
| E16 | User runs `/synthex:cancel-loop --all` in a project with no running loops | Print `No running loops to cancel.` and exit 0. Idempotent. |
| E17 | Two iterations in shared-context mode emit `<promise>X</promise>` but the second one is the "real" completion (the first was a false positive in the agent's thinking text) | FR-NL14 step 6 scans only the agent's **final** response of each iteration (the one that ends the iteration), not the running thinking text. The agent's iteration instructions explicitly say: "Emit the promise only when you intend to terminate the loop." |
| E18 | User runs `/synthex:init` on a project that already has loops running | Per existing init behavior (no destructive changes), `.synthex/loops/` is untouched. Init's `.gitignore` step appends `.synthex/loops/` if missing. (Q-NL5 resolved here.) |

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D-NL1 | **Default isolation is shared-context.** `--loop-isolated` is opt-in. | User explicitly requested this in the spec. | Shared-context is faster (no per-iteration model spin-up), cheaper (no full-context re-priming), and matches the natural workflow of iterative work where each pass builds on prior context. Fresh-subagent is the correct fallback for users who need isolation. |
| D-NL2 | **State file location is `.synthex/loops/<loop-id>.json`** (one file per loop). | Need per-session independence and resume. | One file per loop avoids cross-loop write contention. `.synthex/loops/` is a clear, locality-matching path consistent with existing `.synthex/state.json` and `.synthex/config.yaml`. |
| D-NL3 | **Loop-id is auto-generated as `<command-slug>-<4-char-hex>`** when `--name` is omitted; user-supplied via `--name <slug>` otherwise. | Need stable identification for resume and cancel. | Short, mostly memorable, low collision risk in a single project's loop set. User-supplied names enable deterministic resume in scripted workflows. |
| D-NL4 | **Promise format is `<promise>X</promise>` XML tags**, identical to Ralph Loop. | Existing commands already emit this format for Ralph. | Zero change to commands' emission logic; the only change is who consumes the tag (native iteration loop instead of the Stop hook). |
| D-NL5 | **Max-iterations default is 20**, hard ceiling 200. | Matches Ralph's common usage. | Common Ralph usage settled on 20 as a balance between runaway protection and useful work. 200 ceiling prevents pathological runs while leaving room for known long-running plans. |
| D-NL6 | **Resume identification: explicit `--resume <loop-id>` or `--resume-last` sentinel.** | Need both deterministic and convenient resume paths. | `--resume <loop-id>` is scriptable; `--resume-last` is the "I just want to continue where I left off" UX. |
| D-NL7 | **Cancel mechanism: state-file mutation, polled at iteration boundary.** | No hooks, no inter-process signaling, no daemons. | Simplest possible mechanism. Latency is one iteration — acceptable. |
| D-NL8 | **Auto-compaction strategy: rely on Claude Code's built-in compaction; commands MUST persist iteration work to disk artifacts, not to conversation.** | FR-NL16, FR-NL17, FR-NL24. | The only correctness condition is that the loop counter and the iteration's work are durable outside the conversation. Auto-compaction handles the rest. |
| D-NL9 | **Per-iteration markers print to stdout** (`[loop <loop-id> iteration N/M]`). | Q-NL2 resolution. | Visibility costs almost nothing and helps users monitor progress. Markers are short and survive compaction. |
| D-NL10 | **Terminal-status loops are archived (not deleted) on the next invocation that touches `.synthex/loops/`** — moved to `.synthex/loops/.archive/<loop-id>-<timestamp>.json`. | E5 + Q-NL1. | Preserves history for debugging (Q-NL1 will decide retention policy in v2). Archive is gitignored. Avoids unbounded growth of the active loop directory. |
| D-NL11 | **Existing Ralph Loop Integration sections in `next-priority.md` and `team-implement.md` remain unchanged** except for one appended paragraph documenting `--loop` precedence (FR-NL44). | Non-goal: do not break Ralph users. | Two-surface coexistence is explicit; users on Ralph see no behavior change. |
| D-NL12 | **Generic `/synthex:loop` ships only in synthex, not synthex-plus.** | Q-NL3 partial resolution; synthex-plus's dependency on synthex means users have access either way. | Avoids duplicate command surfaces. v2 may add `/synthex-plus:loop` if a teams-flavored generic loop emerges as a need. |
| D-NL13 | **Iteration counter is incremented and persisted BEFORE the iteration's work begins** (FR-NL14 step 3). | Durability under crash. | Trades one iteration of lost work for accurate counter recovery. Alternative (increment after) creates the much worse failure mode of an under-counted loop running indefinitely. |
| D-NL14 | **Loop state files are gitignored.** | D-NL2 locality + per-developer state. | Committing state would create spurious diffs and leak session_ids. Matches `.synthex/state.json` precedent. |
| D-NL15 | **Shared docs at `plugins/synthex/docs/native-looping.md`** describe the iteration framework once; each command's `--loop` instructions cross-reference it. | Avoid drift across 9 commands. | Mirrors the multi-model-review plan's `docs/specs/multi-model-review/` pattern (D15 in that plan). |
| D-NL16 | **`/synthex:list-loops` and `/synthex:cancel-loop` are Haiku-backed** (lightweight). `/synthex:loop` is Sonnet-backed (general iteration). | Cost/latency tuning. | List/cancel are mechanical; generic loop may need to reason about arbitrary prompts. |
| D-NL17 | **`schema_version: 1` on the state file is reserved; unknown values cause `--resume` to refuse (no auto-mutation).** | FR-NL9, FR-NL41. | Forward-compat without surprising mutation. Matches `.synthex/state.json` (FR-UO22 from the shipped upgrade-onboarding plan). |
| D-NL18 | **The generic `/synthex:loop` does NOT support `--loop-isolated` requiring a "command body" — it just invokes the user's prompt either inline or as a sub-agent prompt.** | Generic loop has no command body to spawn. | The isolation flag still works (sub-agent mode runs the user's prompt as a fresh-context Task call). |

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q-NL1 | Loop history retention — keep archived state files forever, last 10, or time-bounded (e.g., 30 days)? | Affects `.synthex/loops/.archive/` growth on long-lived projects. Recommend: keep last 20 archived per project; document a manual purge command if users want more aggressive cleanup. Decide before Phase 3. | Open |
| Q-NL2 | Should iteration markers print to stdout always, or only when a TTY is detected / under a `--verbose` flag? | UX vs noise in scripted runs. Recommend: always print, one short line. Resolved → D-NL9. | Resolved |
| Q-NL3 | Should synthex-plus ship its own teams-flavored `/synthex-plus:loop` that loops a prompt under a team context? | v1 scope — recommend no (D-NL12). v2 may revisit if a strong use case emerges. | Open |
| Q-NL4 | Should loops support a `--checkpoint` flag that pauses for `AskUserQuestion` between iterations? | UX for human-in-the-loop iteration. Recommend defer to v2 — adds significant complexity to the iteration boundary and overlaps with `exit_on_milestone_complete`. | Open |
| Q-NL5 | If the user runs `/synthex:init` against an existing project with running loops, what happens to `.synthex/loops/`? | Recommend: init never touches `.synthex/loops/`. Init's `.gitignore` step appends `.synthex/loops/` if missing. Resolved → E18. | Resolved |
| Q-NL6 | Should `--resume` warn if `last_updated` is older than N minutes (suggesting the loop crashed)? | UX: stale resume might surprise users. Recommend: warn if `last_updated > 24h` ago, but still resume. Defer the threshold tuning to user feedback. | Open |
| Q-NL7 | When `--loop` is passed to a command whose existing Ralph Loop Integration is the primary completion-signal emission point, do we duplicate the emission logic or share it? | Implementation detail of FR-NL14 step 6. Recommend: share — the existing emission point's logic is identical; only the consumer changes. No duplication needed because the agent emits the same `<promise>X</promise>` regardless of which loop is active. | Open |
| Q-NL8 | Should loop-id slug validation allow uppercase or only lowercase? | Trivial UX. Recommend lowercase + hyphens for filesystem portability (current FR-NL11). Could relax to also allow uppercase if users complain. | Open |
| Q-NL9 | Does `/synthex:list-loops` need a `--json` output mode for scripting? | Nice-to-have. Defer to v2 unless a near-term scripted workflow needs it. | Open |
| Q-NL10 | Should the iteration marker include a remaining-budget estimate (e.g., context-window %, model-cost-so-far)? | High value but high implementation cost — requires hooks into Claude Code internals not currently exposed to commands. Defer to v2. | Open |

## Rollout

**Versioning is fully automated** by `.github/workflows/release.yml` (added to `main` while this plan was being authored). The workflow walks Conventional Commit subjects since the previous `v*` tag and lockstep-bumps both plugins + `marketplace.json` top-level. Implications for this plan:

- All native-looping commits MUST use Conventional Commits. `feat:` triggers a minor bump; `fix:` / `perf:` / `refactor:` / `chore:` / `docs:` / `test:` trigger patches. Subjects like `feat(loop): add /synthex:loop generic looping command` are the contract.
- Phase 7 contains **no version-bump or CHANGELOG-edit tasks**. The workflow owns those.
- Expected version landing: at least one `feat:` commit lands → minor bump. Given origin starts at synthex `0.7.1` / synthex-plus `0.3.2`, the native-looping release will likely land as synthex `0.8.0` / synthex-plus `0.4.0` (or whatever the next minor on both is when the workflow runs).
- No breaking changes — every command behaves identically when `--loop` is not passed. Ralph Loop Integration sections remain functional for users on the `ralph-loop` plugin.
- Commit messages MUST be authored via the `commit-message-author` agent per the updated `CLAUDE.md` release rules. Tech Lead and Lead FE delegate by default.

**Post-release cleanup convention** (matches the upgrade-onboarding precedent, commit `1518e2b`): after the release ships, this plan (`docs/plans/native-looping.md`) is archived via deletion, and any orphaned tests are removed in a follow-up `chore:` commit titled `chore: archive native-looping plan`.

## Phase 1 — State file schema + iteration framework primitives

Establishes the substrate. No user-visible command surface yet; this phase ships the shared docs and the helper instructions every later phase will reference.

### Milestone 1.1: Shared looping documentation and schema

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 1 | Author `plugins/synthex/docs/native-looping.md` — the canonical iteration-framework doc. Covers: state-file schema (FR-NL8), loop-id rules (FR-NL11), iteration mechanics for shared-context (FR-NL14) and subagent (FR-NL18), auto-compaction guarantees (FR-NL24, FR-NL25), promise convention (D-NL4), iteration markers (D-NL9), precedence with Ralph (FR-NL44). Used as cross-reference target by every `--loop`-bearing command. | M | None | FR-NL15, D-NL15 | done |
| 2 | Add Layer 1 schema validator for the state-file JSON Schema at `tests/schemas/loop-state-file.ts` and `.test.ts`. Validates the structure of FR-NL8 (required fields, enum values for `status` and `isolation`, schema_version=1). No runtime — just JSON Schema check against literal fixtures. 47 tests pass covering all required fields, enums, pattern checks, bounds, and cross-field consistency. | S | Task 1 | FR-NL8, FR-NL9 | done |
| 3 | Add Layer 1 baseline snapshot fixtures for every command in FR-NL1 BEFORE any `--loop` integration: capture observable output for `--loop`-less invocation. Used by later phases to assert byte-identical no-loop behavior. Store under `tests/__snapshots__/native-looping/baseline/`. **Resolution:** captured deterministic envelope (frontmatter + Parameters table + heading list) for all 8 FR-NL1 commands as JSON snapshots; existence + structure validated by `native-looping-baselines.test.ts` (33 tests). Note: the plan AC referred to "9 commands plus 4 teams commands" but FR-NL1 actually lists 8 total (4 synthex + 4 synthex-plus); all 8 captured. | M | None | FR-NL1 non-regression | done |

**Task 1 Acceptance Criteria:**
- `[T]` File exists; renders as valid markdown.
- `[T]` Contains all eight cross-reference anchor IDs (one per FR group: state, loop-id, shared-iter, subagent-iter, compaction-safety, promise-emission, markers, precedence). Validated by raw-string check.
- `[H]` Reads as a clear, complete spec for an agent following `--loop` instructions.

**Task 2 Acceptance Criteria:**
- `[T]` JSON Schema validator parses fixtures with all FR-NL8 fields present.
- `[T]` Rejects fixtures missing `schema_version`, `loop_id`, `command`, `iteration`, or `status`.
- `[T]` Rejects unknown `status` enum values.

**Task 3 Acceptance Criteria:**
- `[T]` Snapshots exist for all 9 commands in FR-NL1 plus the four candidate teams commands.
- `[T]` Each snapshot captures only the deterministic envelope (parameters table, top-level structure) — LLM-generated body text is redacted to `<<body>>` placeholders.

**Parallelizable:** Tasks 1, 2, 3 are independent. Task 2 reads Task 1's schema definition but the schema itself can be lifted from FR-NL8 directly.
**Milestone Value:** Cross-reference doc and baselines exist. Every subsequent phase can cite a single source for iteration mechanics and detect non-regressions.

## Phase 2 — Generic `/synthex:loop` command

Proves out the iteration framework on a standalone surface BEFORE adding `--loop` to existing commands. If the framework has bugs, they surface here first without contaminating any existing command.

### Milestone 2.1: Author the generic loop command

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 4 | Author `plugins/synthex/commands/loop.md`. YAML frontmatter `model: sonnet` (D-NL16). Parameters table per FR-NL4. Iteration body cross-references `plugins/synthex/docs/native-looping.md` for the framework, and inlines the generic-loop-specific instructions: read `--prompt` or `--prompt-file`, validate `--completion-promise` is present (FR-NL37), validate file existence (FR-NL39), generate or accept loop-id (FR-NL11), persist state file, enter iteration loop (FR-NL14), print iteration markers (D-NL9), handle resume (FR-NL26, FR-NL27), handle isolation mode (FR-NL18). | L | Task 1 | FR-NL4, FR-NL5, FR-NL14 | done |
| 5 | Register `loop.md` in `plugins/synthex/.claude-plugin/plugin.json` `commands` array (alphabetical insertion after `init.md`). | S | Task 4 | FR-NL5 | done |
| 6 | Update `plugins/synthex/commands/init.md` Step 5 (the `.gitignore` step) to append `.synthex/loops/` to `.gitignore`. Matches D-NL14, FR-NL10. | S | None | FR-NL10 | done |
| 7 | Update `plugins/synthex-plus/commands/team-init.md` Step 6 (the `.gitignore` step) to append `.synthex/loops/` to `.gitignore`. Same rationale. | S | None | FR-NL10 | done |

**Task 4 Acceptance Criteria:**
- `[T]` Command file exists with `model: sonnet` frontmatter.
- `[T]` Parameters table contains all eight rows from FR-NL4.
- `[T]` Refusal cases (FR-NL37, FR-NL38, FR-NL39, FR-NL40, FR-NL41, FR-NL42) each appear as labeled error paths in the command body (raw-string anchor checks).
- `[T]` Resume logic delegates to FR-NL26 / FR-NL27 and re-uses persisted args (no positional-arg re-entry).
- `[H]` Iteration body is concise — heavy text lives in `docs/native-looping.md`, the command links rather than duplicating.

**Task 5 Acceptance Criteria:**
- `[T]` `plugin.json` parses; new command registered.

**Task 6 Acceptance Criteria:**
- `[T]` `init.md` `.gitignore` step references `.synthex/loops/`.

**Task 7 Acceptance Criteria:**
- `[T]` `team-init.md` `.gitignore` step references `.synthex/loops/`.

**Parallelizable:** Tasks 4–7 are mostly independent after Task 1 lands. Task 5 depends on Task 4.
**Milestone Value:** End-to-end usable native loop on the generic surface. Users can already loop arbitrary prompts; the iteration framework is observable and debuggable before adding integration surface area.

## Phase 3 — List, cancel, and resume command surfaces

`/synthex:list-loops` and `/synthex:cancel-loop` are standalone commands; `/synthex:loop --resume` is already handled in Phase 2 (Task 4).

### Milestone 3.1: Loop management commands

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 8 | Author `plugins/synthex/commands/list-loops.md`. YAML frontmatter `model: haiku` (D-NL16). Enumerates `.synthex/loops/*.json` (excluding `.archive/`), parses each, formats per FR-NL32. Sorted per FR-NL33. Handles missing directory (FR-NL32 + E15). | M | Task 1 | FR-NL32, FR-NL33 | done |
| 9 | Register `list-loops.md` in `plugins/synthex/.claude-plugin/plugin.json`. | S | Task 8 | FR-NL5 | done |
| 10 | Author `plugins/synthex/commands/cancel-loop.md`. YAML frontmatter `model: haiku`. Parameters: `loop_id` (positional, required unless `--all`), `--all` (flag). Mutates state file `status: "cancelled"`, `exited_at`, prints confirmation. Idempotent (FR-NL29 already-terminal handling). | M | Task 1 | FR-NL29, FR-NL30, FR-NL31 | done |
| 11 | Register `cancel-loop.md` in `plugins/synthex/.claude-plugin/plugin.json`. | S | Task 10 | FR-NL5 | done |
| 12 | Author the archive logic as a documented step in `docs/native-looping.md` (D-NL10): when any loop command touches `.synthex/loops/`, it scans for terminal-status files older than the current invocation and moves them to `.synthex/loops/.archive/<loop-id>-<timestamp>.json`. Document the .archive directory creation. | S | Task 1 | D-NL10 | done |

**Task 8 Acceptance Criteria:**
- `[T]` Command file exists with `model: haiku` frontmatter.
- `[T]` Output format matches FR-NL32 (raw-string anchor checks for `RUNNING (`, `COMPLETED (` section headers).
- `[T]` Missing-directory path prints `No loops in this project.` (E15).

**Task 10 Acceptance Criteria:**
- `[T]` Command file exists with `model: haiku` frontmatter.
- `[T]` `--all` path documented; idempotent re-cancel documented.
- `[T]` Cancel-of-terminal-status path prints `already <status>` and exits 0 (FR-NL29).

**Task 12 Acceptance Criteria:**
- `[T]` `docs/native-looping.md` contains an "Archive" section documenting the rule.

**Parallelizable:** Tasks 8 and 10 can run in parallel after Task 1. Tasks 9 and 11 follow their respective predecessors.
**Milestone Value:** Full loop management surface — start (Phase 2), list, cancel, resume — available before any existing command grows a `--loop` flag.

## Phase 4 — Integrate `--loop` into synthex commands

Adds the flag to `next-priority`, `write-implementation-plan`, `refine-requirements`, `review-code`. Each integration is the same shape: extend Parameters table, add a "Native Looping" section that cross-references `docs/native-looping.md`, document the precedence rule with Ralph Loop (FR-NL44).

### Milestone 4.1: next-priority `--loop`

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 13 | Extend `plugins/synthex/commands/next-priority.md` Parameters table with the five new `--loop` rows (FR-NL2). Preserve the existing `exit_on_milestone_complete` row. | S | Phase 2 | FR-NL1, FR-NL2 | done |
| 14 | Add a new "Native Looping" section to `next-priority.md`, positioned **immediately after** the existing "Ralph Loop Integration" section. Cross-references `docs/native-looping.md`. Inlines: completion-promise emission point (same as Ralph integration's emission point — `<promise>{completion_promise}</promise>` when plan is done or milestone-boundary exit fires), iteration body wrapper, precedence note (FR-NL44, FR-NL45). | M | Task 13 | FR-NL14, FR-NL44, FR-NL45 | done |
| 15 | Update the **existing** "Ralph Loop Integration" section in `next-priority.md` to append one paragraph (D-NL11) noting that `--loop` overrides Ralph Loop with documented precedence (FR-NL44). The rest of the section stays byte-identical. | S | Task 14 | FR-NL44, D-NL11 | done |

### Milestone 4.2: write-implementation-plan `--loop`

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 16 | Extend `plugins/synthex/commands/write-implementation-plan.md` Parameters table with the five new `--loop` rows. | S | Phase 2 | FR-NL1, FR-NL2 | done |
| 17 | Add a "Native Looping" section to `write-implementation-plan.md`. Define the completion-promise emission point: emit `<promise>{completion_promise}</promise>` when the plan has been written AND a follow-up iteration has nothing new to add (the agent's judgment — typically when the plan covers all PRD requirements without TBDs). | M | Task 16 | FR-NL14 | done |

### Milestone 4.3: refine-requirements `--loop`

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 18 | Extend `plugins/synthex/commands/refine-requirements.md` Parameters table with the five new `--loop` rows. | S | Phase 2 | FR-NL1, FR-NL2 | done |
| 19 | Add a "Native Looping" section to `refine-requirements.md`. Emission point: when the PRD's open questions and ambiguities are resolved enough to start implementation planning. | M | Task 18 | FR-NL14 | done |

### Milestone 4.4: review-code `--loop`

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 20 | Extend `plugins/synthex/commands/review-code.md` Parameters table with the five new `--loop` rows. | S | Phase 2 | FR-NL1, FR-NL2 | done |
| 21 | Add a "Native Looping" section to `review-code.md`. Emission point: when a review cycle ends with zero blocking findings AND zero recommended changes the reviewer would still pursue. (Distinct from the existing multi-model-review consolidation flow — `--loop` wraps the entire review-code invocation, not the per-cycle consolidation.) | M | Task 20 | FR-NL14 | done |

**Acceptance Criteria pattern (Tasks 13, 16, 18, 20):**
- `[T]` Parameters table contains five new rows; raw-string anchor checks for each parameter name.
- `[T]` Existing Parameters table rows are byte-identical to pre-change.

**Acceptance Criteria pattern (Tasks 14, 17, 19, 21):**
- `[T]` "Native Looping" section exists with the standard four sub-anchors (Emission Point, Iteration Body, Precedence with Ralph Loop, See Also).
- `[T]` Cross-reference to `docs/native-looping.md` present as a literal link.
- `[T]` Layer 1 baseline snapshot (Task 3) of no-loop behavior is byte-identical to pre-change.
- `[H]` Emission point reads naturally for that command's domain.

**Acceptance Criteria for Task 15:**
- `[T]` Existing "Ralph Loop Integration" section byte-identical except for the appended paragraph.
- `[T]` Appended paragraph mentions `--loop` precedence (FR-NL44 phrasing).

**Parallelizable:** Milestones 4.1–4.4 can run in parallel. Within a milestone, the Parameters-table task and the Native-Looping-section task are sequenced.
**Milestone Value:** All four iteration-friendly synthex commands support `--loop`. Existing Ralph users see no behavior change.

## Phase 5 — Integrate `--loop` into synthex-plus teams commands

Same shape as Phase 4 but applied to four teams commands. Note that `team-implement.md` already has a Ralph Loop Integration section; the other three (`team-review`, `team-plan`, `team-refine`) do not.

### Milestone 5.1: team-implement `--loop`

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 22 | Extend `plugins/synthex-plus/commands/team-implement.md` Parameters table with the five new `--loop` rows. | S | Phase 2 | FR-NL1, FR-NL2 | pending |
| 23 | Add a "Native Looping" section to `team-implement.md` after the existing "Ralph Loop Integration" section. Emission point: same as the existing Ralph integration's emission point — when the team has completed all assigned tasks across the implementation plan. Document the lead-output-only promise-scan rule (E7). Document team-lifecycle interaction (FR-NL35): each iteration MAY reuse or tear down the team per the command's existing logic — `--loop` does not change team lifecycle. | L | Task 22 | FR-NL14, FR-NL34, FR-NL35, FR-NL36, E7 | pending |
| 24 | Append the `--loop` precedence paragraph (D-NL11) to the existing "Ralph Loop Integration" section. Rest stays byte-identical. | S | Task 23 | FR-NL44, D-NL11 | pending |

### Milestone 5.2: team-review, team-plan, team-refine `--loop`

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 25 | Extend `plugins/synthex-plus/commands/team-review.md` Parameters table with the five new `--loop` rows. Add a "Native Looping" section (no existing Ralph integration to merge with — new top-level section). Emission point: when the review team's consolidated report has no remaining open critiques. | M | Phase 2 | FR-NL1, FR-NL2, FR-NL14, FR-NL34 | pending |
| 26 | Extend `plugins/synthex-plus/commands/team-plan.md`. Same shape. Emission point: when the team's collaborative plan covers the PRD without TBDs. | M | Phase 2 | FR-NL1, FR-NL2, FR-NL14, FR-NL34 | pending |
| 27 | Extend `plugins/synthex-plus/commands/team-refine.md`. Same shape. Emission point: when the team's refined requirements have resolved all open questions. | M | Phase 2 | FR-NL1, FR-NL2, FR-NL14, FR-NL34 | pending |

**Acceptance Criteria pattern:**
- `[T]` Parameters table contains five new rows.
- `[T]` Native Looping section exists with the four standard sub-anchors.
- `[T]` Lead-output-only promise scan documented (E7).
- `[T]` Team-lifecycle independence documented (FR-NL35).
- `[T]` Layer 1 baseline snapshot byte-identical.

**Parallelizable:** Milestones 5.1 and 5.2 can run in parallel; tasks 25, 26, 27 within 5.2 can run in parallel.
**Milestone Value:** All teams commands support `--loop`. Teams users get the same native looping ergonomics as solo synthex users.

## Phase 6 — Tests (three-layer pyramid)

### Milestone 6.1: Layer 1 schema validators (instant, free)

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 28 | Author `tests/schemas/loop-command.ts` and `.test.ts`. Validates `plugins/synthex/commands/loop.md` structure: frontmatter, eight Parameters rows, refusal-case anchors, resume-logic anchors. | M | Task 4 | FR-NL4 | pending |
| 29 | Author `tests/schemas/list-loops.ts` and `.test.ts`. Validates `list-loops.md`: frontmatter, output-format anchors. | S | Task 8 | FR-NL32 | pending |
| 30 | Author `tests/schemas/cancel-loop.ts` and `.test.ts`. Validates `cancel-loop.md`: frontmatter, `--all` path, idempotent re-cancel path. | S | Task 10 | FR-NL29, FR-NL30 | pending |
| 31 | Extend existing schema tests for `next-priority`, `write-implementation-plan`, `refine-requirements`, `review-code`, `team-implement`, `team-review`, `team-plan`, `team-refine` to assert presence of `--loop`-related Parameters rows AND a "Native Looping" section. Existing schema tests for these commands stay green. | M | Tasks 13–27 | FR-NL1, FR-NL2 | pending |
| 32 | Author `tests/schemas/native-looping-doc.ts` and `.test.ts`. Validates `plugins/synthex/docs/native-looping.md` structure: eight cross-reference anchor IDs (FR-NL group anchors). | S | Task 1 | FR-NL15 | pending |
| 33 | Reuse / extend `tests/schemas/loop-state-file.test.ts` from Task 2 to cover edge cases: missing required fields, unknown `status` enum, unknown `schema_version`. | S | Task 2 | FR-NL8, FR-NL9 | pending |

**Acceptance Criteria pattern:**
- `[T]` Validator catches structural defects (missing frontmatter, missing required blocks, missing rows).
- `[T]` Tests run in Vitest's `tests/schemas/` flow with no new dependencies.

### Milestone 6.2: Layer 2 behavioral fixtures (manual trigger)

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 34 | Author `tests/fixtures/native-looping/state-file-lifecycle/`. Sub-fixtures: `create`, `increment`, `complete`, `cancel`, `max-iter`, `crash-recover`. Each fixture has a pre-state directory layout, the state-file mutation applied by the iteration logic, and the expected post-state. Use vitest + temp dirs (matches `upgrade-nudge-hook-behavioral.test.ts` pattern from upgrade-onboarding Phase 5.2). | L | Task 4 | FR-NL14, FR-NL21–FR-NL23 | pending |
| 35 | Author `tests/fixtures/native-looping/concurrent-sessions/`. Two pre-state state files for two different loop-ids; assert that mutating one does not affect the other. Validates NFR-NL2. | M | Task 34 | NFR-NL2, E2 | pending |
| 36 | Author `tests/fixtures/native-looping/resume-flow/`. Three sub-fixtures: `resume-by-id`, `resume-last`, `resume-rejects-terminal-status`. | M | Task 4 | FR-NL26, FR-NL27, FR-NL40 | pending |
| 37 | Author timing fixture: invoke the iteration-boundary primitives 30 times; assert p95 wall-clock for state-file read + increment + write is ≤ 75 ms (loose for CI overhead; NFR-NL1 target is 200 ms full iteration boundary which includes the marker print). | S | Task 34 | NFR-NL1 | pending |
| 38 | Author promptfoo behavioral assertions for `/synthex:loop` covering: refusal on missing `--completion-promise`, refusal on both `--prompt` and `--prompt-file`, refusal on missing prompt file, refusal on `--max-iterations > 200`, refusal on `--resume` for unknown loop-id. Reuse the existing promptfoo provider. | M | Task 4 | FR-NL37–FR-NL42 | pending |
| 39 | Author promptfoo behavioral assertion for the Ralph-precedence advisory line (FR-NL44): when `--loop` is set and `.claude/ralph-loop.local.md` is `active: true`, the command prints the advisory and does NOT mutate the Ralph state file. | M | Phase 4 | FR-NL44, FR-NL45 | pending |

**Acceptance Criteria pattern:**
- `[T]` Each fixture exits 0; observed post-state matches expected.
- `[T]` Promptfoo assertions pass when run by the user via `npx promptfoo eval --filter-pattern "NL-B"` (cache population is manual, matches UO-B convention).

### Milestone 6.3: Layer 3 deferred

Layer 3 (full multi-model semantic validation) is out of scope for v1. Loop semantics are mechanical enough that Layer 1 + Layer 2 cover the risk surface; the LLM is following deterministic state-file rules, not generating subjective content.

**Parallelizable:** Tasks 28–33 can run in parallel; Tasks 34–37 are sequenced by Task 34. Tasks 38–39 can run in parallel with Tasks 34–37 after Phase 4 lands.
**Milestone Value:** Confidence the iteration framework behaves correctly under crash, concurrent-session, resume, and refusal paths.

## Phase 7 — Docs + release

### Milestone 7.1: README, CHANGELOG, version bumps

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 40 | Update `plugins/synthex/README.md` — add a "Native Looping" section that summarizes the surface (one paragraph + a one-liner example for `/synthex:loop` and one for `next-priority --loop`). Cross-references `plugins/synthex/docs/native-looping.md` for the full spec. | S | All Phase 4 tasks | Docs | pending |
| 41 | Update `plugins/synthex-plus/README.md` — add a "Native Looping" section noting the same surface is available on team commands; cross-reference the synthex doc. | S | All Phase 5 tasks | Docs | pending |
| 42 | Update `README.md` at the repo root — add a one-line bullet under the latest synthex highlights. | S | All Phase 4–5 tasks | Docs | pending |
| 43 | ~~Update `CHANGELOG.md`~~ — **Removed**: CHANGELOG is generated by `.github/workflows/release.yml` from Conventional Commit subjects. All native-looping commits MUST use `feat:` / `fix:` / `chore:` etc. prefixes; the workflow handles the release notes. | — | — | Rollout | n/a |
| 44 | ~~Bump versions~~ — **Removed**: version bumps in `plugins/*/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` are owned by the automated release workflow. Hand-editing is forbidden per the updated CLAUDE.md release rules. | — | — | Rollout | n/a |
| 45 | Update `CLAUDE.md` if it contains a list of synthex commands — add `/synthex:loop`, `/synthex:list-loops`, `/synthex:cancel-loop`. | S | Task 4, 8, 10 | Docs | pending |

**Acceptance Criteria:**
- `[T]` README updates land in the same `feat:` commit so the auto-generated CHANGELOG entry references them.
- `[T]` CLAUDE.md command-table updates land before the merge to main.
- `[H]` Conventional Commit subjects on every commit (verified by inspecting the auto-generated CHANGELOG entry after release).
- Tasks 43 and 44 are now `n/a` — versioning and CHANGELOG are workflow-owned.

### Milestone 7.2: Post-release cleanup (deferred to a follow-up commit)

| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 46 | After the release is merged: `git rm docs/plans/native-looping.md` and any orphaned test files associated with this plan. Commit titled `chore: archive native-looping plan`. Matches the upgrade-onboarding precedent (commit `1518e2b`). | S | Release merged | Rollout convention | pending |

**Parallelizable:** Tasks 40–45 are mostly independent. Task 46 follows the release.
**Milestone Value:** Release ships; repo follows the established post-release-cleanup pattern.

---

### Critical Files for Implementation

- /Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex/commands/loop.md *(new — generic loop command)*
- /Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex/docs/native-looping.md *(new — shared iteration-framework spec)*
- /Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex/commands/next-priority.md *(amended — add `--loop`, append Ralph precedence paragraph)*
- /Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/commands/team-implement.md *(amended — add `--loop`, append Ralph precedence paragraph)*
- /Users/ajbrown/Projects/bluminal/claude-plugins/.claude-plugin/marketplace.json *(version bumps + synthex 0.7.0 / synthex-plus 0.4.0)*
# Implementation Plan: Default `--completion-promise` for Native Loops

**Source:** User request: "When `--completion-promise` is not provided, just default it to "ALLDONE"+<session_id>".

## Overview

Today `loop-step.sh begin` exits 1 when no `--completion-promise` is given (lines ~596–600), so every `--loop` invocation has to spell one out. This plan makes the flag optional. `begin` computes a default of `ALLDONE<session_id>`, stores it in the state file's `completion_promise` field, and prints it. The five loop-capable commands and `native-looping.md` document the default and read the promise back from the state file instead of requiring the user to supply it.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | The default is the literal concatenation `ALLDONE<session_id>`, with no separator (e.g. `ALLDONE3f2a9c1e-…`). *Assumed; confirm.* | The user's wording "ALLDONE"+<session_id>. | Follows the request literally. The session id makes accidental matches practically impossible. |
| D2 | When no session id is available (non-Claude hosts, empty `$CLAUDE_CODE_SESSION_ID`), the default falls back to `ALLDONE<loop_id>`. *Assumed; confirm.* | Codex and Grok hosts have no session id. | The value stays unique per loop, never matches accidental text, and never blocks `begin`. |
| D3 | `loop-step.sh begin` is the single place the default is computed. It stores the value in `completion_promise` and prints `completion promise: <value>`. Command prose reads the value from the state file or the `begin` output and never recomputes it. The no-shell fallback (FR-HM3) computes it with the same rule. *Assumed; confirm.* | Five commands share the loop protocol. | One source of truth prevents drift between the script and the prose. The agent needs the exact string it must emit. |
| D4 | An explicit `--completion-promise` always wins. `--resume` and `--resume-last` keep the stored promise unchanged. *Assumed; confirm.* | Backward compatibility. | Existing invocations and in-flight loops behave exactly as before. |
| D5 | No schema change: the state file stays at v1. *Assumed; confirm.* | `completion_promise` is already a required, non-empty string. | The default fills that field, so the file's shape does not change. |

## Phase 1: Optional Completion Promise

### Milestone 1.1: Default Promise in Script, Commands, and Docs

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 1 | **Script.** In `plugins/synthex/scripts/loop-step.sh begin`, replace the "required" error with the D1/D2 default. Print `completion promise: <value>`. Update the usage line and the `# Exit codes:` header (missing promise is no longer an exit-1 cause). | S | None | pending |
| 2 | **Commands and docs.** In `commands/loop.md`, `next-priority.md`, `write-implementation-plan.md`, `review-code.md`, `refine-requirements.md`, and `docs/native-looping.md`, change "Required with `--loop` (unless `--resume*`)" to "Default: `ALLDONE<session_id>` (falls back to `ALLDONE<loop_id>`)". Tell the loop protocol to take the promise from the `begin` output or the state file. Add the D2 rule to the no-shell fallback. Regenerate the wrappers with `node plugins/synthex/scripts/generate-codex-skills.mjs`. | M | None (contract fixed by D1–D3) | pending |
| 3 | **Confirm defaults.** Run a dry-run `/synthex:loop --prompt "…" --max-iterations 1` with no promise, on Claude Code and on one non-Claude host. Show the user the printed default. | S | Tasks 1, 2 | pending |

**Acceptance criteria**

- Task 1
  - [T] `loop-step-behavioral.test.ts`: `begin --session-id X` with no promise stores `ALLDONEX`. With no session id, it stores `ALLDONE<loop_id>`. An explicit promise is stored verbatim. `--resume` and `--resume-last` leave the stored promise unchanged. `begin` stdout includes `completion promise: <value>`.
  - [T] `loop-state-file.test.ts` / `loop-state-lifecycle.test.ts` pass with `schema_version` still 1.
  - [T] The `tests/compat/lib/script-smoke.mjs` loop-step case is updated to call `begin` with no promise and expect exit 0. The exit-code header matches the actual behavior.
- Task 2
  - [T] `native-looping-wiring.test.ts` / `loop-command.test.ts` assert that none of the 5 commands says "Required with `--loop`" for `--completion-promise`, and that each one (plus `native-looping.md`) documents the `ALLDONE<session_id>` default and the `ALLDONE<loop_id>` fallback.
  - [T] `generate-codex-skills.mjs --check` passes. The D17 byte-budget tests (`review-code-cold-path.test.ts`, `cold-path-split-2.test.ts`) still pass.
- Task 3
  - [H] The user confirms the D1 format and the D2 fallback after seeing both printed defaults. If they do not, amend D1/D2 before merging.

**Parallelizable:** Tasks 1 and 2 can run at the same time, because D1–D3 fix the contract between them. Task 3 is the gate before merge.
**Milestone Value:** `--loop` works without a hand-written promise on every host. The default is unique per session or loop, and the agent sees it at `begin`.

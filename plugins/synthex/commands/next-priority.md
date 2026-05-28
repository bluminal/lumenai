---
model: opus
---

# Next Priority

Automatically identify and execute the next highest-priority tasks from the implementation plan using the Tech Lead sub-agent for orchestrated execution.

> **If `--loop` appears in your invocation arguments, STOP and jump to [`## Native Looping`](#native-looping) below before reading anything else.** The flag switches this command into a self-driven iterative loop; the rest of this file describes the **single iteration body**. Treating `--loop`, `--completion-promise`, or `--max-iterations` as `/loop`-skill wrapper flags or as unknown arguments silently breaks the loop after one pass.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `implementation_plan_path` | Path to the implementation plan markdown file | `docs/plans/main.md` | No |
| `concurrent_tasks` | Number of parallel tasks to work on simultaneously | Value from `next_priority.concurrent_tasks` config, or `3` | No |
| `exit_on_milestone_complete` | When running under `--loop`, emit the completion promise after finishing a milestone even if later milestones remain. Useful for inserting a checkpoint between milestones. | `false` | No |
| `--loop` | Enable native looping (FR-NL1/FR-NL2). When set, the command iterates per the "Native Looping" section below until the completion promise is emitted or `--max-iterations` is reached. | off | No |
| `--completion-promise <string>` | Promise text the agent emits as `<promise>X</promise>` to terminate the loop. | — | Required with `--loop` (unless `--resume*`) |
| `--max-iterations <int>` | Iteration cap (FR-NL13). Hard ceiling 200. | `20` | No |
| `--loop-isolated` | Fresh-subagent isolation mode per iteration (FR-NL18). | off (shared-context default) | No |
| `--name <slug>` | User-supplied loop-id slug `^[a-z0-9][a-z0-9-]{0,63}$`. | auto: `<command-slug>-<4-char-hex>` | No |

## Core Responsibilities

You are a senior engineering manager ensuring the successful delivery of a software application according to the product specification and implementation plan. You combine:

- Deep understanding of project goals and customer empathy
- Tactical excellence balanced with strategic vision
- Commitment to on-time, on-budget delivery with high quality standards

## Workflow

### 1. Analyze the Implementation Plan

Read `@{implementation_plan_path}` and identify the top `{concurrent_tasks}` most critical tasks based on:

- **Priority ratings** — higher priority tasks first
- **Dependency chains** — prerequisites must be complete before dependent tasks can start
- **Business value** — tasks that deliver the most user-facing value
- **Current milestone** — stay within the current phase and milestone boundaries

**Plan complete:** If every task in the plan has status `done`, inform the user: "All tasks in the implementation plan are complete. No work to execute." When running under `--loop`, this is the primary emission condition — emit the completion promise per [Emission Point](#emission-point) below.

**No actionable tasks this iteration:** If non-`done` tasks exist but none are actionable right now (e.g., all remaining tasks are blocked, awaiting `[H]` user approval, or have unsatisfied dependencies), do **NOT** emit the completion promise. Instead, inform the user which tasks remain and why they are not actionable. Under `--loop`, the next iteration re-runs the workflow — the user may be completing manual tasks or `[H]` reviews in a separate thread, which will unblock work for the next pass.

**Critical Rule:** Only select tasks that are truly independent for parallel execution. Tasks with dependencies on each other MUST be sequenced — they cannot run in parallel.

**Critical Rule:** Complete all tasks in the current milestone before advancing to the next one. Never cross phase boundaries in a single session.

### 2. Pre-work Search

Before starting execution, use sub-agents to search the codebase for existing implementations relevant to the selected tasks. Avoid duplicating work that already exists.

### 3. Mark Tasks In Progress

Immediately update the implementation plan marking selected tasks as "in progress".

### 4. Set Up Work Environments

For each selected task, create a git worktree using the configured base path and branch prefix:

```bash
git worktree add {worktrees.base_path}/{worktrees.branch_prefix}[task-id]-[short-description] -b {worktrees.branch_prefix}[task-id]-[short-description]
```

> **Default:** `.claude/worktrees/` (aligns with Claude Code's own convention). Override via `worktrees.base_path` in `.synthex/config.yaml`. Ensure the base path is in your `.gitignore`.

### 5. Delegate to Tech Lead

**This is the key orchestration step.** For each task, launch a **Tech Lead sub-agent** instance with:

- The specific task description and acceptance criteria (with their type tags: `[T]`, `[H]`, `[O]`)
- The worktree path as the working directory
- Context about the project (link to specs, PRD, design system docs)
- Acceptance criteria instructions:
  - For each `[T]` criterion: write an automated test that proves it, ensure the test passes, and report the test file path and test name in the completion summary
  - For `[H]` criteria: flag them in the completion summary as requiring user approval — do NOT consider the task complete until the user has been interviewed
  - For `[O]` criteria: note them as post-deployment metrics — no action required during implementation
- Git workflow instructions:
  - Work in the assigned worktree
  - Commit changes with descriptive messages using `git commit --no-gpg-sign`
  - **Author the commit message via the `commit-message-author` utility agent** (Haiku) rather than writing it inline. Pass the staged diff, any task-level issue key (only if known with certainty — e.g., a Jira key embedded in the worktree branch name or supplied to you), and a breaking-change flag if applicable. The agent detects the project's commit convention from `git log` and defaults to Conventional Commits 1.0.0. Pipe its returned message into `git commit -F -`.
  - Do NOT merge — merging is handled by this command after completion
  - Respect pre-commit hooks and address all failures

The Tech Lead will:
- Analyze the task and determine which sub-agents are needed
- Orchestrate implementation (coding, frontend work, security review, testing)
- Write tests that prove each `[T]` acceptance criterion before marking the task complete
- Provide incremental progress updates
- Report completion with a summary including test linkage (which test proves which `[T]` criterion)

### 6. Monitor Progress

Monitor the Tech Lead instances for:
- Incremental progress updates
- Completion notifications
- Blockers or failures that need intervention

### 7. Validate Completion

For each completed task, validate acceptance criteria by type:

**`[T]` criteria (testable):**
- Verify that a test exists for each `[T]` criterion — the Tech Lead's summary must include the test file path and test name for each one
- Run the test suite and confirm all tests pass
- If any `[T]` criterion lacks a linked test, send the task back to the Tech Lead to write the missing test

**`[H]` criteria (human-validated):**
- Present the implemented work to the user using `AskUserQuestion`
- Show what was built, how it addresses the criterion, and any alternatives considered
- The user must explicitly approve each `[H]` criterion before the task can proceed to merge
- If the user rejects, send specific feedback back to the Tech Lead for iteration

**`[O]` criteria (observational):**
- No validation at this stage — note them as post-deployment metrics in the completion record

**General validation:**
- Confirm all tests pass (not just acceptance-linked tests)
- Review the Tech Lead's summary of changes and decisions

### 8. Merge Results

**Pre-merge gate:** A task may only be merged when:
- All `[T]` criteria have linked, passing tests
- All `[H]` criteria have been approved by the user
- General validation (Step 7) has passed

After the gate is satisfied:

```bash
git merge --ff-only {worktrees.branch_prefix}[task-id]-[short-description]
```

If fast-forward merge is not possible, attempt a merge commit. If conflicts arise, resolve them carefully.

After merging, clean up the worktree:

```bash
git worktree remove {worktrees.base_path}/{worktrees.branch_prefix}[task-id]-[short-description]
```

### 9. Update the Plan

Mark completed tasks as "done" in the implementation plan with:
- Completion notes
- **Test linkage:** For each `[T]` criterion, record the test file and test name that proves it (e.g., `[T] Email validation → src/auth/__tests__/login.test.ts: "validates email format"`)
- **`[H]` approval record:** Note that human approval was obtained for `[H]` criteria
- Any learnings or discoveries
- Follow-up tasks identified during implementation

Update `@CLAUDE.md` with any build/test optimization insights discovered.

After updating the plan, if running under `--loop`, check the [Emission Point](#emission-point) conditions:

1. If every task across all milestones and phases now has status `done`, emit `<promise>{completion_promise}</promise>` (literal XML tags required).
2. Otherwise, if `exit_on_milestone_complete` is `true` and all tasks in the **current milestone** are now `done`, emit `<promise>{completion_promise}</promise>`.

If neither condition is met, the loop continues on the next iteration.

## Native Looping

This command supports the native Synthex looping primitive (introduced by `docs/plans/native-looping.md`). Pass `--loop` to iterate until the completion promise is emitted or `--max-iterations` is reached. The mechanical iteration framework — state file schema, loop-id rules, shared-context vs. fresh-subagent iteration, auto-compaction guarantees, promise emission, iteration markers — lives once in [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md). Only the command-specific bits are inlined below.

### Imperative Loop Protocol (read FIRST when `--loop` is set)

If your invocation includes `--loop`, you are NOT running this command once. You are running it inside a **self-driven shared-context loop** (D-NL1). The harness does **not** re-invoke you between iterations — you re-enter the workflow yourself, in the same turn, until you emit the completion promise or hit `--max-iterations`. This subsection is the authoritative checklist; the prose in the rest of "Native Looping" describes the framework, this section tells you what to do.

#### For every iteration, in order

1. **Boundary check.** Read `.synthex/loops/<loop-id>.json`. If `status != "running"`, exit immediately with `Loop "<loop-id>" is <status> — nothing to do.`. If `iteration >= max_iterations`, set `status: "max-iterations-reached"`, `exit_reason: "Reached max_iterations=<N> without completion promise"`, `exited_at`, write atomically, print the resume hint, exit.
2. **Increment + persist counter** **before** any iteration work. Atomic write to `.synthex/loops/<loop-id>.json.tmp.<pid>` then `mv -f` over the real path.
3. **Print iteration marker** on its own line: `[loop <loop-id> iteration <N>/<max>]` (visibility for the user — survives auto-compaction).
4. **Execute Workflow §1–§9 below in full.** Use the implementation plan, worktrees, Tech Lead delegation, validation gates — the entire body of this command runs **once per iteration**.
5. **Decide the iteration's exit.** At the END of the iteration's work, do one of:
   - **(A) Emit the promise** — `<promise>{completion_promise}</promise>` on its OWN line, only when the Emission Point conditions below hold. Set `status: "completed"`, `exit_reason: "completion-promise-emitted"`, `exited_at`, write state, exit.
   - **(B) Continue to the next iteration.** Prefer to re-enter step 1 in the same turn. If you instead end the turn while the loop is still `running` and unfinished, the [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook re-invokes you for the next iteration — a turn-end is recovered (ADR-003), so a "## Iteration N — Complete" summary or a "want me to continue?" hand-off no longer breaks the loop. Do NOT emit the promise to escape; emit it only when the Emission Point conditions hold.
   - **(C) Await required input.** If an `[H]` acceptance criterion needs user approval, ask via `AskUserQuestion`. That releases the gate for this turn — it will not force-continue past a pending question.
6. **Cancellation check** before re-entering: re-read the state file. If another session set `status: "cancelled"` via `/synthex:cancel-loop`, exit immediately.

#### State-file schema (v1) — inline reference

Write the state file with exactly these fields. The `status` enum is closed — do NOT invent values like `"loop_exhausted_no_promise"` or `"in_flight"`.

```json
{
  "schema_version": 1,
  "loop_id": "next-priority-<4-char-hex>",
  "session_id": "<Claude Code session id, or null>",
  "command": "/synthex:next-priority",
  "args": "<CLI args, verbatim>",
  "prompt_file": null,
  "completion_promise": "<value of --completion-promise>",
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

#### What ends the loop (only these)

- You emit `<promise>{completion_promise}</promise>` on its own line in the iteration's final response (Emission Point conditions met).
- `iteration >= max_iterations` after increment.
- Another session sets `status: "cancelled"` via `/synthex:cancel-loop <loop-id>` or `/synthex:cancel-loop --all`.

The [`loop-advance-gate`](../hooks/loop-advance-gate.md) Stop hook re-invokes you on a turn-end while the loop is still `running`, so ending a turn no longer breaks the loop (ADR-003). The gate bounds runaway with a progress-aware counter capped below Claude Code's 8-consecutive-block override — it relinquishes after a few no-progress turns — and steps aside for a pending `AskUserQuestion`. The one self-inflicted failure mode that remains is **emitting the completion promise before the Emission Point conditions hold**, which terminates the loop early.

### Emission Point

Emit `<promise>{completion_promise}</promise>` (literal text from `--completion-promise`) in the iteration's final response when ANY of the following hold:

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

### Iteration Body

When `--loop` is set, this command's existing workflow runs once per iteration. The agent follows the iteration loop body documented at [`shared-iter`](../docs/native-looping.md#shared-iter) by default (D-NL1 shared-context), or [`subagent-iter`](../docs/native-looping.md#subagent-iter) when `--loop-isolated` is passed: boundary check → increment counter → print marker → execute workflow → scan for promise → cancellation check → loop. State lives in `.synthex/loops/<loop-id>.json` per [FR-NL8](../docs/native-looping.md#state). Auto-compaction is safe because iteration state and work output both live on disk (FR-NL16, FR-NL17, FR-NL24).

The iteration marker (`[loop <loop-id> iteration <N>/<max>]`) prints to stdout before each iteration's workflow runs. See [`markers`](../docs/native-looping.md#markers).

### See Also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration-framework spec.
- `/synthex:loop` — generic prompt loop (no command body).
- `/synthex:list-loops`, `/synthex:cancel-loop` — loop management.
- Plan: `docs/plans/native-looping.md` (Tasks 13–21, FR-NL1–FR-NL45).

## Critical Requirements

- **Validate ALL acceptance criteria** before marking a task complete
- **Every `[T]` criterion must have a linked, passing test** — no exceptions. Record the test file and test name in the plan upon completion
- **Every `[H]` criterion must be approved by the user** before merge — use `AskUserQuestion` to present the work and obtain explicit approval
- **Schedule `[H]`-criteria tasks early in parallel batches** so user review can overlap with autonomous `[T]`-only task execution
- **`[O]` criteria are not validated during execution** — they are post-deployment metrics tracked at the milestone/phase level
- **Keep the implementation plan continuously updated** with progress and learnings
- **Respect pre-commit hooks** — address all failures, never skip them
- **Never cross phase boundaries** in a single session
- **When the plan exceeds 1500 lines**, use a sub-agent to summarize completed work to keep it manageable
- **Document everything** — decisions, trade-offs, and context for future sessions

## Error Handling

- If a Tech Lead instance fails or gets blocked, capture the error/blocker details
- Attempt to resolve simple issues (test failures, lint errors) by re-engaging the Tech Lead
- For persistent blockers, mark the task as blocked in the plan with details and move on to other tasks
- Never leave worktrees in an inconsistent state — clean up on failure

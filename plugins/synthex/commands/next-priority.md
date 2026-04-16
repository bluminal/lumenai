# Next Priority

Automatically identify and execute the next highest-priority tasks from the implementation plan using the Tech Lead sub-agent for orchestrated execution.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `implementation_plan_path` | Path to the implementation plan markdown file | `docs/plans/main.md` | No |
| `concurrent_tasks` | Number of parallel tasks to work on simultaneously | Value from `next_priority.concurrent_tasks` config, or `3` | No |
| `exit_on_milestone_complete` | When running in a Ralph Loop, output the completion signal after finishing a milestone even if later milestones remain. Useful for inserting a checkpoint between milestones. | `false` | No |

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

**Plan complete:** If every task in the plan has status `done`, check for an active Ralph Loop (see Ralph Loop Integration below). If inside a loop with a `completion_promise`, output `<promise>{completion_promise}</promise>` (literal XML tags — the stop hook requires them). Then inform the user: "All tasks in the implementation plan are complete. No work to execute."

**No actionable tasks this iteration:** If non-`done` tasks exist but none are actionable right now (e.g., all remaining tasks are blocked, awaiting `[H]` user approval, or have unsatisfied dependencies), do **NOT** output the Ralph Loop completion signal. Instead, inform the user which tasks remain and why they are not actionable. The Ralph Loop will re-invoke the command on the next iteration — the user may be completing manual tasks or `[H]` reviews in a separate thread, which will unblock work for the next pass.

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

After updating the plan, check the Ralph Loop exit conditions (see Ralph Loop Integration below). If inside an active loop with a `completion_promise`:

1. If every task across all milestones and phases now has status `done`, output `<promise>{completion_promise}</promise>` (literal XML tags required).
2. Otherwise, if `exit_on_milestone_complete` is `true` and all tasks in the **current milestone** are now `done`, output `<promise>{completion_promise}</promise>`.

If neither condition is met, the loop continues on the next iteration.

## Ralph Loop Integration

This command can run inside a [Ralph Loop](https://github.com/anthropics/claude-plugins-official/tree/main/ralph-loop) — an iterative execution loop that re-invokes the same prompt until work is done. Each iteration, the command sees the updated implementation plan from the previous iteration and picks up where it left off.

### Detection

Check whether the file `.claude/ralph-loop.local.md` exists in the project root. If it exists, read its YAML frontmatter to extract:

- `active` — whether a loop is currently running
- `completion_promise` — the text to echo back when work is complete (may be `null`)

The command is inside an active Ralph Loop when the file exists **and** `active` is `true`.

### Completion Signal

When running inside an active Ralph Loop with a non-null `completion_promise`, you **must** output the completion promise wrapped in literal `<promise>` and `</promise>` XML tags. The stop hook uses regex to detect these exact tags — outputting the promise text without the tags will NOT stop the loop.

**Format — you must output this exactly:**

```xml
<promise>{completion_promise}</promise>
```

Where `{completion_promise}` is replaced with the value read from the state file.

**Example:** If `completion_promise` is `PLAN COMPLETE`, you must output:

```
<promise>PLAN COMPLETE</promise>
```

**Wrong** (will not stop the loop):
```
PLAN COMPLETE
```

The `<promise>` tag must appear in your response text. Output it **before** the human-readable completion message so the hook detects it even if the response is truncated.

### When to Signal

The completion signal is output **only** under these conditions:

1. **Entire plan complete:** Every task across all milestones has status `done`. This is the primary exit condition. Tasks with **any** non-done status — `pending`, `in progress`, `blocked`, or awaiting `[H]` user approval — prevent the signal. The loop continues so the user can finish manual tasks or `[H]` reviews in a separate thread; the next iteration will pick up newly-unblocked work.

2. **Milestone boundary exit (opt-in):** If `exit_on_milestone_complete` is `true` and all tasks in the **current milestone** are `done`, the signal fires even if later milestones have remaining work. Use this when you want a checkpoint between milestones (e.g., to review progress, adjust the plan, or switch contexts).

**Important:** The signal must never fire simply because the command found no actionable tasks this iteration. A plan with pending `[H]` tasks, blocked tasks, or tasks the command chose not to pick up is **not complete** — it is waiting for external progress.

### When NOT inside a Ralph Loop

If `.claude/ralph-loop.local.md` does not exist, or `active` is `false`, or `completion_promise` is `null`, skip the promise tag entirely. The command behaves identically to its non-loop behavior.

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

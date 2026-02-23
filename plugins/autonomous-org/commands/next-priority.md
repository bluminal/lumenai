# Next Priority

Automatically identify and execute the next highest-priority tasks from the implementation plan using the Tech Lead sub-agent for orchestrated execution.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `implementation_plan_path` | Path to the implementation plan markdown file | `docs/plans/main.md` | No |
| `concurrent_tasks` | Number of parallel tasks to work on simultaneously | `3` | No |

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

**Critical Rule:** Only select tasks that are truly independent for parallel execution. Tasks with dependencies on each other MUST be sequenced — they cannot run in parallel.

**Critical Rule:** Complete all tasks in the current milestone before advancing to the next one. Never cross phase boundaries in a single session.

### 2. Pre-work Search

Before starting execution, use sub-agents to search the codebase for existing implementations relevant to the selected tasks. Avoid duplicating work that already exists.

### 3. Mark Tasks In Progress

Immediately update the implementation plan marking selected tasks as "in progress".

### 4. Set Up Work Environments

For each selected task, create a git worktree in `/tmp/` with a branch name prefixed with `feature/`:

```bash
git worktree add /tmp/feature/[task-id]-[short-description] -b feature/[task-id]-[short-description]
```

### 5. Delegate to Tech Lead

**This is the key orchestration step.** For each task, launch a **Tech Lead sub-agent** instance with:

- The specific task description and acceptance criteria
- The worktree path as the working directory
- Context about the project (link to specs, PRD, design system docs)
- Git workflow instructions:
  - Work in the assigned worktree
  - Commit changes with descriptive messages using `git commit --no-gpg-sign`
  - Do NOT merge — merging is handled by this command after completion
  - Respect pre-commit hooks and address all failures

The Tech Lead will:
- Analyze the task and determine which sub-agents are needed
- Orchestrate implementation (coding, frontend work, security review, testing)
- Provide incremental progress updates
- Report completion with a summary of what was done

### 6. Monitor Progress

Monitor the Tech Lead instances for:
- Incremental progress updates
- Completion notifications
- Blockers or failures that need intervention

### 7. Validate Completion

For each completed task:
- Verify all acceptance criteria are met
- Confirm tests pass
- Review the Tech Lead's summary of changes and decisions

### 8. Merge Results

After successful completion and validation:

```bash
git merge --ff-only feature/[task-id]-[short-description]
```

If fast-forward merge is not possible, attempt a merge commit. If conflicts arise, resolve them carefully.

After merging, clean up the worktree:

```bash
git worktree remove /tmp/feature/[task-id]-[short-description]
```

### 9. Update the Plan

Mark completed tasks as "done" in the implementation plan with:
- Completion notes
- Any learnings or discoveries
- Follow-up tasks identified during implementation

Update `@CLAUDE.md` with any build/test optimization insights discovered.

## Critical Requirements

- **Validate ALL acceptance criteria** before marking a task complete
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

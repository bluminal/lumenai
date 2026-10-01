---
model: opus
---

# Next Priority

Automatically identify and execute the next highest-priority tasks from the implementation plan using the Tech Lead sub-agent for orchestrated execution.

`--loop` here is Synthex native looping (see the Native Looping section), not the harness `/loop` skill.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `implementation_plan_path` | Path to the implementation plan markdown file | `docs/plans/main.md` | No |
| `concurrent_tasks` | Number of parallel tasks to work on simultaneously | Value from `next_priority.concurrent_tasks` config, or `3` | No |
| `exit_on_milestone_complete` | Under `--loop`, end the loop after finishing a milestone even if later milestones remain (a checkpoint between milestones). | `false` | No |
| `--loop` | Enable native looping (FR-NL1/FR-NL2); see Native Looping below. | off | No |
| `--completion-promise <string>` | Promise text the agent emits as `<promise>X</promise>` to terminate the loop. | `ALLDONE<session_id>` (falls back to `ALLDONE<loop_id>`) | No |
| `--max-iterations <int>` | Iteration cap. Hard ceiling 200. | `20` | No |
| `--loop-isolated` | Fresh-subagent isolation mode per iteration. | off (shared-context default) | No |
| `--name <slug>` | User-supplied loop-id slug `^[a-z0-9][a-z0-9-]{0,63}$`. | auto: `<command-slug>-<4-char-hex>` | No |
| `--auto-decide` | Opt-in autonomy directive. When set, the Tech Lead sub-agent takes its own recommended option instead of calling `AskUserQuestion` at decision points where it already has a clear recommendation (high-impact escalations, ambiguous-task clarification) — and records the decision, alternatives, and reasoning in the plan for later review (see Step 9). Does **not** affect `[H]` acceptance-criteria approval, which always requires explicit user sign-off (see Step 7). Propagated to any sub-agent the Tech Lead delegates to. | off | No |
| `--profile <economy\|balanced\|premium>` | Override `models.profile` for spawned reviewers (see Model Resolution). | `models.profile` config (`balanced`) | No |

### Model Resolution

Each spawned agent's model and effort resolve in this order: `--profile` flag > `models.agents.<name>` > `models.profile` delta > the agent's own frontmatter (FR-HM15, D29). On Claude Code, the resolved values are applied via the Agent tool's per-call `model` override; on every other host, `models`/`hosts.<harness>.models` are advisory only — applied where the host supports per-subagent model selection, otherwise ignored. Standing-pool routing is unaffected: pools never re-spawn, so a profile change reaches only newly spawned agents.

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

**Plan complete:** If every task in the plan has status `done`, inform the user: "All tasks in the implementation plan are complete. No work to execute." Under `--loop`, follow the loop protocol you loaded.

**No actionable tasks this iteration:** If non-`done` tasks exist but none are actionable right now (e.g., all remaining tasks are blocked, awaiting `[H]` user approval, or have unsatisfied dependencies), do **NOT** emit the completion promise. Instead, inform the user which tasks remain and why they are not actionable. Under `--loop`, follow the loop protocol you loaded.

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

If the host refuses a nested subagent (depth-1 hosts such as OpenCode, Grok Build, and Hermes), perform the role inline in this session, then continue.

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
  - **Write the commit message yourself** (FR-HM27): follow the project's convention (`git.commit_convention` — Conventional Commits when it is `conventional`, otherwise match `git log`), carrying any task-level issue key (only if known with certainty — e.g., a Jira key embedded in the worktree branch name or supplied to you) verbatim, then pipe it into `git commit -F -`.
  - Do NOT merge — merging is handled by this command after completion
  - Respect pre-commit hooks and address all failures
- **Autonomy directive — only when `--auto-decide` is set:**
  - Tell the Tech Lead: for this task, when you reach a decision point where you already have a clear recommendation — a high-impact escalation per your Decision Authority table, or an ambiguous requirement under Behavioral Rule 7 — take the recommended option yourself instead of calling `AskUserQuestion`. Record the decision, the alternatives considered, and your reasoning so it can be reviewed later (see Step 9).
  - This does **not** apply to `[H]` acceptance criteria: those always require explicit user approval via `AskUserQuestion` before merge, regardless of `--auto-decide` (see Step 7).
  - Propagate this directive to any sub-agent you delegate to — an un-propagated directive just moves the blocking question one level down, where it still halts the loop.

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
- **This gate is unconditional:** even when `--auto-decide` is set, `[H]` criteria are never auto-approved — always ask via `AskUserQuestion`

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

**Immediate cleanup invariant:** A task is not complete when its merge succeeds; the merge handoff is complete only when its task worktree has been removed. Immediately after each successful merge — **before** merging or selecting another task, updating the plan, starting another loop iteration, or reporting success to the user — remove that task's exact worktree:

```bash
git worktree remove {worktrees.base_path}/{worktrees.branch_prefix}[task-id]-[short-description]
```

Then verify that `git worktree list` no longer includes that path. Do not defer this cleanup until the end of the batch, session, or release: stale ignored worktrees can consume substantial disk space.

If removal fails, stop the task handoff, diagnose the issue, and retry cleanup before continuing. Never use `git worktree remove --force` to make the workflow proceed, and never remove a worktree that has uncommitted changes. Preserve such work for recovery and surface the exact path and blocker to the user; do not silently strand it or treat the task as complete.

### 9. Update the Plan

Mark completed tasks as "done" in the implementation plan with:
- Completion notes
- **Test linkage:** For each `[T]` criterion, record the test file and test name that proves it (e.g., `[T] Email validation → src/auth/__tests__/login.test.ts: "validates email format"`)
- **`[H]` approval record:** Note that human approval was obtained for `[H]` criteria
- **Autonomous decision record (when `--auto-decide` was set):** For each decision the Tech Lead resolved on its own recommendation instead of asking, record the decision taken, the alternatives considered, and the reasoning — one line is enough — so it can be reviewed later
- Any learnings or discoveries
- Follow-up tasks identified during implementation

Update the project instruction file (`CLAUDE.md` on Claude Code; otherwise the first of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.hermes.md` that exists) with any build/test optimization insights discovered.

Under `--loop`, follow the loop protocol you loaded.

## Native Looping

**Loop engine (FR-HM19, D34):** when `--loop` is set, if `--loop-isolated` is not set, a `Workflow` tool is in your tool list, and `bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config-get.sh" native_looping.engine prose` prints exactly `workflow`, Read `${CLAUDE_PLUGIN_ROOT}/docs/engines/loop-workflow.md` and follow it (this instruction is the `Workflow` opt-in, D31); otherwise Read `${CLAUDE_PLUGIN_ROOT}/docs/next-priority-loop.md` and follow it, never a host feature named Workflow. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

### Emission Point

The loop ends when every plan task is `done`, or when `exit_on_milestone_complete` is `true` and the current milestone is `done`; the protocol you loaded says how.

### Iteration Body

Each iteration starts with ONE Bash call, `loop-step.sh advance <loop-id>` (FR-HM18; non-zero exit means stop), then runs Workflow §1–§9. State: `.synthex/loops/<loop-id>.json` ([FR-NL8](../docs/native-looping.md#state)).

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
- Never leave worktrees in an inconsistent state. Remove every successfully merged task worktree immediately as part of its merge handoff; for failed or unmerged work, preserve recoverable changes and report the exact path and blocker rather than silently leaving an abandoned worktree behind

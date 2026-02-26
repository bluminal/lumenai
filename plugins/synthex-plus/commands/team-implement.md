# Team Implement

Execute implementation plan tasks using a persistent agent team instead of ephemeral subagent instances. This is the teams-optimized equivalent of Synthex's `next-priority` command.

Teams provide sustained multi-agent collaboration where teammates share a task list, exchange messages via mailboxes, and coordinate autonomously. Unlike `next-priority` which spawns independent Tech Lead subagents per worktree (each unaware of the others), `team-implement` creates a persistent team where agents communicate, share context about cross-cutting concerns, and coordinate on integration points.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `implementation_plan_path` | Path to the implementation plan | Value from config `documents.implementation_plan`, falling back to `docs/plans/main.md` | No |
| `template` | Team composition template to use | Value from config `teams.default_implementation_template`, falling back to `implementation` | No |
| `milestone` | Specific milestone to execute (e.g., "2.1") | Current incomplete milestone (first milestone with pending tasks) | No |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` | No |

**Config resolution order:** command parameter > project config (`{config_path}`) > plugin defaults (`config/defaults.yaml`) > hardcoded fallback.

## Scope Guidance

A single `team-implement` invocation should target one milestone. Milestones with more than `lifecycle.max_tasks_per_invocation` tasks (default 15) should be split into sub-milestones before team creation. This keeps the team's context manageable and provides natural checkpoints.

## Workflow

### 1. Load Configuration

Load the Synthex+ configuration using the resolution chain:

1. **Command parameter:** If `config_path` was provided, use that file
2. **Project config:** Read `.synthex-plus/config.yaml` from the project root
3. **Plugin defaults:** Read `plugins/synthex-plus/config/defaults.yaml` (relative: `../config/defaults.yaml`)
4. **Hardcoded fallback:** Use embedded defaults for critical values

Merge settings from each level — project config overrides plugin defaults, command parameters override both.

Extract the following values for use in subsequent steps:
- `teams.default_implementation_template` → template name (unless overridden by `template` parameter)
- `cost_guidance.*` → cost estimation constants
- `lifecycle.max_tasks_per_invocation` → task count soft limit
- `lifecycle.stuck_task_timeout_minutes` → stuck task intervention threshold
- `review_loops.*` → review cycle limits
- `documents.*` → default document paths

### 2. Read Implementation Plan and Identify Target Milestone

Read the implementation plan at `@{implementation_plan_path}`.

**Identify the target milestone:**
- If the `milestone` parameter was provided, locate that specific milestone (e.g., "2.1" matches "Milestone 2.1")
- If no milestone was specified, find the **current incomplete milestone** — the first milestone that has at least one task with status `pending` or `in progress`
- If all milestones are complete, inform the user: "All milestones in the implementation plan are complete. No work to execute."

**Extract milestone tasks:**
- Parse all tasks in the target milestone, capturing: task number, description, complexity, dependencies, status
- Filter to actionable tasks: `pending` and `in progress` tasks (skip `done` tasks)
- Map dependency references to task IDs (e.g., "Task 13" → task #13)

**Task count check (FR-CW1):**
- Count the actionable tasks in the target milestone
- If the count exceeds `lifecycle.max_tasks_per_invocation` (default 15):
  - Display a warning: "Warning: Milestone {milestone} has {count} actionable tasks, exceeding the recommended limit of {max_tasks_per_invocation}. Consider splitting this milestone into sub-milestones for better context management."
  - Proceed anyway (this is a soft limit, not a hard stop)

**Display milestone summary:**
```
Target: Milestone {milestone_id} — {milestone_title}
Tasks: {actionable_count} actionable ({pending_count} pending, {in_progress_count} in progress)
Complexity: {S_count}S / {M_count}M / {L_count}L
Dependencies: {dep_count} inter-task dependencies
```

### 4. Cost Estimate

Display an approximate token cost comparison so the user can make an informed decision before committing to team creation.

**Skip check:** If `cost_guidance.show_cost_comparison` is `false` in the resolved config, skip this step entirely (no estimate display, no confirmation prompt) and proceed directly to team creation.

**Calculate the following variables:**

- `num_tasks` = count of actionable tasks identified in Step 2
- `num_teammates` = count of roles in the resolved team template (from the `template` parameter or config default)
- `base_tokens_per_teammate` = from config `cost_guidance.base_tokens_per_teammate` (default 50,000)
- `tokens_per_task_per_teammate` = from config `cost_guidance.tokens_per_task_per_teammate` (default 20,000)

**Apply the cost formulas:**

```
subagent_estimate = num_tasks * tokens_per_task_per_teammate
team_estimate     = (num_teammates * base_tokens_per_teammate) + (num_tasks * num_teammates * tokens_per_task_per_teammate)
multiplier        = team_estimate / subagent_estimate   (rounded to 1 decimal place)
```

**Display the cost estimate** following the canonical template defined in the **Cost Estimate Display** section of `plugins/synthex-plus/docs/output-formats.md`. For `team-implement`, use:
- `{fallback_command}` = `next-priority`
- `{team_command}` = `team-implement`

Include this caveat after the canonical display: the formula assumes all teammates interact with all tasks, which is a conservative upper bound. For implementation teams specifically, actual cost is typically lower because specialists only work on tasks relevant to their role.

**User confirmation:** After displaying the estimate, prompt "Proceed with team creation? [Y/n]". If the user declines, abort the command gracefully with no side effects.

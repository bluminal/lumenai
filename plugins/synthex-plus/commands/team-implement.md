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

### 3. Pre-Flight Checks (FR-LM1)

Run three validation checks before creating the team. These checks catch misconfigurations and stale resources early, before any agents are spawned.

#### 3a. One-team-per-session check

Verify no existing team is active in the current session. Check `~/.claude/teams/` for directories containing a `config.json` file — a team is considered active if `~/.claude/teams/{team-name}/config.json` exists.

- If an active team is found, **abort immediately** with:
  ```
  Error: An active team "{team_name}" already exists in this session.
  Complete or clean up the existing team before creating a new one.
  To clean up: check ~/.claude/teams/ for stale resources.
  ```
- If no active team is found, proceed to the next check.

#### 3b. Dependency check (Synthex plugin)

Verify that agent files referenced by the selected team template are accessible. For each role in the template's roles table, check that the agent file path exists (e.g., `plugins/synthex/agents/tech-lead.md`).

- For each missing agent file, emit a **warning** (not a hard failure):
  ```
  Warning: Synthex agent file not found at {path}. The teammate referencing this agent may not function correctly.
  ```
- Continue regardless — missing agents degrade gracefully rather than blocking the entire team.

#### 3c. Orphan detection

Scan `~/.claude/teams/` for leftover team resources from previous sessions. Compare found team directories against the team about to be created.

- Team metadata lives at `~/.claude/teams/{team-name}/config.json`
- Tasks live at `~/.claude/tasks/{team-name}/`
- Inboxes live at `~/.claude/teams/{team-name}/inboxes/`

If orphaned directories are found, emit a **warning**:
```
Warning: Found orphaned team resources from a previous session:
  - {team_name_1} (created {date})
  - {team_name_2} (created {date})
Consider running `team-init --cleanup` to remove stale resources.
```

Read the `created` date from the `config.json` file in each orphaned team directory. If `config.json` is missing or unreadable, display "unknown date" instead.

**Pre-flight outcome:** If the one-team-per-session check fails, abort. All other checks are warnings only — the workflow continues to Step 4.

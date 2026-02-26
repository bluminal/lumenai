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

### 5. Create Team (FR-TCM1)

Compose and issue a team creation prompt using the **read-on-spawn pattern** (ADR-plus-001). Each teammate receives a three-layer prompt: identity from the canonical Synthex agent file, team-specific behavioral overlay from the template, and milestone/project context.

#### 5a. Read the implementation template

Read the team template file determined in Step 1 (default: `plugins/synthex-plus/templates/implementation.md`). Extract:

- **Roles table** — Role name, Synthex agent file path, required flag, and team-specific behavioral overlay for each teammate
- **Communication patterns section** — Mailbox conventions, escalation rules, hook-based routing
- **Task decomposition guidance section** — How the lead maps plan tasks to shared task list items, dependency conventions, context mode

#### 5b. Compose the team creation prompt

For each role in the template's roles table, compose a spawn prompt with three layers:

1. **Identity (read-on-spawn):**
   ```
   Read your agent definition at {agent_file_path} and adopt it as your identity.
   ```
   - The teammate reads the complete Synthex agent markdown file as its first action
   - No condensed summaries — the canonical agent file IS the identity
   - This gives the teammate full behavioral fidelity: expertise, output format, severity frameworks, behavioral rules

2. **Team-specific behavioral overlay:**
   - Mailbox usage conventions — when to send messages, to whom, expected format
   - Task list conventions — how to claim tasks, report completion, flag blockers
   - Communication patterns — who this role coordinates with directly, reporting cadence
   - These overlay instructions supplement the base agent identity — they do not replace it
   - Overlay text is sourced directly from the template's roles table "Team-Specific Behavioral Overlay" column

3. **Context:**
   - Reference to `CLAUDE.md` for project conventions
   - Reference to relevant specs (from config `documents.specs`)
   - Implementation plan scope: milestone ID, task list, dependency chains, acceptance criteria
   - Any project-specific context from the resolved config

#### 5c. Include auto-compaction guidance (FR-CW3)

The team creation prompt must include guidance about Claude Code's auto-compaction behavior so teammates can operate effectively when context is compacted:

- Teammates may lose detailed memory of earlier work when context compaction occurs
- Task descriptions on the shared task list serve as the durable record of work
- The lead's periodic summaries serve as the authoritative history
- Teammates should rely on the task list as their primary memory, not their conversation context
- When in doubt about prior state, check the task list and mailbox before re-doing work

#### 5d. Team naming convention

The team name follows the pattern: `impl-milestone-{milestone_id}` (e.g., `impl-milestone-2.1`).

Use the milestone ID extracted in Step 2 to construct the team name.

#### 5e. Illustrative spawn prompt

The following example shows what a fully composed team creation prompt looks like. The actual prompt is assembled dynamically from the template's roles table, overlay column, and the milestone context from Step 2.

```
Create a team named "impl-milestone-1.2" with the following teammates:

Lead (Tech Lead):
  Read your agent definition at plugins/synthex/agents/tech-lead.md and adopt
  it as your identity. Additionally:
  - You are the team lead for this implementation milestone.
  - Decompose the milestone into tasks and assign work via the shared task list.
  - Only you write to the implementation plan file.
  - Coordinate the team via the shared task list and mailbox.
  - Resolve conflicts between teammates and review completed output.

Frontend (Lead Frontend Engineer):
  Read your agent definition at plugins/synthex/agents/lead-frontend-engineer.md
  and adopt it as your identity. Additionally:
  - You implement UI components and own frontend quality for this team.
  - Coordinate with the design system spec at docs/specs/design-system.md.
  - Message the Lead via mailbox when blocked or when you discover cross-cutting concerns.
  - Report status via the shared task list, not by editing the plan directly.

Quality (Quality Engineer):
  Read your agent definition at plugins/synthex/agents/quality-engineer.md and
  adopt it as your identity. Additionally:
  - You write tests in parallel with implementation for this team.
  - Monitor coverage gaps and report them on the shared task list.
  - Target: 80% line, 70% branch coverage.
  - Message the Lead when you identify untested integration points.

The milestone to execute is 1.2 from docs/plans/main.md. The Lead should
create shared task list items for each plan task, preserving dependency chains.

Note on context compaction: Your conversation context may be compacted during
long-running sessions. The shared task list is your durable memory — always
check it for current state before starting new work. The Lead's periodic
summaries are the authoritative history of team progress.
```

#### 5f. Issue the team creation prompt

After composing the prompt:

- Issue the team creation prompt to Claude Code using the `Teammate` tool with the `spawnTeam` operation
- The team name is `impl-milestone-{milestone_id}` as defined in 5d
- Each role from the template becomes a named teammate in the spawn call
- Wait for confirmation that the team was created successfully before proceeding
- If team creation fails, display the error and abort — do not retry automatically

### 6. Post-Creation Verification (FR-TCM2)

After team creation (Step 5), verify the team was formed correctly before proceeding to task mapping and execution.

#### 6a. Inspect team metadata

Check `~/.claude/teams/{team-name}/config.json` (where `{team-name}` is the name from Step 5d, e.g., `impl-milestone-2.1`):

- Verify the config file exists (confirms team was created)
- Verify the teammate count matches the template's roles table count
- Verify all roles marked "Required" in the template are present

#### 6b. Handle missing roles

- **Required role missing** — Abort with cleanup. Remove partially-created resources at `~/.claude/teams/{team-name}/`, `~/.claude/tasks/{team-name}/`, and `~/.claude/teams/{team-name}/inboxes/`. Display:
  ```
  Error: Team creation incomplete. Missing required roles: {role_list}
  Cleaning up partial team resources...
  ```

- **Optional role missing** — Warn and continue. The team operates with reduced capability:
  ```
  Warning: Optional role "{role_name}" did not spawn. The team will operate without this capability.
  ```

#### 6c. Prompt-based fallback (FR-GD2)

If team metadata at `~/.claude/teams/{team-name}/config.json` is not accessible (path doesn't exist, permissions issue, or unreadable), fall back to prompt-based verification:

- Send a message to each teammate asking them to confirm their identity and role
- Verify responses match the expected roles from the template
- This fallback is less reliable but provides a degraded path forward when metadata inspection is unavailable

#### 6d. Display verification summary

```
Team "{team_name}" created successfully.
Roles: {role_count}/{expected_count} spawned
  - Lead (tech-lead): ready
  - Frontend (lead-frontend-engineer): ready
  - Quality (quality-engineer): ready
  - Reviewer (code-reviewer): ready
  - Security (security-reviewer): ready
```

**Verification outcome:** If required roles are missing, abort (6b). If metadata is inaccessible, attempt prompt-based fallback (6c). If all roles are confirmed, proceed to task mapping and execution.

### 7. Plan-to-Task Mapping (FR-TL1, FR-TL3)

After the team is created and verified, the lead maps implementation plan tasks to the shared task list. This bridges the plan (a static document) to the team's executable work queue.

#### 7a. Create shared task list items

The lead creates one shared task list item per actionable plan task using `TaskCreate`:

- **Subject:** Brief task title from the plan (e.g., "Implement login form with email/password fields")
- **Description:** Enriched with context pointers and acceptance criteria (see 7b)
- **Dependencies:** Map plan dependency references to `addBlockedBy` relationships
  - Plan says "Depends on: Task 3" becomes `addBlockedBy: [task-3-id]`
  - No circular dependencies allowed — if detected, break the cycle and flag it in the task description
  - Dependencies only reference tasks within the current milestone scope — cross-milestone dependencies are noted in the description as informational context, not as `addBlockedBy` links

#### 7b. Enrich task descriptions

Teammates operate in independent context windows. Unlike subagents that share the parent's context, teammates must be given enough information in the task description itself to work autonomously.

Every task description includes these elements:

- **CLAUDE.md reference:** "Refer to CLAUDE.md for project conventions and patterns"
- **Spec links:** Relevant specification documents from the `documents.specs` config path (e.g., "See docs/specs/design-system.md for form component patterns")
- **Acceptance criteria:** Copied verbatim from the implementation plan task
- **Inter-task integration points:** Explicitly name which other concurrent tasks this task interacts with (e.g., "This task creates the API endpoint that Task 5's frontend component will consume")
- **Context budget guidance:** "Keep tool invocations focused. Summarize findings rather than dumping raw output."

Task descriptions follow the `task_list.context_mode` config setting:

| Mode | Behavior | Trade-off |
|------|----------|-----------|
| `references` (default) | Descriptions contain pointers to files and specs — teammates read referenced files when they claim the task | Lower token cost, slightly slower task start |
| `full` | Descriptions contain full inline context — spec contents, acceptance criteria detail, and relevant code snippets embedded directly | Higher token cost, faster execution |

#### 7c. Preserve complexity metadata

Complexity grades (S/M/L) from the implementation plan are preserved in the task description so the lead can use them for:

- **Assignment decisions:** Balance workload across teammates (avoid assigning all L tasks to one teammate)
- **Progress estimation:** S tasks are expected to complete faster than L tasks — stale L tasks may not be stuck
- **Reporting:** Progress summaries can report completion by complexity weight, not just task count

Include the complexity grade in the task description as a labeled field: `Complexity: M`

#### 7d. Assignment guidance

After creating all shared task list items, the lead assigns them to teammates based on role match:

- **Frontend tasks** (UI components, styling, client-side logic) — assign to Frontend teammate
- **Test tasks** (unit tests, integration tests, coverage) — assign to Quality teammate
- **General implementation** (API endpoints, business logic, data layer, configuration) — Lead handles directly
- **Review tasks** — NOT created here; the TaskCompleted hook system creates review tasks automatically when implementation tasks are completed

The lead assigns tasks via `TaskUpdate` with `owner` set to the teammate's role name. Only assign tasks whose dependencies are already satisfied (all `blockedBy` tasks are completed). Tasks with unsatisfied dependencies remain unassigned until their blockers resolve — the lead reassigns them as dependencies complete.

#### 7e. Illustrative task mapping

**Plan task (from implementation plan table):**
```
| 5 | Implement login form with email/password fields | M | Task 3 | FR-AUTH1 | pending |
```

**Shared task list item created by the lead:**
```
TaskCreate:
  subject: "Implement login form with email/password fields"
  description: |
    Implement the login form component per FR-AUTH1.
    Complexity: M

    - Refer to CLAUDE.md for project conventions
    - See docs/specs/design-system.md for form component patterns
    - Acceptance: email + password fields, client-side validation, submit handler wired to auth API
    - Integration: Task 3 (auth API endpoint) must complete first; Task 6 (login page layout) consumes this component
    - Context budget: keep tool invocations focused, summarize findings
  addBlockedBy: [task-3-id]
```

After creation, the lead assigns the task:
```
TaskUpdate:
  taskId: task-5-id
  owner: "Frontend"
```

This task is only assigned once Task 3 (its dependency) has been completed. Until then, it remains unassigned and pending.

### 8. Execution Coordination (FR-CW2)

After task mapping (Step 7), the team enters the execution phase. The lead coordinates while teammates work concurrently and autonomously.

#### 8a. Execution model

- Teammates execute tasks independently and concurrently within their assigned roles
- The lead monitors progress by periodically checking `TaskList` for status updates
- The lead does NOT micromanage -- teammates are autonomous within their domain
- The lead intervenes only when:
  - A teammate reports a blocker via mailbox
  - A task is stuck (see `lifecycle.stuck_task_timeout_minutes` and 8c below)
  - A cross-cutting concern emerges that affects multiple teammates

#### 8b. Task lifecycle

Each task follows this lifecycle, managed by the teammate who owns it:

1. **Claim:** Teammate uses `TaskUpdate` to set `status` to `in_progress` and `owner` to their role name
2. **Execute:** Teammate implements the task, using tools as needed
3. **Complete:** Teammate uses `TaskUpdate` to set `status` to `completed` with a brief completion note in the description (files modified, decisions made)
4. **Quality gate:** The `TaskCompleted` hook fires, routing the completed work to reviewers (see Phase 3 hooks). If review returns FAIL, the task is reopened and the teammate iterates.

Teammates only claim tasks that meet **all three** conditions:
- `pending` status (not already claimed by another teammate)
- Unblocked (all `blockedBy` dependencies are `completed`)
- Matching their role (Frontend claims frontend tasks, Quality claims test tasks, Lead handles general implementation)

#### 8c. Lead monitoring cadence

The lead checks progress at regular intervals throughout execution:

- Check `TaskList` for newly completed tasks, blocked tasks, and stuck tasks
- A task is "stuck" if it has been `in_progress` for longer than `lifecycle.stuck_task_timeout_minutes` (default 30) without tool activity
- For stuck tasks:
  - Message the teammate via mailbox to check status
  - If the teammate is unresponsive, reassign the task to another capable teammate
  - If the task is blocked on an external dependency, update `blockedBy` and flag it

#### 8d. Progressive summarization

To manage context window capacity during long-running sessions, the lead produces periodic progress summaries:

- **Frequency:** After every 3-5 completed tasks, the lead produces a summary
- **Content:** Each summary captures:
  - What was completed (task subjects and key outcomes)
  - Key decisions made during execution
  - Files created or modified
  - Remaining work count and any active blockers
- **Authority:** The summary is the authoritative record of team progress. Detailed task output can be dropped from context after summarization.
- **Convention:** This mirrors the existing Synthex pattern of summarizing when plans exceed 1500 lines

Display each progress summary using the **Progress Report Format** defined in `plugins/synthex-plus/docs/output-formats.md`.

#### 8e. Dependency unblocking

As tasks complete, the lead proactively unblocks downstream work:

- When a task completes, check `TaskList` for tasks whose `blockedBy` list referenced the completed task
- If a newly-unblocked task matches an idle teammate's role, assign it immediately via `TaskUpdate` with `owner` set to the teammate's role name
- The `TeammateIdle` hook also handles automatic assignment (see Phase 3), but the lead proactively assigns to minimize idle time between tasks

### 9. Progress Synchronization (FR-TL2)

Task completions on the shared task list must be synchronized back to the implementation plan file. The critical constraint is **D7: only the lead writes to the implementation plan** to prevent concurrent write conflicts when multiple teammates are active.

#### 9a. Single-writer rule (D7)

**Only the lead writes to the implementation plan file.** No other teammate may edit the plan directly.

Teammates report their status exclusively through the shared task list and mailbox:

- **Task status:** Teammates update task status via `TaskUpdate`, including a completion note (files modified, decisions made)
- **Complex findings:** Teammates use `SendMessage` to communicate discoveries, architectural concerns, or decisions that need the lead's attention
- **Never by file edit:** Teammates do NOT open, read-to-edit, or write to the implementation plan file — this prevents concurrent write conflicts that arise when multiple agents modify the same file

#### 9b. Synchronization cadence

The lead synchronizes plan status at designated checkpoints, NOT after every individual task:

- **After milestone completion:** Once all tasks in the target milestone are done, the lead updates the implementation plan marking each task as `done` with completion notes
- **At natural breakpoints:** If the milestone is large, the lead may sync after completing a sub-group of related tasks (e.g., all tasks in a sub-section or all tasks assigned to a particular role)
- **NOT in real-time:** Synchronizing after every individual task would create excessive file I/O and version churn with no material benefit

#### 9c. What the lead writes to the plan

For each completed task, the lead updates the implementation plan with:

- **Status change:** `pending` → `done`
- **Completion note:** Brief note if significant decisions were made during execution (e.g., "Used existing `useAuth` hook instead of new implementation per teammate recommendation")
- **Scope deviations:** Any changes from the original task description — added scope, reduced scope, or alternative approach taken

The lead reads completion details from the shared task list (`TaskGet` for each completed task) and consolidates them into the plan update.

#### 9d. Discovered work

New tasks discovered during execution that were not in the original plan are handled in both systems:

1. **Shared task list:** The lead creates a new task via `TaskCreate` with the discovery details, assigns it to the appropriate teammate if within the current milestone's scope
2. **Implementation plan:** The lead adds the discovered task to the appropriate milestone section, marking it as `pending` (if still to be done) or `done` (if it was already addressed during execution)

Teammates report discovered work to the lead via `SendMessage` — they do NOT add tasks to the plan directly. The lead decides whether the discovered work is in-scope for the current milestone or should be deferred.

#### 9e. Final synchronization

When all milestone tasks are complete, the lead performs a final sync pass:

1. **Reconcile task list with plan:** Verify every shared task list item has a corresponding status update in the implementation plan — no task left behind
2. **Reconcile discovered work:** Ensure all discovered tasks added to the shared task list during execution are reflected in the plan
3. **Produce the Completion Report:** Generate the final report using the canonical **Completion Report Format** defined in `plugins/synthex-plus/docs/output-formats.md`, capturing:
   - Summary of work completed by each role
   - Discovered work and its disposition (completed, deferred, or filed as follow-up)
   - Files created or modified across all teammates
   - Quality gate results (code review, security review verdicts)

### 10. Graceful Shutdown (FR-LM2)

When all milestone tasks are complete, the lead orchestrates an ordered shutdown to ensure consistency and clean up team resources.

#### 10a. Completion check

The lead determines that work is complete when all three conditions are met:

- All tasks on the shared task list are in `completed` status (quality gates passed)
- No `pending` or `in_progress` tasks remain
- All discovered work has been either completed or explicitly deferred

If any tasks remain incomplete, the lead does not initiate shutdown — execution continues under Step 8.

#### 10b. Completion report

Before initiating shutdown, the lead:

1. Performs the final synchronization (Step 9e) — updating the implementation plan with all task statuses, discovered work, and scope deviations
2. Produces the **Completion Report** using the canonical format from `plugins/synthex-plus/docs/output-formats.md` (Completion Report section)

The completion report is the final output of the entire `team-implement` invocation. It is displayed to the user before any shutdown actions begin.

#### 10c. Ordered shutdown sequence

Teammates shut down in a specific order to maintain consistency:

1. **Non-lead teammates first:** Send shutdown signal to all non-lead teammates (Frontend, Quality, Reviewer, Security). Wait for acknowledgment from each before proceeding.
2. **Lead shuts down last:** After all non-lead teammates have stopped, the lead shuts down.

This ordering ensures the lead can handle any last-minute issues that arise during teammate shutdown — such as a teammate failing to acknowledge, a final mailbox message requiring action, or a resource cleanup problem.

#### 10d. Resource cleanup

After all teammates have shut down, verify that team resources are cleaned up:

- `~/.claude/teams/{team-name}/` — should be removed or empty
- `~/.claude/tasks/{team-name}/` — should be removed or empty
- `~/.claude/teams/{team-name}/inboxes/` — should be removed or empty

If resources remain, report them to the user:
```
Warning: Team resources not fully cleaned up. Remaining:
  - ~/.claude/teams/{team-name}/
Run `team-init --cleanup` to remove stale resources.
```

#### 10e. Remove team name record

Remove the team name from the recorded active team list. This supports the orphan prevention system (FR-LM4) — the team name was recorded during Step 5 (team creation) and must be removed so that future `team-implement` invocations do not flag this team as an orphan during pre-flight checks (Step 3c).

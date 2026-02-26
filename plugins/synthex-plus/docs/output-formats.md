# Synthex+ Output Formats

> Canonical output format definitions for all Synthex+ commands. Commands reference this file instead of defining formats independently (D10).

<!--
  This file is the SINGLE SOURCE OF TRUTH for output formats used across
  Synthex+ commands (team-implement, team-review, team-plan). When a command
  needs to display a cost estimate, progress report, or completion report,
  it references the format defined here.

  Why: Defining the same format in 3+ commands creates drift risk. A single
  canonical definition ensures consistency and makes updates a one-file change.
-->

## Cost Estimate Display

Displayed before team creation to help users understand the approximate token cost of the team approach compared to the standard subagent approach.

### Formulas

```
subagent_estimate = num_tasks * tokens_per_task_per_teammate
team_estimate     = (num_teammates * base_tokens_per_teammate) + (num_tasks * num_teammates * tokens_per_task_per_teammate)
```

### Variable Sources

| Variable | Config Path | Default | Description |
|----------|------------|---------|-------------|
| `base_tokens_per_teammate` | `cost_guidance.base_tokens_per_teammate` | 50,000 | Approximate tokens per teammate for spawn + context loading + CLAUDE.md |
| `tokens_per_task_per_teammate` | `cost_guidance.tokens_per_task_per_teammate` | 20,000 | Approximate tokens per task per teammate for execution + tool use |
| `num_tasks` | Derived from milestone/scope | -- | Count of tasks in the target milestone or review scope |
| `num_teammates` | Derived from template | -- | Count of teammates defined by the team template (including lead) |

### Display Template

Commands MUST use this exact format when displaying the cost estimate:

```
Team cost estimate (approximate):
  Subagent approach ({fallback_command}): ~{subagent_estimate} tokens
  Team approach ({team_command}):         ~{team_estimate} tokens (~{multiplier}x multiplier)

  Note: This is a prompt-based approximation. Actual usage varies
  based on task complexity, tool invocations, and review cycles.

  Proceed with team creation? [Y/n]
```

Where:
- `{fallback_command}` is the standard Synthex equivalent (e.g., `next-priority`, `review-code`, `write-implementation-plan`)
- `{team_command}` is the Synthex+ command being invoked (e.g., `team-implement`, `team-review`, `team-plan`)
- `{multiplier}` is `team_estimate / subagent_estimate`, rounded to one decimal place (e.g., `7.4x`)

### Calculation Notes

- The team estimate formula assumes all teammates interact with all tasks -- this is a conservative upper bound
- For implementation teams, the actual cost is lower because specialists only work on role-relevant tasks
- For review teams, the estimate is closer to actual because each reviewer examines the full scope
- The subagent estimate represents sequential execution (one task at a time, one agent per task)

### Skip Behavior

When `cost_guidance.show_cost_comparison` is set to `false` in the project config:

- The cost estimate display is skipped entirely
- No user confirmation prompt is shown
- Team creation proceeds immediately after pre-flight checks
- This is intended for users who have already accepted the cost model and do not want the prompt on every invocation

---

## Progress Report Format

Displayed during team execution when the lead reports progress mid-milestone. Commands use this format for any mid-execution status update.

### Display Template

```
--- Progress Report ---
Team: {team_name} ({template_name} template)
Tasks: {completed_count}/{total_count} completed

Active:
  - {task_description} [{assignee_role}] (in progress)
  - {task_description} [{assignee_role}] (in progress)

Blocked:
  - {task_description} [{assignee_role}]: {blocker_reason}

Estimated remaining: {remaining_estimate}
```

### Field Definitions

| Field | Description |
|-------|-------------|
| `team_name` | Name of the active team instance |
| `template_name` | Template used (implementation, review, planning) |
| `completed_count` | Number of tasks marked complete (quality gates passed) |
| `total_count` | Total tasks in the milestone/scope, including discovered work |
| `task_description` | Brief description of the task from the shared task list |
| `assignee_role` | Role name of the teammate working on the task (e.g., "Frontend", "Quality") |
| `blocker_reason` | Short explanation of what is blocking the task |
| `remaining_estimate` | Rough estimate of remaining work (e.g., "3-5 tasks, ~2 hours") |

### Display Rules

- Omit the "Blocked" section entirely if there are no blocked tasks
- List at most 5 active tasks; if more, show count instead (e.g., "and 3 more active tasks")
- The lead produces this report when requested by the caller or at natural checkpoints (e.g., every 3-5 completed tasks per FR-CW2)

---

## Completion Report Format

Displayed when a team finishes its work and shuts down. This is the final output of a team command invocation.

### Display Template

```
--- Completion Report ---
Team: {team_name} ({template_name} template)
Duration: {duration}
Tasks: {completed_count}/{total_count} completed

Summary by role:
  {role_name}: {work_summary}
  {role_name}: {work_summary}
  {role_name}: {work_summary}

Discovered work:
  - {discovered_task_description} (added to implementation plan / filed as follow-up)
  - {discovered_task_description}

Files modified:
  - {file_path}
  - {file_path}

Quality gates:
  - {gate_name}: {verdict} ({details})
  - {gate_name}: {verdict} ({details})
```

### Field Definitions

| Field | Description |
|-------|-------------|
| `team_name` | Name of the team instance |
| `template_name` | Template used (implementation, review, planning) |
| `duration` | Wall-clock time from team creation to shutdown (e.g., "47 minutes") |
| `completed_count` | Number of tasks completed |
| `total_count` | Total tasks (original + discovered) |
| `role_name` | Role name from the template (e.g., "Lead", "Frontend", "Quality") |
| `work_summary` | 1-2 sentence summary of what this role accomplished |
| `discovered_task_description` | Work discovered during execution that was not in the original scope |
| `file_path` | Files created or modified during the team session |
| `gate_name` | Quality gate that was evaluated (e.g., "Code Review", "Security Review") |
| `verdict` | Gate result: PASS, WARN, or FAIL |
| `details` | Brief context (e.g., "2 medium findings documented", "all checks passed") |

### Display Rules

- Omit "Discovered work" section if no new work was found
- Omit "Quality gates" section if no gates were evaluated (e.g., planning teams)
- List at most 20 modified files; if more, show count instead (e.g., "and 12 more files")
- Each role's work summary should be 1-2 sentences max
- The completion report is produced by the lead as the final action before shutdown

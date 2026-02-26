# TeammateIdle Hook: Work Assignment Gate

> Behavioral reference for the `TeammateIdle` hook. The shell shim at `scripts/teammate-idle-gate.sh` is the entry point; this file defines the task-matching, dependency, and assignment logic used by the prompt-mediated system.

<!--
  Design principle (D5): Hook scripts are thin shell shims with no business
  logic. All routing and decision-making logic lives here in markdown, where
  it is maintainable, testable, and version-controlled alongside the plugin.

  This hook implements FR-HK3 from the Synthex+ PRD (docs/reqs/plus.md).
-->

## Purpose

When a teammate has no active tasks and becomes idle, this hook determines whether pending work exists that the teammate should pick up. The goal is to maximize team throughput by keeping specialists productive without creating dependency violations or forced cross-functional assignments.

**Exit codes:**

| Code | Meaning | Action Taken |
|------|---------|--------------|
| 0 | Allow idle | No matching work available. Teammate may be dismissed by the lead. |
| 2 | Keep working | A pending task was assigned to the idle teammate. Teammate continues. |

## Task Matching

When the hook fires, check the shared task list for pending tasks that match the idle teammate's role. Only consider tasks with status `pending` and no current owner.

### Role-to-Task Matching Table

| Teammate Role | Matching Task Types | Rationale |
|---------------|-------------------|-----------|
| Lead | Any unassigned task | The lead is the generalist fallback. If no specialist is available, the lead picks up the work. |
| Frontend | Frontend implementation tasks, UI component tasks | Tasks involving component authoring, styling, layout, or design system integration. |
| Quality | Test-writing tasks, coverage analysis tasks | Tasks involving unit tests, integration tests, E2E tests, or coverage gap remediation. |
| Reviewer | Review tasks created by the TaskCompleted hook | Code review tasks routed by `task-completed-gate.sh` for craftsmanship and convention compliance. |
| Security | Security review tasks created by the TaskCompleted hook | Security-focused review tasks routed by `task-completed-gate.sh` for vulnerability and access control analysis. |

### Matching Priority

When multiple pending tasks match the idle teammate's role:

1. Select the task with the **lowest task number** (highest priority). Lower task numbers represent earlier plan tasks, which are more likely to unblock downstream work.
2. If two tasks have the same priority, prefer the one that **unblocks the most other tasks** (i.e., the one that appears in the most `blockedBy` lists of other pending tasks).

## Dependency Respect

Only assign tasks whose dependencies are **all satisfied**. This is a hard constraint with no exceptions.

### Rules

1. Check the task's `blockedBy` list. Every task ID in that list must have status `completed`.
2. If any `blockedBy` task is still `pending` or `in_progress`, the task is **blocked** and must not be assigned.
3. Never assign a blocked task. Assigning blocked tasks creates deadlocks where the teammate waits for work that cannot proceed, wasting context window budget and stalling the team.
4. If the highest-priority matching task is blocked, skip it and evaluate the next-highest-priority matching task. Continue until an unblocked match is found or no matches remain.

### Dependency Check Pseudocode

```
for each candidate_task in matching_tasks (sorted by task number ascending):
    blocked = false
    for each dep_id in candidate_task.blockedBy:
        dep_task = TaskGet(dep_id)
        if dep_task.status != "completed":
            blocked = true
            break
    if not blocked:
        return candidate_task   # assign this one
return null   # no assignable tasks
```

## Cross-Functional Help

When no role-matching tasks exist for the idle teammate, the hook consults the `allow_cross_functional` configuration setting to determine whether to suggest out-of-role work.

### When `allow_cross_functional` is `false` (default)

Skip this step entirely. Proceed directly to the dismissal flow. This is the default because cross-functional work risks lower-quality output when a specialist operates outside their domain.

**Config path:** `hooks.teammate_idle.work_assignment.allow_cross_functional`

### When `allow_cross_functional` is `true`

1. Search the task list for any unblocked, unassigned, pending tasks regardless of role match.
2. If candidates exist, **suggest** (do not force) a cross-functional assignment to the idle teammate via their mailbox.
3. The suggestion message must include:
   - The task description and acceptance criteria
   - An explicit note that this is outside the teammate's primary role
   - A clear statement that the teammate may accept or decline
4. If the teammate **accepts**, assign the task (exit code 2).
5. If the teammate **declines**, proceed to the dismissal flow (exit code 0).

### Cross-Functional Pairing Examples

| Idle Teammate | Suggested Cross-Functional Work |
|---------------|-------------------------------|
| Frontend | Component test writing (overlaps with UI knowledge) |
| Quality | Documentation for tested features (overlaps with acceptance criteria knowledge) |
| Reviewer | Writing missing tests for code they reviewed (overlaps with code familiarity) |
| Security | Writing security-focused test cases (overlaps with threat model knowledge) |

Cross-functional work is always a **suggestion**, never an automatic assignment. The teammate's expertise is self-assessed, and they are in the best position to judge whether they can contribute effectively outside their role.

## Dismissal

When no work remains for the idle teammate -- no role-matching tasks, and no cross-functional opportunities (or cross-functional is disabled) -- the hook allows the teammate to go idle.

### Behavior

1. **Exit code 0** (allow idle).
2. Notify the team lead via mailbox that the teammate is available for dismissal. The notification must include:
   - The idle teammate's name and role
   - Confirmation that no matching pending tasks remain
   - Whether cross-functional search was attempted (and the result, if so)
3. The **lead decides** whether to dismiss the teammate or keep them available for future tasks. This hook does not make the dismissal decision -- it provides the information the lead needs.

### Why the Lead Decides

Dismissal is a lifecycle decision that requires broader context: Are more tasks likely to be created? Is discovered work expected? Is the milestone nearly complete? The lead has this context; the hook does not.

## Assignment Action

When a matching, unblocked task is found for the idle teammate, the hook assigns it and keeps the teammate working.

### Steps

1. **Exit code 2** (keep teammate working).
2. **Update the task** via `TaskUpdate`:
   - Set `owner` to the idle teammate's name
   - Set `status` to `in_progress`
3. **Notify the teammate** via mailbox with:
   - The task ID and description
   - Acceptance criteria (from the task description)
   - Any relevant file paths or spec references
   - Dependencies that were completed (so the teammate has context on prerequisite work)
4. **Notify the lead** via mailbox that the assignment was made, including the task ID and the assigned teammate's name. This keeps the lead's progress picture current.

### Assignment Message Format

The mailbox notification to the teammate should follow this structure:

```
New task assigned: {task_id}

Description: {task_description}

Acceptance criteria:
{acceptance_criteria}

Context:
- Completed dependencies: {completed_dep_ids}
- Relevant files: {file_references}

Assigned because: You are idle and this is the highest-priority unblocked task matching your role ({role_name}).
```

## Configuration Reference

All configurable settings for this hook live under `hooks.teammate_idle.work_assignment` in the project configuration file (`.synthex-plus/config.yaml`). See `plugins/synthex-plus/config/defaults.yaml` for the canonical defaults.

| Setting | Config Path | Default | Description |
|---------|------------|---------|-------------|
| Enabled | `hooks.teammate_idle.work_assignment.enabled` | `true` | Whether the idle hook assigns work at all. When `false`, the hook always exits 0 (allow idle). |
| Cross-functional | `hooks.teammate_idle.work_assignment.allow_cross_functional` | `false` | Whether to suggest out-of-role tasks when no role-matching work exists. |

### Interaction with Other Configuration

| Related Setting | Config Path | Relevance |
|----------------|------------|-----------|
| Max concurrent tasks | `task_list.max_concurrent_tasks` | If the team already has this many tasks in progress, the hook should not assign additional work even if the teammate is idle. This is a soft limit -- warn the lead rather than hard-block. |
| Stuck task timeout | `lifecycle.stuck_task_timeout_minutes` | If an idle teammate was previously stuck on a task (timeout intervention by lead), the hook should still assign new work normally. The stuck task handling is the lead's responsibility. |

## Decision Flowchart

```
TeammateIdle event fires
    |
    v
Is work_assignment.enabled?
    |-- No --> exit 0 (allow idle)
    |-- Yes
        |
        v
    Find pending tasks matching teammate's role
        |
        v
    Filter to unblocked tasks (all blockedBy completed)
        |
        v
    Any unblocked matches?
        |-- Yes --> Assign highest priority (lowest task #)
        |           --> TaskUpdate(owner, in_progress)
        |           --> Notify teammate via mailbox
        |           --> Notify lead via mailbox
        |           --> exit 2 (keep working)
        |
        |-- No --> Is allow_cross_functional true?
                    |-- No --> Notify lead (teammate available for dismissal)
                    |          --> exit 0 (allow idle)
                    |
                    |-- Yes --> Find any unblocked pending tasks
                                |-- Found --> Suggest to teammate via mailbox
                                |             --> Teammate accepts? --> Assign, exit 2
                                |             --> Teammate declines? --> Notify lead, exit 0
                                |
                                |-- None --> Notify lead (teammate available for dismissal)
                                            --> exit 0 (allow idle)
```

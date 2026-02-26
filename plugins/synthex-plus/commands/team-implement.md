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

<!-- Workflow steps are added incrementally by Tasks 15-26 -->

# Synthex+

Teams-optimized orchestration for Synthex. Sustained multi-agent collaboration via Claude Code Agent Teams.

Synthex+ extends the [Synthex](../synthex/) plugin with persistent team commands where agents share a task list, exchange messages via mailboxes, and coordinate autonomously. Unlike standard Synthex commands that spawn ephemeral subagents (each unaware of the others), Synthex+ creates persistent teams with cross-agent communication, shared context, and coordinated execution.

## Prerequisites

1. **Synthex plugin installed.** Synthex+ uses Synthex agent definitions for teammate identities. Install and initialize Synthex first (`/init`).

2. **Agent Teams feature flag.** Set the experimental flag in your environment:

   ```bash
   export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
   ```

   Or add it to `~/.claude/settings.json` under `env`. All Synthex+ commands check for this flag and will abort with guidance if it is missing.

## Quick Start

```bash
# 1. Initialize Synthex+ configuration
/team-init

# 2. Run your first team implementation (targets the current incomplete milestone)
/team-implement
```

`team-init` creates `.synthex-plus/config.yaml` with default settings and adds it to `.gitignore`. From there, team commands work out of the box with sensible defaults.

## Commands

### team-implement

Sustained multi-agent implementation. The teams-optimized equivalent of Synthex's `next-priority` command.

Creates a persistent team (Tech Lead, Frontend Engineer, Quality Engineer, Code Reviewer, Security Reviewer) that executes implementation plan tasks concurrently with real-time coordination.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `implementation_plan_path` | Path to the implementation plan | `docs/plans/main.md` |
| `template` | Team composition template | `implementation` |
| `milestone` | Specific milestone to execute (e.g., "2.1") | First incomplete milestone |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` |

**Example invocations:**

```bash
# Execute the next incomplete milestone with defaults
/team-implement

# Target a specific milestone
/team-implement milestone="2.1"

# Use a custom plan path
/team-implement implementation_plan_path="docs/plans/mobile-v2.md"
```

### team-review

Multi-perspective code review with cross-domain communication. The teams-optimized equivalent of Synthex's `review-code` command.

Creates a persistent review team where reviewers (Code Reviewer, Security Reviewer, and optionally Performance Engineer and Design System Agent) work concurrently and can alert each other to cross-domain issues -- for example, the Code Reviewer can flag a potential security concern directly to the Security Reviewer via mailbox.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `target` | File paths, directory, or git diff range | Staged changes |
| `template` | Team composition template | `review` |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` |

**Example invocations:**

```bash
# Review staged changes
/team-review

# Review a specific git range
/team-review target="main..HEAD"

# Review specific files
/team-review target="src/auth/ src/api/routes.ts"
```

The Design reviewer is automatically included when the changeset contains frontend files (`.tsx`, `.jsx`, `.css`, `.scss`). The Performance reviewer can be enabled via project config (`review.include_performance: true`) or explicit request.

### team-plan

Collaborative implementation planning with persistent reviewers. The teams-optimized equivalent of Synthex's `write-implementation-plan` command.

Creates a planning team (Product Manager, Architect, Design System Agent, Tech Lead) where the PM drafts a plan and reviewers evaluate it concurrently. Reviewers persist across review cycles, maintaining full context of the plan's evolution -- unlike standard planning where fresh subagents are spawned each cycle.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `requirements_path` | Path to the PRD | `docs/reqs/main.md` |
| `plan_path` | Output path for the plan | `docs/plans/main.md` |
| `template` | Team composition template | `planning` |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` |

**Example invocations:**

```bash
# Plan from the default PRD
/team-plan

# Plan from a specific PRD to a specific output path
/team-plan requirements_path="docs/reqs/mobile-v2.md" plan_path="docs/plans/mobile-v2.md"
```

## Team Templates

Each command uses a team template that defines roles, communication patterns, and task decomposition rules. Three templates ship with the plugin:

| Template | Roles | Use When |
|----------|-------|----------|
| **implementation** | Tech Lead (lead), Frontend Engineer, Quality Engineer, Code Reviewer, Security Reviewer | Multi-component features spanning 3+ files across 2+ system layers; estimated work exceeds 4 hours |
| **review** | Orchestrator (lead), Code Reviewer, Security Reviewer, Performance Engineer (optional), Design System Agent (optional) | Diffs exceeding 500 lines, security-sensitive changes, or pre-release review requiring multi-perspective sign-off |
| **planning** | Product Manager (lead), Architect, Design System Agent, Tech Lead | PRDs with 10+ requirements, multi-phase plans, or projects with significant architectural decisions |

For smaller or single-domain tasks, use the standard Synthex commands (`next-priority`, `review-code`, `write-implementation-plan`) instead.

Templates are defined in `plugins/synthex-plus/templates/` and can be customized or extended. Each template uses the **read-on-spawn** pattern: teammates read their full Synthex agent definition file at spawn time, ensuring complete behavioral fidelity without condensed summaries.

## Cost Model

Teams use more tokens than sequential subagent execution because multiple agents run concurrently with persistent context. Before creating a team, each command displays a cost estimate:

```
Team cost estimate (approximate):
  Subagent approach (next-priority): ~200,000 tokens
  Team approach (team-implement):    ~1,500,000 tokens (~7.5x multiplier)

  Note: This is a prompt-based approximation. Actual usage varies
  based on task complexity, tool invocations, and review cycles.

  Proceed with team creation? [Y/n]
```

The formula assumes all teammates interact with all tasks (conservative upper bound). In practice, implementation teams cost less because specialists only handle role-relevant tasks. Review and planning teams are closer to the estimate since all reviewers examine the full scope.

To disable the cost prompt, set `cost_guidance.show_cost_comparison: false` in your project config.

For full details on the cost formulas and variable sources, see [`docs/output-formats.md`](docs/output-formats.md).

## Configuration

Synthex+ follows a **convention over configuration** approach. All commands work out of the box with embedded defaults. To customize settings for your project, run `/team-init` and edit `.synthex-plus/config.yaml`.

**Config resolution order:** command parameter > project config > plugin defaults > hardcoded fallback.

Key configuration sections:

| Section | Description | Example Setting |
|---------|-------------|-----------------|
| `teams` | Default template for each command type | `default_implementation_template: implementation` |
| `hooks` | Quality gates on task completion and idle detection | `task_completed.review_gate.enabled: true` |
| `cost_guidance` | Token estimation constants and display toggle | `base_tokens_per_teammate: 50000` |
| `review_loops` | Max review cycles and minimum severity threshold | `max_cycles: 3`, `min_severity_to_address: high` |
| `task_list` | Context mode and concurrency limits for shared tasks | `context_mode: references` |
| `lifecycle` | Stuck task timeout and per-invocation task limits | `stuck_task_timeout_minutes: 30` |
| `documents` | Default paths for PRD, plan, and specs | `requirements: docs/reqs/main.md` |

The full reference with inline documentation is at [`config/defaults.yaml`](config/defaults.yaml).

## Context Management

Teams operate in independent context windows that may be compacted during long sessions. Synthex+ addresses this through:

- **Shared task list as durable memory.** Task descriptions and completion notes persist across compaction events. Teammates check the task list for current state before starting new work.
- **Progressive summarization.** The team lead produces periodic progress summaries (every 3-5 completed tasks) that serve as the authoritative history.
- **Milestone scope limits.** Each `team-implement` invocation targets one milestone. Milestones exceeding 15 tasks should be split for better context management.
- **Reference-based task descriptions.** The default `references` context mode keeps task descriptions compact by pointing to files and specs rather than inlining full content.

For detailed guidance, see [`docs/context-management.md`](docs/context-management.md).

## Graceful Degradation

If the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` flag is not set, all team commands abort before creating any resources and suggest the equivalent standard Synthex command as a fallback. No team resources are created, no tokens are consumed, and the user can choose how to proceed.

## Further Reading

- [`config/defaults.yaml`](config/defaults.yaml) -- Full configuration reference
- [`docs/output-formats.md`](docs/output-formats.md) -- Canonical output format definitions (cost estimate, progress report, completion report)
- [`templates/`](templates/) -- Team template definitions
- [Synthex plugin](../synthex/) -- Base plugin with agent definitions and standard commands

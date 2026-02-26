# Team Plan

Collaborative implementation planning using a persistent agent team instead of ephemeral subagent instances. This is the teams-optimized equivalent of Synthex's `write-implementation-plan` command.

Teams provide concurrent, multi-perspective plan review where reviewers share context across cycles, discuss cross-cutting concerns directly with each other, and maintain awareness of the plan's evolution. Unlike `write-implementation-plan` which spawns fresh reviewer subagents each cycle (losing all context), `team-plan` creates a persistent team where reviewers accumulate understanding across iterations -- producing higher-quality feedback in later cycles.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `requirements_path` | Path to the PRD | Value from config `documents.requirements`, falling back to `docs/reqs/main.md` | No |
| `plan_path` | Output path for the plan | Value from config `documents.implementation_plan`, falling back to `docs/plans/main.md` | No |
| `template` | Team composition template | Value from config `teams.default_planning_template`, falling back to `planning` | No |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` | No |

**Config resolution order:** command parameter > project config (`{config_path}`) > plugin defaults (`config/defaults.yaml`) > hardcoded fallback.

## Workflow

### 1. Load Configuration

Same resolution chain as `team-implement` Step 1. Load the Synthex+ configuration using:

1. **Command parameter:** If `config_path` was provided, use that file
2. **Project config:** Read `.synthex-plus/config.yaml` from the project root
3. **Plugin defaults:** Read `plugins/synthex-plus/config/defaults.yaml` (relative: `../config/defaults.yaml`)
4. **Hardcoded fallback:** Use embedded defaults for critical values

Extract the following values for use in subsequent steps:
- `teams.default_planning_template` -- template name (unless overridden by `template` parameter)
- `cost_guidance.*` -- cost estimation constants
- `review_loops.*` -- review cycle limits and severity thresholds
- `documents.*` -- default document paths

### 2. Read PRD

Read the PRD at `@{requirements_path}`. Understand:
- The product vision and purpose
- Target users and their needs
- All functional and non-functional requirements
- What is explicitly out of scope
- Success metrics

### 3. Gather Technical Context

Read available technical specifications and project context:
- Check `@{specs_path}` (from config `documents.specs`, default `docs/specs`) for existing technical specs (architecture, frontend, design system)
- Check `@CLAUDE.md` for project conventions, patterns, and constraints
- Check `package.json` or equivalent for current tech stack
- Understand the current state of the codebase (what already exists)

### 4. User Interview

**This step is ported from Synthex's `write-implementation-plan` command (Step 4).**

Launch the **Product Manager sub-agent** to conduct an interactive Q&A with the user. The PM uses the `AskUserQuestion` tool to surface questions directly to the human user. The PM should:
- Clarify any ambiguous or incomplete requirements from the PRD
- Confirm priorities and scope boundaries
- Understand constraints not captured in the PRD (technical debt, team skills, timeline pressure)
- Fill gaps before drafting the plan

The PM asks questions in small batches (3-5 at a time) using `AskUserQuestion`, adapting follow-ups based on answers. This ensures the plan is grounded in a thorough understanding of the user's intent.

**Important:** The PM must use `AskUserQuestion` (not plain text output) so that questions reach the human user even when the PM is running as a sub-agent.

### 5. PM Drafts Initial Plan

The Product Manager produces an initial implementation plan draft following the standard template. The draft must include:
- Phased milestones delivering incremental value
- Specific, executable tasks with complexity grades (S/M/L)
- Dependencies and critical path identified
- Parallelizable work explicitly called out
- A **Decisions** section documenting major planning decisions and rationale
- An **Open Questions** section tracking items needing further discovery

Every task must trace back to a requirement in the PRD. Prioritize developer infrastructure and tooling in early milestones (unblocks everything else). Each milestone must produce a working, demonstrable increment.

### 6. Pre-Flight Checks

Same checks as `team-implement` Step 3 (FR-LM1). Run three validation checks before creating the team:

#### 6a. One-team-per-session check

Verify no existing team is active in the current session. If an active team is found, abort immediately.

#### 6b. Dependency check (Synthex plugin)

Verify that agent files referenced by the planning template are accessible. Emit warnings for missing files (not hard failures).

#### 6c. Orphan detection

Scan `~/.claude/teams/` for leftover team resources from previous sessions. Emit warnings for orphaned resources.

**Pre-flight outcome:** If the one-team-per-session check fails, abort. All other checks are warnings only.

### 7. Cost Estimate

Display an approximate token cost comparison per the canonical template in `plugins/synthex-plus/docs/output-formats.md`.

**Skip check:** If `cost_guidance.show_cost_comparison` is `false`, skip this step entirely and proceed directly to team creation.

**Calculate variables:**
- `num_tasks` = count of review tasks (one per reviewer role per cycle -- use 1 cycle for estimate: typically 3 reviewers = 3 tasks)
- `num_teammates` = count of roles in the planning template
- Apply the standard cost formulas from `output-formats.md`

**Display the cost estimate** using the canonical display template. For `team-plan`:
- `{fallback_command}` = `write-implementation-plan`
- `{team_command}` = `team-plan`

Include this caveat: the formula assumes all teammates interact with all tasks, which is a conservative upper bound. For planning teams, the estimate is relatively close to actual because all reviewers examine the full plan.

**User confirmation:** Prompt "Proceed with team creation? [Y/n]". If the user declines, abort gracefully.

### 8. Create Team

Compose and issue a team creation prompt using the **read-on-spawn pattern** (ADR-plus-001). Same mechanism as `team-implement` Step 5.

#### 8a. Read the planning template

Read the template file determined in Step 1 (default: `plugins/synthex-plus/templates/planning.md`). Extract:

- **Roles table** -- Role name, Synthex agent file path, required flag, and team-specific behavioral overlay for each teammate
- **Communication patterns section** -- Mailbox conventions, cross-reviewer messaging rules
- **Task decomposition guidance section** -- How the PM creates review tasks, concurrent execution, severity thresholds

#### 8b. Compose the team creation prompt

For each role in the template's roles table, compose a spawn prompt with three layers:

1. **Identity (read-on-spawn):**
   ```
   Read your agent definition at {agent_file_path} and adopt it as your identity.
   ```
   The teammate reads the complete Synthex agent markdown file as its first action. No condensed summaries -- the canonical agent file IS the identity.

2. **Team-specific behavioral overlay:**
   Sourced from the template's roles table "Team-Specific Behavioral Overlay" column. Includes mailbox conventions, task list conventions, and communication patterns.

3. **Context:**
   - Reference to `CLAUDE.md` for project conventions
   - Reference to relevant specs (from config `documents.specs`)
   - The PRD being planned against (`@{requirements_path}`)
   - The initial plan draft (produced in Step 5)
   - Review focus area and minimum severity threshold from config `review_loops.min_severity_to_address`

#### 8c. Include auto-compaction guidance (FR-CW3)

Same guidance as `team-implement` Step 5c. Teammates should rely on the task list as their primary memory, not their conversation context. When in doubt about prior state, check the task list and mailbox before re-doing work.

#### 8d. Team naming convention

The team name follows the pattern: `plan-{sanitized-prd-name}` where `{sanitized-prd-name}` is derived from the PRD filename.

Sanitization rules:
- Take the PRD filename without extension (e.g., `main.md` becomes `main`)
- Replace spaces and special characters with hyphens
- Lowercase all characters
- Example: `docs/reqs/main.md` produces team name `plan-main`
- Example: `docs/reqs/Mobile App v2.md` produces team name `plan-mobile-app-v2`

#### 8e. Issue the team creation prompt

After composing the prompt:
- Issue the team creation prompt to Claude Code using the `Teammate` tool with the `spawnTeam` operation
- Each role from the template becomes a named teammate in the spawn call
- Wait for confirmation that the team was created successfully
- If team creation fails, display the error and abort -- do not retry automatically

### 9. Post-Creation Verification

Same checks as `team-implement` Step 6 (FR-TCM2). Verify:
- Team metadata exists at `~/.claude/teams/{team-name}/config.json`
- Teammate count matches the template's roles table
- All required roles are present

Handle missing roles per `team-implement` Step 6b (required = abort with cleanup, optional = warn and continue). Fall back to prompt-based verification per `team-implement` Step 6c if metadata is inaccessible.

Display verification summary:
```
Team "plan-{sanitized-prd-name}" created successfully.
Roles: {role_count}/{expected_count} spawned
  - Lead (product-manager): ready
  - Architect (architect): ready
  - Designer (design-system-agent): ready
  - Implementer (tech-lead): ready
```

### 10. Concurrent Review

The PM creates one review task per reviewer (Architect, Designer, Implementer) on the shared task list. Each task includes:

- The plan draft (inline for small plans, file reference for large ones)
- The reviewer's specific focus area (from the template's roles table)
- The minimum severity to address (from config `review_loops.min_severity_to_address`)
- Guidance on what changed since the last cycle (first cycle: "Initial draft -- full review required")

Reviewers claim their tasks and execute concurrently. Each produces structured findings with severity levels (CRITICAL/HIGH/MEDIUM/LOW) following the format defined in Synthex's `write-implementation-plan` Step 6b.

No dependency chains between reviewer tasks within a cycle -- all three reviewers work in parallel.

### 11. Cross-Cutting Discussion

This is the key advantage over sequential subagent review. Reviewers message each other directly via `SendMessage` for cross-concern findings:

- **Architect to Implementer:** Sequencing concerns that affect task breakdown, feasibility issues that change complexity estimates
- **Architect to Designer:** Architecture decisions that constrain design patterns
- **Designer to Implementer:** Design tasks that need specific acceptance criteria, component-level requirements affecting implementation
- **Implementer to Architect:** Dependency chain errors, unrealistic complexity grades

Discovered concerns outside a reviewer's focus area are routed via `SendMessage` to the relevant reviewer, not added to the discoverer's own findings.

### 12. PM Addresses Feedback

PM receives all reviewer feedback (from completed review tasks on the shared task list) and:

1. **Must address** all findings at or above `review_loops.min_severity_to_address` (default: high). CRITICAL and HIGH findings require explicit resolution or documented rationale for deferral.
2. **May address** findings below the threshold at PM discretion.
3. **Has final say** on requirements content -- if a reviewer suggests changing *what* to build, the PM decides. Feedback on *clarity* (is this task clear enough to execute?) carries high weight.
4. **Asks the user** for guidance when unsure how to handle feedback -- especially architectural trade-offs, scope questions, or conflicting reviewer opinions.
5. Documents how each finding at or above the severity threshold was addressed (accepted, modified, or rejected with reasoning).

### 13. Re-Review (if needed)

If the PM made significant changes, submit the revised plan for another review cycle.

**Key difference from `write-implementation-plan`:** Reviewers persist across cycles -- no fresh subagent spawning. The PM creates new review tasks for cycle N+1 on the shared task list, including guidance on what changed since cycle N to focus reviewer attention. Because reviewers maintain full context of the plan's evolution, they produce more targeted feedback in later cycles.

Continue until:
- All findings at or above `review_loops.min_severity_to_address` are addressed, OR
- `review_loops.max_cycles` is reached (default: 3 for planning, per config)

If max cycles are reached with unresolved findings, document them in the plan's Open Questions section with the original severity, reviewer attribution, and PM rationale for deferral.

The PM tracks the current cycle number and enforces the limit. Review cycle counting is enforced against `review_loops.max_cycles`.

### 14. Compactness Pass

After the review loop completes, the PM does a final compactness review:
- Remove redundant or duplicated information
- Tighten language -- say more with fewer words
- Ensure no information is lost in the process
- The plan will be loaded into agent context windows, so every unnecessary line costs capacity

**Rule of thumb:** If a section can be 30% shorter without losing meaning, make it shorter.

### 15. Write Plan

Write the finalized implementation plan to `@{plan_path}`.

The plan follows the standard implementation plan template structure:

```markdown
# Implementation Plan: [Product Name]

## Overview
[Brief summary linking back to the PRD. 2-3 sentences.]

## Decisions
| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | [What was decided] | [Why this came up] | [Why we chose this path] |

## Open Questions
| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | [What we need to figure out] | [What it could affect] | Open |

## Phase 1: [Name -- Delivers X Value]

### Milestone 1.1: [Name]
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 1 | [Task description] | S/M/L | None | pending |

**Parallelizable:** Tasks X and Y can run concurrently.
**Milestone Value:** [What the user gets when this milestone is complete]

### Milestone 1.2: [Name]
...
```

### 16. Graceful Shutdown

Follows the same pattern as `team-implement` Step 10.

#### 16a. Completion check

The PM confirms all review cycles are complete and the final plan has been written.

#### 16b. Completion report

Produce the completion report using the canonical **Completion Report Format** from `plugins/synthex-plus/docs/output-formats.md`. Omit the "Quality gates" section (planning teams do not evaluate code quality gates). Include:
- Summary of work by each role (PM, Architect, Designer, Implementer)
- Review cycles completed and findings addressed
- The output file path (`@{plan_path}`)

#### 16c. Ordered shutdown

Same sequence as `team-implement` Step 10c:
1. Non-lead teammates shut down first (Architect, Designer, Implementer)
2. Lead (PM) shuts down last

#### 16d. Resource cleanup and orphan tracking

Same as `team-implement` Steps 10d and 10e. Clean up team resources and remove the `.synthex-plus/.active-team` tracking file.

## Graceful Degradation

Agent Teams requires the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable. This check runs **before Step 6 (Pre-Flight Checks)** -- if the flag is missing, none of the team creation steps are reached.

**Detection:** Check whether `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set to `1`. If not:

```
Agent Teams requires the experimental feature flag.
Set the following environment variable and restart Claude Code:

  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

This flag enables the Agent Teams API used by Synthex+ commands.
```

Then offer the standard Synthex fallback:

```
Alternatively, you can use the standard Synthex command:

  /synthex:write-implementation-plan @{requirements_path}

This uses sequential subagent review instead of persistent teams.
```

Present both options and let the user decide.

## Error Handling

### Teammate failure

Same recovery as `team-implement`: the PM detects failure through lack of task activity, messages the stopped teammate, and if unresponsive, unclaims their review tasks and reassigns or handles directly.

### Lead (PM) failure

Best-effort cleanup: send shutdown signals to all remaining teammates. Report the team name for manual verification.

### Cleanup failure

Same as `team-implement`: report the team name and resource locations for manual intervention. Do NOT retry automatically.

## Orphan Prevention

Same mechanism as `team-implement`. The `.synthex-plus/.active-team` tracking file records the team name during creation (Step 8e) and is deleted during shutdown (Step 16d). Pre-flight checks (Step 6c) detect orphaned teams from previous sessions.

## Key Differences from write-implementation-plan

| Aspect | write-implementation-plan | team-plan |
|--------|--------------------------|-----------|
| Review model | Sequential subagent review -- fresh instances each cycle | Concurrent persistent review -- reviewers maintain context across cycles |
| Cross-domain feedback | Isolated -- reviewers cannot communicate | Direct messaging between reviewers via SendMessage |
| Context preservation | Lost each cycle (fresh subagents) | Maintained across cycles (persistent teammates) |
| Review execution | One reviewer at a time | All reviewers work in parallel |
| PM authority | PM has final say on requirements | Same -- PM has final say on requirements |
| User interview | PM conducts interactive Q&A | Same -- identical user interview step |
| Output format | Standard implementation plan template | Same -- identical output format |

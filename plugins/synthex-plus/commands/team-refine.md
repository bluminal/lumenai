# Team Refine

Collaborative PRD refinement using a persistent agent team instead of ephemeral subagent instances. This is the teams-optimized equivalent of Synthex's `refine-requirements` command.

Teams provide concurrent, multi-perspective PRD review where reviewers share context across cycles, discuss cross-cutting concerns directly with each other, and maintain awareness of the PRD's evolution. Unlike `refine-requirements` which spawns fresh reviewer subagents each cycle (losing all context), `team-refine` creates a persistent team where reviewers accumulate understanding across iterations -- producing higher-quality feedback in later cycles.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `requirements_path` | Path to the PRD | Value from config `documents.requirements`, falling back to `docs/reqs/main.md` | No |
| `template` | Team composition template | Value from config `teams.default_refine_template`, falling back to `refine` | No |
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
- `teams.default_refine_template` -- template name (unless overridden by `template` parameter)
- `cost_guidance.*` -- cost estimation constants
- `review_loops.*` -- review cycle limits and severity thresholds
- `documents.*` -- default document paths

### 2. Read PRD

Read the PRD at `@{requirements_path}` thoroughly. Build a mental model of:
- The product vision and purpose
- Target users and their needs
- All functional and non-functional requirements
- What is explicitly out of scope
- Success metrics

### 3. Gather Technical Context

Read available technical context to inform whether reviewer questions already have answers:
- Check `@{specs_path}` (from config `documents.specs`, default `docs/specs`) for existing technical specs
- Check `@CLAUDE.md` for project conventions, patterns, and constraints
- Check `package.json` or equivalent for current tech stack
- Understand the current state of the codebase (what already exists)

This context is critical -- it lets the PM answer reviewer questions without bothering the user when the answers are already documented.

### 4. Pre-Flight Checks

Same checks as `team-implement` Step 3 (FR-LM1). Run three validation checks before creating the team:

#### 4a. One-team-per-session check

Verify no existing team is active in the current session. If an active team is found, abort immediately.

#### 4b. Dependency check (Synthex plugin)

Verify that agent files referenced by the refine template are accessible. Emit warnings for missing files (not hard failures).

#### 4c. Orphan detection

Scan `~/.claude/teams/` for leftover team resources from previous sessions. Emit warnings for orphaned resources.

**Pre-flight outcome:** If the one-team-per-session check fails, abort. All other checks are warnings only.

### 5. Cost Estimate

Display an approximate token cost comparison per the canonical template in `plugins/synthex-plus/docs/output-formats.md`.

**Skip check:** If `cost_guidance.show_cost_comparison` is `false`, skip this step entirely and proceed directly to team creation.

**Calculate variables:**
- `num_tasks` = count of review tasks (one per reviewer role per cycle -- use 1 cycle for estimate: typically 2 reviewers = 2 tasks)
- `num_teammates` = count of roles in the refine template (3: Lead/PM, Engineer, Designer)
- Apply the standard cost formulas from `output-formats.md`

**Display the cost estimate** using the canonical display template. For `team-refine`:
- `{fallback_command}` = `refine-requirements`
- `{team_command}` = `team-refine`

Include this caveat: the formula assumes all teammates interact with all tasks, which is a conservative upper bound. For refine teams, the estimate is relatively close to actual because both reviewers examine the full PRD.

**User confirmation:** Prompt "Proceed with team creation? [Y/n]". If the user declines, abort gracefully.

### 6. Create Team

Compose and issue a team creation prompt using the **read-on-spawn pattern** (ADR-plus-001). Same mechanism as `team-implement` Step 5.

#### 6a. Read the refine template

Read the template file determined in Step 1 (default: `plugins/synthex-plus/templates/refine.md`). Extract:

- **Roles table** -- Role name, Synthex agent file path, required flag, and team-specific behavioral overlay for each teammate
- **Communication patterns section** -- Mailbox conventions, cross-reviewer messaging rules
- **Task decomposition guidance section** -- How the PM creates review tasks, concurrent execution, severity thresholds

#### 6b. Compose the team creation prompt

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
   - The PRD being refined (`@{requirements_path}`)
   - Technical context gathered in Step 3 (references, not inline)
   - Review focus area and minimum severity threshold from config `review_loops.min_severity_to_address`

#### 6c. Include auto-compaction guidance (FR-CW3)

Same guidance as `team-implement` Step 5c. Teammates should rely on the task list as their primary memory, not their conversation context. When in doubt about prior state, check the task list and mailbox before re-doing work.

#### 6d. Team naming convention

The team name follows the pattern: `refine-{sanitized-prd-name}` where `{sanitized-prd-name}` is derived from the PRD filename.

Sanitization rules:
- Take the PRD filename without extension (e.g., `main.md` becomes `main`)
- Replace spaces and special characters with hyphens
- Lowercase all characters
- Example: `docs/reqs/main.md` produces team name `refine-main`
- Example: `docs/reqs/Mobile App v2.md` produces team name `refine-mobile-app-v2`

#### 6e. Issue the team creation prompt

After composing the prompt:
- Issue the team creation prompt to Claude Code using the `Teammate` tool with the `spawnTeam` operation
- Each role from the template becomes a named teammate in the spawn call
- Wait for confirmation that the team was created successfully
- If team creation fails, display the error and abort -- do not retry automatically

### 7. Post-Creation Verification

Same checks as `team-implement` Step 6 (FR-TCM2). Verify:
- Team metadata exists at `~/.claude/teams/{team-name}/config.json`
- Teammate count matches the template's roles table
- All required roles are present

Handle missing roles per `team-implement` Step 6b (required = abort with cleanup, optional = warn and continue). Fall back to prompt-based verification per `team-implement` Step 6c if metadata is inaccessible.

Display verification summary:
```
Team "refine-{sanitized-prd-name}" created successfully.
Roles: {role_count}/{expected_count} spawned
  - Lead (product-manager): ready
  - Engineer (tech-lead): ready
  - Designer (lead-frontend-engineer): ready
```

### 8. Concurrent Review

The PM creates one review task per reviewer (Engineer, Designer) on the shared task list. Each task includes:

- The PRD (inline for small PRDs, file reference for large ones)
- The reviewer's specific focus area (from the template's roles table)
- The minimum severity to address (from config `review_loops.min_severity_to_address`)
- Technical context references (specs, CLAUDE.md) so reviewers can identify already-answered questions
- Guidance on what changed since the last cycle (first cycle: "Initial PRD -- full review required")

Reviewers claim their tasks and execute concurrently. Each produces structured findings with severity levels (CRITICAL/HIGH/MEDIUM/LOW) following the feedback format:

```markdown
## PRD Review -- [Reviewer Role]

### Findings

#### [CRITICAL] Finding Title
- **Section:** [Which part of the PRD this affects]
- **Issue:** [What is unclear, missing, or ambiguous]
- **Question:** [Specific question that, if answered, would resolve the issue]
- **Suggestion:** [How the PRD could be improved to address this]

### Summary
[Overall assessment: Is the PRD clear enough to build from?]
```

No dependency chains between reviewer tasks within a cycle -- both reviewers work in parallel.

### 9. Cross-Cutting Discussion

This is the key advantage over sequential subagent review. Reviewers message each other directly via `SendMessage` for cross-concern findings:

- **Engineer to Designer:** Technical constraints that affect UX requirements, performance implications of design decisions
- **Designer to Engineer:** UX requirements that imply technical complexity, interaction patterns that need engineering feasibility check
- **Either to PM:** Findings that require product-level decisions or user clarification

Discovered concerns outside a reviewer's focus area are routed via `SendMessage` to the relevant reviewer, not added to the discoverer's own findings.

### 10. PM Triages Findings

PM receives all reviewer feedback (from completed review tasks on the shared task list) and triages each finding:

1. **Check if the answer exists in context** -- If the question can be answered from the technical context gathered in Step 3 (CLAUDE.md, specs, codebase), update the PRD directly. Do NOT escalate to the user questions that already have answers.

2. **Ask the user when necessary** -- If the finding raises a genuine product question requiring user judgment, preferences, or domain knowledge, use `AskUserQuestion`. Batch related questions together (3-5 at a time).

3. **Update the PRD** -- For each addressed finding, revise the relevant section of the PRD so a future reader would not have the same question.

4. **Must address** all findings at or above `review_loops.min_severity_to_address` (default: high). CRITICAL and HIGH findings require explicit resolution or documented rationale for deferral.

5. **May address** findings below the threshold at PM discretion.

6. Documents how each CRITICAL/HIGH finding was addressed (from context, from user input, or deferred with reasoning).

### 11. Re-Review (if needed)

If the PM made significant changes to the PRD, submit the revised version for another review cycle.

**Key difference from `refine-requirements`:** Reviewers persist across cycles -- no fresh subagent spawning. The PM creates new review tasks for cycle N+1 on the shared task list, including guidance on what changed since cycle N to focus reviewer attention. Because reviewers maintain full context of the PRD's evolution, they produce more targeted feedback in later cycles.

Continue until:
- All findings at or above `review_loops.min_severity_to_address` are addressed, OR
- `review_loops.max_cycles` is reached (default: 2)

If max cycles are reached with unresolved findings, add them to an "Open Questions" section at the end of the PRD with the original severity, reviewer attribution, and PM rationale for deferral.

The PM tracks the current cycle number and enforces the limit.

### 12. Write Updated PRD

Write the refined PRD back to `@{requirements_path}`.

Preserve the existing PRD structure and style. Do not reorganize or reformat sections that weren't affected by findings. The changes should feel like natural improvements to the existing document, not a rewrite.

### 13. Graceful Shutdown

Follows the same pattern as `team-implement` Step 10.

#### 13a. Completion check

The PM confirms all review cycles are complete and the refined PRD has been written.

#### 13b. Completion report

Produce the completion report using the canonical **Completion Report Format** from `plugins/synthex-plus/docs/output-formats.md`. Omit the "Quality gates" section (refine teams do not evaluate code quality gates). Include:
- Summary of work by each role (PM, Engineer, Designer)
- Review cycles completed and findings addressed (broken down by: from context vs. from user input)
- Any remaining open questions added to the PRD
- Which sections of the PRD were most improved
- The output file path (`@{requirements_path}`)

#### 13c. Ordered shutdown

Same sequence as `team-implement` Step 10c:
1. Non-lead teammates shut down first (Engineer, Designer)
2. Lead (PM) shuts down last

#### 13d. Resource cleanup and orphan tracking

Same as `team-implement` Steps 10d and 10e. Clean up team resources and remove the `.synthex-plus/.active-team` tracking file.

## When to Use Teams

Use `team-refine` instead of `refine-requirements` when the PRD contains 20+ requirements, spans multiple product areas, or requires extensive cross-perspective feedback where engineering constraints and design decisions interact. The key advantage is that reviewers persist across review cycles -- they maintain context about what they flagged previously, what the PM clarified with the user, and how the PRD evolved, producing more targeted feedback in later cycles. For focused PRDs with fewer than 10 requirements, routine updates, or quick spot-checks, use `refine-requirements` instead.

See `plugins/synthex-plus/docs/decision-guide.md` for the full teams vs. subagents comparison.

## Graceful Degradation

Agent Teams requires the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable. This check runs **before Step 4 (Pre-Flight Checks)** -- if the flag is missing, none of the team creation steps are reached.

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

  /synthex:refine-requirements @{requirements_path}

This uses sequential subagent review instead of persistent teams.
```

Present both options and let the user decide.

## Error Handling

### Reviewer failure

Same recovery as `team-implement`: the PM detects failure through lack of task activity, messages the stopped teammate, and if unresponsive, unclaims their review tasks and handles directly.

### Lead (PM) failure

Best-effort cleanup: send shutdown signals to all remaining teammates. Report the team name for manual verification.

### Cleanup failure

Same as `team-implement`: report the team name and resource locations for manual intervention. Do NOT retry automatically.

## Orphan Prevention

Same mechanism as `team-implement`. The `.synthex-plus/.active-team` tracking file records the team name during creation (Step 6e) and is deleted during shutdown (Step 13d). Pre-flight checks (Step 4c) detect orphaned teams from previous sessions.

## Key Differences from refine-requirements

| Aspect | refine-requirements | team-refine |
|--------|---------------------|-------------|
| Review model | Sequential subagent review -- fresh instances each cycle | Concurrent persistent review -- reviewers maintain context across cycles |
| Cross-domain feedback | Isolated -- reviewers cannot communicate | Direct messaging between reviewers via SendMessage |
| Context preservation | Lost each cycle (fresh subagents) | Maintained across cycles (persistent teammates) |
| Review execution | One reviewer at a time | Both reviewers work in parallel |
| Finding triage | Orchestrator triages findings | Same -- PM triages findings (answerable from context vs. user input) |
| User questions | AskUserQuestion for unknowns | Same -- AskUserQuestion for unknowns |
| Output | Updated PRD (in-place) | Same -- updated PRD (in-place) |

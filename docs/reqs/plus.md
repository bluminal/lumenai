# Product Requirements Document: Synthex+ (Teams-Optimized Orchestration)

## 1. Vision & Purpose

**Why this exists:** Synthex's subagent model works well for focused, single-invocation tasks -- a code review, a plan draft, a coverage analysis. But real software delivery involves sustained, multi-step collaborative work where agents need to coordinate over time, maintain independent context, and communicate directly with each other. Claude Code's experimental Agent Teams feature enables this: multiple independent Claude Code instances sharing a task list, exchanging messages, and persisting until the work is done.

**Synthex+** is a companion plugin that reimagines Synthex's orchestration patterns for the agent teams model. It does not replace Synthex -- it extends it for workflows where independent, long-running, multi-agent collaboration produces better outcomes than the caller-dispatches-subagent pattern.

**The core insight:** Subagents are good at focused analysis within a parent's context. Teams are good at sustained collaborative work where each member needs full autonomy and deep independent context. Synthex+ provides the templates, hooks, and adapted orchestration for the latter.

---

## 2. Target Users / Personas

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Power User** | Developer already using Synthex who hits the ceiling of subagent orchestration on complex projects | Sustained multi-agent collaboration for large features, cross-cutting refactors, or multi-service changes |
| **Team Lead** | Engineering lead managing a codebase where parallel, independent work streams need quality coordination | Parallel execution with quality gates -- multiple agents working independently but held to consistent standards |
| **Synthex Author** | Developer extending Synthex or building custom workflows | Clear patterns for when and how to compose teams vs. subagents, reusable team templates |

**Who should NOT use Synthex+:**
- Developers doing simple, focused tasks (code review, single-file changes, quick analysis) -- standard Synthex is faster, cheaper, and sufficient
- Cost-sensitive users who cannot absorb the ~7x token cost of teams vs. subagents
- Projects where the experimental status of Agent Teams is unacceptable

---

## 3. Functional Requirements

### 3.1 Plugin Structure

**FR-SP1: Directory Layout**

Synthex+ lives as a separate plugin alongside Synthex in the marketplace:

```
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json        # Updated to register synthex-plus
├── plugins/
│   ├── synthex/                # Original plugin (unchanged)
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── agents/
│   │   ├── commands/
│   │   └── config/
│   │       └── defaults.yaml
│   └── synthex-plus/           # New companion plugin
│       ├── .claude-plugin/
│       │   └── plugin.json     # Registers team commands
│       ├── commands/           # Team-orchestrated commands
│       ├── hooks/
│       │   └── hooks.json      # Claude Code hook definitions
│       ├── scripts/            # Thin shell shims for hooks
│       ├── templates/          # Team composition prompt templates
│       └── config/
│           └── defaults.yaml   # Synthex+ configuration defaults
```

**Acceptance Criteria:**
- Synthex+ is registered in `marketplace.json` as an independent plugin with its own version
- Synthex and Synthex+ can be installed simultaneously without conflict
- Synthex+ `plugin.json` lists all team commands
- Hook definitions live in `hooks/hooks.json` with shell shims in `scripts/`
- No modifications to the original Synthex plugin are required

**FR-SP2: Agent Reuse Strategy**

Synthex+ reuses Synthex's agent expertise rather than duplicating agent definitions. This is the critical architectural decision.

**Rationale:** Agent definitions describe expertise, output format, and behavioral rules -- these do not change based on whether the agent runs as a subagent or a teammate. What changes is the orchestration pattern (how agents are composed and coordinated), not the agent identity. Duplicating agents would create a maintenance burden and drift risk.

**How it works -- read-on-spawn:**
- Teammate spawn prompts reference Synthex agent definition files by path (`plugins/synthex/agents/{agent-name}.md`)
- When a teammate is spawned, its first action is to read the referenced agent definition file and adopt that identity (expertise, output format, behavioral rules)
- Team-specific behavioral overlay (e.g., "use the mailbox to communicate with other teammates", "report status via the shared task list") is provided separately in the spawn prompt, layered on top of the agent identity
- This keeps agent identity in a single source of truth (the Synthex agent files) while allowing templates to define team-specific coordination behaviors
- Once spawned, teammates can also invoke full Synthex agent definitions as subagents within their own independent sessions (e.g., a Tech Lead teammate can invoke Security Reviewer as a subagent)

See `ADR-plus-001-read-on-spawn.md` for full rationale on this decision.

**Acceptance Criteria:**
- No agent `.md` files exist in `plugins/synthex-plus/agents/` -- all agent expertise comes from Synthex
- Spawn prompts reference Synthex agent definition files by path (`plugins/synthex/agents/{agent-name}.md`)
- Templates include team-specific behavioral overlay separate from agent identity
- No cross-plugin path traversal is required at the plugin-loading level -- agent reuse works through file reads at spawn time
- Agent behavioral rules (output format, severity framework, verdict rules) remain consistent whether invoked as subagent or teammate, because both derive from the same source file

**FR-SP3: Plugin Manifest**

```json
{
  "name": "synthex-plus",
  "version": "0.1.0",
  "description": "Teams-optimized orchestration for Synthex — sustained multi-agent collaboration via Claude Code Agent Teams.",
  "author": { "name": "Bluminal Labs" },
  "keywords": ["agents", "teams", "orchestration", "collaboration", "parallel"],
  "hooks": "./hooks/hooks.json",
  "commands": [...]
}
```

**Note:** The current `plugin.json` schema does not support `requires` or `templates` fields. Dependency checking (verifying Synthex is installed) is handled at runtime by the `team-init` command. Template files are internal resources consumed by commands and do not need manifest registration. Marketplace schema extensions (`requires`, `templates`) are tracked as a future enhancement.

**Acceptance Criteria:**
- `plugin.json` conforms to the current Claude Code plugin schema
- `hooks` field references `./hooks/hooks.json`
- All commands are registered in the manifest
- Dependency on Synthex is verified at runtime by `team-init`, not via manifest

---

### 3.2 Team Composition Templates

Templates define reusable team structures for common workflows. Each template specifies which roles to include, their responsibilities within the team, how they communicate, and what quality gates apply.

Templates are **prompt templates** -- structured natural language documents that commands read via file access and inject into the team creation prompt. They are not machine-parsed manifests; they are reference documents that inform how the command composes its team creation instructions.

**FR-TC1: Template Structure**

Each template defines:
- **Team name and purpose** -- what this team formation is optimized for
- **Roles** -- which Synthex agents fill each role, and their team-specific responsibilities
- **Agent references** -- the Synthex agent definition file path each role reads on spawn (e.g., `plugins/synthex/agents/tech-lead.md`)
- **Team-specific behavioral overlay** -- per-role coordination behaviors: mailbox usage, task list conventions, communication patterns, reporting expectations
- **Communication patterns** -- who messages whom, when, and about what
- **Task decomposition guidance** -- how to break the work into shared task list items
- **Quality gates** -- which hooks apply and their configuration
- **When to use / when NOT to use** -- guidance on choosing this template vs. standard Synthex

**How templates are consumed:** Commands read the template file, extract the relevant sections, and compose a team creation prompt from: template content + task-specific context (e.g., the implementation plan, the diff to review). For each teammate role, the spawn prompt instructs the teammate to read the referenced Synthex agent file as its first action (adopting that identity), then applies the team-specific behavioral overlay from the template on top.

**Acceptance Criteria:**
- Each template is a self-contained markdown file in `plugins/synthex-plus/templates/`
- Templates include explicit "when to use" and "when NOT to use" guidance
- Templates reference Synthex agent definition files by path for each role
- Templates define team-specific behavioral overlay per role (coordination behaviors layered on top of agent identity)
- **Maintenance rule:** Templates reference Synthex agents by file path. If an agent file is renamed or removed, the template reference must be updated. Layer 1 tests validate that referenced agent file paths correspond to existing files in the Synthex plugin.

**FR-TC2: Implementation Team Template**

Purpose: Sustained feature development requiring parallel coding, design coordination, and quality assurance.

**Roles:**
| Role | Agent | Source | Team Responsibility |
|------|-------|--------|-------------------|
| Lead | Tech Lead | `plugins/synthex/agents/tech-lead.md` | Decomposes feature into tasks, assigns to teammates, reviews completed work, resolves conflicts |
| Frontend | Lead Frontend Engineer | `plugins/synthex/agents/lead-frontend-engineer.md` | Implements UI components, coordinates with design system, owns frontend quality |
| Quality | Quality Engineer | `plugins/synthex/agents/quality-engineer.md` | Writes tests in parallel with implementation, monitors coverage, identifies gaps |
| Reviewer | Code Reviewer + Security Reviewer | `plugins/synthex/agents/code-reviewer.md`, `plugins/synthex/agents/security-reviewer.md` | Reviews completed task branches before merge approval |

Templates define the team-specific behavioral overlay for each role (mailbox usage, task list conventions, communication expectations). Agent identity is read from the source files at spawn time.

**Communication patterns:**
- Lead creates initial task decomposition on the shared task list
- Frontend and Quality message the Lead when blocked or when discovering cross-cutting concerns
- Reviewer teammates are notified via `TaskCompleted` hook when implementation tasks finish
- Lead approves final merge after all reviews pass

**When to use:** Multi-component features spanning frontend + backend + tests, estimated at 4+ hours of work.
**When NOT to use:** Single-file changes, pure refactors, documentation-only work.

**Acceptance Criteria:**
- Template specifies minimum 4 roles with clear responsibility boundaries
- Each role includes a Source path to its Synthex agent definition file
- Communication patterns define who initiates messages and expected response actions
- Task decomposition guidance maps to implementation plan milestone/task structure

**FR-TC3: Review Team Template**

Purpose: Deep, multi-perspective review of large or high-risk changesets where reviewers benefit from independent context and inter-reviewer discussion.

**Roles:**
| Role | Agent | Source | Team Responsibility |
|------|-------|--------|-------------------|
| Lead | Command orchestrator (not an agent) | -- | Creates review tasks, consolidates final verdict |
| Craftsmanship | Code Reviewer | `plugins/synthex/agents/code-reviewer.md` | Reviews code quality, conventions, reuse opportunities |
| Security | Security Reviewer | `plugins/synthex/agents/security-reviewer.md` | Reviews security posture, vulnerabilities, secrets |
| Performance | Performance Engineer | `plugins/synthex/agents/performance-engineer.md` | Reviews performance impact (optional, configurable) |
| Design | Design System Agent | `plugins/synthex/agents/design-system-agent.md` | Reviews UI compliance (automatic for frontend changes) |

Templates define the team-specific behavioral overlay for each role. Agent identity is read from the source files at spawn time.

**Communication patterns:**
- Reviewers work independently on their review tasks
- When a reviewer discovers something in another reviewer's domain (e.g., Code Reviewer spots a potential security issue), they message the relevant teammate directly rather than just noting it in their own report
- Lead consolidates after all review tasks complete

**When to use:** Diffs exceeding 500 lines, security-sensitive changes, changes spanning 5+ files, pre-release reviews.
**When NOT to use:** Small diffs under 200 lines, single-concern changes, routine bug fixes.

**Acceptance Criteria:**
- Template supports 2-4 reviewer roles (minimum: craftsmanship + security)
- Each role includes a Source path to its Synthex agent definition file
- Cross-domain discovery pattern is explicitly defined (reviewer-to-reviewer messaging)
- Consolidation rules match Synthex's existing verdict logic (FAIL > WARN > PASS)

**FR-TC4: Planning Team Template**

Purpose: Collaborative implementation planning where architect, designer, and tech lead contribute simultaneously rather than reviewing sequentially.

**Roles:**
| Role | Agent | Source | Team Responsibility |
|------|-------|--------|-------------------|
| Lead | Product Manager | `plugins/synthex/agents/product-manager.md` | Owns the plan, makes final decisions on requirements and scope |
| Architect | Architect | `plugins/synthex/agents/architect.md` | Evaluates technical feasibility, identifies architecture risks, proposes alternatives |
| Designer | Design System Agent | `plugins/synthex/agents/design-system-agent.md` | Assesses design impact, identifies missing UX tasks, validates accessibility coverage |
| Implementer | Tech Lead | `plugins/synthex/agents/tech-lead.md` | Validates task clarity, estimates complexity, identifies dependency errors |

Templates define the team-specific behavioral overlay for each role. Agent identity is read from the source files at spawn time.

**Communication patterns:**
- PM creates initial plan draft as a shared document (task description or referenced file)
- Architect, Designer, and Implementer review concurrently and post findings to the shared task list
- Cross-concern findings are messaged directly between reviewers (e.g., Architect messages Implementer about a sequencing concern)
- PM addresses consolidated feedback and iterates

**When to use:** Large PRDs (10+ requirements), plans spanning multiple phases, projects with significant architectural decisions.
**When NOT to use:** Single-feature plans, plan updates for existing projects, small scope changes.

**Acceptance Criteria:**
- Template maps to the existing `write-implementation-plan` review loop pattern
- Each role includes a Source path to its Synthex agent definition file
- Concurrent review is the default (not sequential)
- PM retains final authority on requirements content (consistent with Synthex's PM agent rules)

---

### 3.3 Team Commands

Commands that create and orchestrate agent teams for specific workflows. These are the Synthex+ equivalents of Synthex's subagent-based commands.

**Important:** All behavioral logic in team commands is prompt-mediated. Commands contain structured natural language instructions that guide team creation and coordination. Acceptance criteria use "instructs the lead to..." language to reflect this. See Section 7 for the full probabilistic execution model.

**FR-CMD1: team-implement**

Purpose: Execute implementation plan tasks using a persistent agent team instead of ephemeral subagent instances. This is the teams-optimized equivalent of Synthex's `next-priority` command.

**Parameters:**

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `implementation_plan_path` | Path to the implementation plan | `docs/plans/main.md` | No |
| `template` | Team composition template to use | `implementation` | No |
| `milestone` | Specific milestone to execute (e.g., "1.2") | Current incomplete milestone | No |
| `config_path` | Path to synthex-plus config | `.synthex-plus/config.yaml` | No |

**Workflow:**
1. Load configuration and read the implementation plan
2. Identify the target milestone and its tasks
3. Run pre-flight checks (see Section 3.11)
4. Create an agent team using the specified template (see Section 3.10)
5. Instruct the Team Lead to map implementation plan tasks to shared task list items, preserving dependencies
6. Team Lead assigns and coordinates work across teammates
7. Quality gates fire via hooks as tasks finish (see Section 3.4)
8. On milestone completion, lead consolidates results and updates the plan
9. Run cleanup (see Section 3.11)

**Scope guidance:** A single `team-implement` invocation should target one milestone. Milestones with more than 15 tasks should be split into sub-milestones before team creation. This keeps the team's context manageable and provides natural checkpoints.

**Key difference from `next-priority`:** Instead of spawning independent Tech Lead subagents per task (each with no awareness of the others), `team-implement` creates a persistent team where agents can communicate, share context about cross-cutting concerns, and coordinate on integration points.

**Acceptance Criteria:**
- Command instructs the lead to map implementation plan tasks to shared task list items with dependency chains
- Team persists for the duration of the milestone (not per-task)
- Hooks trigger quality gate reviews on task completion
- Only the lead writes to the implementation plan (see Section 3.5, FR-TL2)
- Plan is updated with completion status, decisions, and learnings after milestone completes
- Pre-flight and cleanup lifecycle steps execute (see Section 3.11)

**FR-CMD2: team-review**

Purpose: Multi-perspective code review using a persistent team where reviewers can discuss findings with each other. This is the teams-optimized equivalent of Synthex's `review-code` command.

**Parameters:**

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `target` | File paths, directory, or git diff range | staged changes | No |
| `template` | Team composition template | `review` | No |
| `config_path` | Path to synthex-plus config | `.synthex-plus/config.yaml` | No |

**Workflow:**
1. Load configuration and determine review scope
2. Run pre-flight checks (see Section 3.11)
3. Create a review team using the specified template (see Section 3.10)
4. Instruct the lead to create review tasks on the shared task list (one per reviewer role)
5. Reviewers execute independently and post findings
6. Cross-domain findings trigger direct reviewer-to-reviewer messages
7. After all reviews complete, lead consolidates into unified report
8. If FAIL verdict, enter fix-and-re-review loop (team persists between cycles)
9. Run cleanup (see Section 3.11)

**Key difference from `review-code`:** In standard Synthex, reviewers are isolated subagents that cannot communicate. If the Code Reviewer spots a potential security issue, it notes it in its own report but cannot alert the Security Reviewer. In `team-review`, reviewers can message each other directly, leading to more thorough cross-domain analysis.

**Acceptance Criteria:**
- Command instructs reviewers to execute concurrently via shared task list
- Cross-domain messaging pattern is instructed (reviewer-to-reviewer)
- Consolidated report matches Synthex's `review-code` output format
- Re-review cycles reuse the existing team (no context loss between cycles)
- Pre-flight and cleanup lifecycle steps execute (see Section 3.11)

**FR-CMD3: team-plan**

Purpose: Collaborative implementation planning where reviewers contribute concurrently and discuss across domains. This is the teams-optimized equivalent of Synthex's `write-implementation-plan` command.

**Parameters:**

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `requirements_path` | Path to the PRD | `docs/reqs/main.md` | No |
| `plan_path` | Output path for the plan | `docs/plans/main.md` | No |
| `template` | Team composition template | `planning` | No |
| `config_path` | Path to synthex-plus config | `.synthex-plus/config.yaml` | No |

**Workflow:**
1. Load configuration and read the PRD
2. PM conducts user interview (same as standard `write-implementation-plan`)
3. PM drafts initial plan
4. Run pre-flight checks (see Section 3.11)
5. Create a planning team using the specified template (see Section 3.10)
6. Instruct reviewers to review concurrently; architect, designer, and tech lead post findings to the shared task list
7. Reviewers discuss cross-cutting findings via direct messaging
8. PM addresses consolidated feedback and iterates
9. Compactness pass and final plan output
10. Run cleanup (see Section 3.11)

**Key difference from `write-implementation-plan`:** In standard Synthex, the review loop spawns fresh subagents each cycle, losing all context. In `team-plan`, reviewers persist across cycles, maintaining awareness of what they flagged previously and what the PM changed. This produces higher-quality review feedback in later cycles because reviewers have full context of the plan's evolution.

**Acceptance Criteria:**
- PM retains final authority on plan content (consistent with Synthex convention)
- Command instructs reviewers to persist across review cycles (no fresh subagent spawning per cycle)
- Output format matches the standard implementation plan template
- Compactness pass is applied before final output
- Pre-flight and cleanup lifecycle steps execute (see Section 3.11)

---

### 3.4 Quality Gate Hooks

Hooks define automated quality gates that fire at specific points in the team lifecycle. They leverage Claude Code's hook system, which requires shell commands configured in a `hooks.json` file.

**Targeted exception to the no-runtime-code constraint:** Claude Code hooks are shell commands, not markdown. Synthex+ uses thin shell shims in `scripts/` that serve as hook entry points. These scripts are minimal (under 20 lines each) and communicate via exit codes: exit 0 = pass, exit 2 = block and send feedback to the agent. The behavioral logic remains in the command prompts; the shell scripts only provide the hook trigger mechanism.

**FR-HK1: Hook File Structure**

```
plugins/synthex-plus/
├── hooks/
│   └── hooks.json              # Claude Code hook configuration
└── scripts/
    ├── task-completed-gate.sh  # Thin shim for task completion events
    └── teammate-idle-gate.sh   # Thin shim for idle teammate events
```

**hooks.json example:**
```json
{
  "hooks": [
    {
      "event": "TaskCompleted",
      "command": "./scripts/task-completed-gate.sh",
      "description": "Review gate: triggers quality review on completed tasks"
    },
    {
      "event": "TeammateIdle",
      "command": "./scripts/teammate-idle-gate.sh",
      "description": "Work assignment: assigns pending tasks to idle teammates"
    }
  ]
}
```

**Acceptance Criteria:**
- Hook definitions live in `hooks/hooks.json` conforming to Claude Code's hook schema
- Shell scripts in `scripts/` are thin shims (under 20 lines each)
- Scripts communicate via exit codes (0 = pass, 2 = block with feedback)
- Hook behavioral logic is documented in companion markdown files for maintainability

**FR-HK2: TaskCompleted -- Review Gate**

Fires when an implementation task is marked complete on the shared task list. Triggers a review of the completed work before it can be considered done.

**Behavior:**
1. Detect the type of work completed (code change, documentation, test suite, etc.)
2. Route to the appropriate reviewer(s):
   - Code changes: Code Reviewer + Security Reviewer (as subagents within the reviewer teammate's session)
   - Frontend changes: additionally include Design System Agent
   - Infrastructure changes: additionally include Terraform Plan Reviewer
3. If review verdict is FAIL: reopen the task with review findings attached, notify the implementing teammate via mailbox
4. If review verdict is PASS or WARN: mark the quality gate as passed, notify the team lead

**Configuration:**

```yaml
hooks:
  task_completed:
    review_gate:
      enabled: true
      reviewers:
        code: [code-reviewer, security-reviewer]
        frontend: [code-reviewer, security-reviewer, design-system-agent]
        infrastructure: [code-reviewer, terraform-plan-reviewer]
      auto_reopen_on_fail: true
```

**Acceptance Criteria:**
- Hook fires automatically when any task transitions to `completed` status
- Work type detection determines which reviewers are invoked
- FAIL verdict reopens the task with findings and notifies the implementer
- Hook is configurable (can disable, change reviewers, adjust behavior)

**FR-HK3: TeammateIdle -- Work Assignment**

Fires when a teammate has no active tasks. Used to proactively assign available work.

**Behavior:**
1. Check the shared task list for pending tasks that match the idle teammate's role
2. If matching tasks exist and dependencies are satisfied, assign the highest-priority one
3. If no matching tasks exist, check if cross-functional help is needed (e.g., an idle frontend engineer could assist with component tests)
4. If truly no work remains, notify the team lead that the teammate is available for dismissal

**Acceptance Criteria:**
- Idle detection triggers within one cycle of a teammate becoming idle
- Task assignment respects dependency chains (never assign a blocked task)
- Cross-functional assistance is suggested, not forced

---

### 3.5 Shared Task List Integration

The shared task list is the primary coordination mechanism in agent teams. Synthex+ defines how implementation plan tasks map to shared task list items.

**FR-TL1: Plan-to-Task Mapping**

When a team command creates tasks from an implementation plan:
- Each implementation plan task becomes a shared task list item
- Task dependencies in the plan map to `blockedBy` relationships in the shared task list
- Task descriptions include: the plan task text, acceptance criteria, relevant context links (specs, design docs)
- Complexity grades (S/M/L) from the plan are preserved as task metadata
- Task descriptions include context budget guidance: "Keep tool invocations focused. Summarize findings rather than dumping raw output."

**Acceptance Criteria:**
- Command instructs the lead to represent dependency chains accurately (task with "Depends on: Task 3" has `blockedBy: [task-3-id]`)
- No circular dependencies are created
- Task descriptions are self-contained enough for a teammate with independent context to execute

**FR-TL2: Progress Synchronization**

Task completions on the shared task list are synchronized back to the implementation plan. **Only the lead writes to the implementation plan** to prevent concurrent write conflicts.

- When a shared task is marked `completed`, the lead updates the corresponding plan task as done
- Completion notes from teammates are relayed to the lead via the shared task list
- New tasks discovered during execution are added to both the shared list and the plan by the lead
- The lead consolidates at designated sync points (after phase/milestone completion), not in real-time

**Acceptance Criteria:**
- Only the lead teammate writes to the implementation plan file
- Other teammates report status via the shared task list, not by editing files directly
- Implementation plan reflects shared task list state after each milestone
- Discovered work is captured in both systems by the lead

**FR-TL3: Task Context Enrichment**

Since teammates have independent context windows (unlike subagents that share the parent's context), task descriptions must be enriched with context that would otherwise be available from the parent:

- Project conventions (reference to CLAUDE.md, key patterns)
- Relevant specification links (design system spec, architecture docs)
- Inter-task context (what other tasks are being worked on concurrently, integration points)
- Acceptance criteria (from the implementation plan)

**Acceptance Criteria:**
- Task descriptions include or reference all context needed for independent execution
- Context is concise (links and summaries, not full document contents)
- Inter-task integration points are explicitly called out

---

### 3.6 Configuration Framework

**FR-CF1: Configuration File**

Synthex+ uses its own configuration directory, `.synthex-plus/`, separate from Synthex's `.synthex/`. This separation exists because: (1) the two plugins version independently and may have different config schemas, (2) it avoids namespace collisions in a shared config file, and (3) it allows installing/uninstalling Synthex+ without touching Synthex configuration.

```yaml
# .synthex-plus/config.yaml

# Team creation defaults
teams:
  default_implementation_template: implementation
  default_review_template: review
  default_planning_template: planning

# Hook configuration
hooks:
  task_completed:
    review_gate:
      enabled: true
      auto_reopen_on_fail: true
      reviewers:
        code: [code-reviewer, security-reviewer]
        frontend: [code-reviewer, security-reviewer, design-system-agent]
        infrastructure: [code-reviewer, terraform-plan-reviewer]
  teammate_idle:
    work_assignment:
      enabled: true
      allow_cross_functional: false

# Cost estimation constants
cost_guidance:
  # Approximate tokens per teammate for spawn + context + CLAUDE.md loading
  base_tokens_per_teammate: 50000
  # Approximate tokens per task per teammate for execution + tool use
  tokens_per_task_per_teammate: 20000
  # Show cost comparison before creating a team
  show_cost_comparison: true

# Review loops (teams-specific — persistent teammates, not fresh subagents)
review_loops:
  max_cycles: 3
  min_severity_to_address: high

# Shared task list settings
task_list:
  context_mode: references  # "full" or "references"
  max_concurrent_tasks: 5

# Team lifecycle settings
lifecycle:
  # Timeout (minutes) for tasks showing no progress before lead intervenes
  stuck_task_timeout_minutes: 30
  # Maximum tasks per team invocation (soft limit, documented in guidance)
  max_tasks_per_invocation: 15

# Document paths (defaults match Synthex for interop)
documents:
  requirements: docs/reqs/main.md
  implementation_plan: docs/plans/main.md
  specs: docs/specs
```

**Acceptance Criteria:**
- Configuration file lives at `.synthex-plus/config.yaml`
- Default values are defined in `plugins/synthex-plus/config/defaults.yaml`
- Configuration follows the same override pattern as Synthex (project overrides > plugin defaults > hardcoded fallback)
- Document paths default to the same values as Synthex for interoperability

**FR-CF2: Init Command**

A `team-init` command initializes Synthex+ configuration for a project.

**Behavior:**
1. Check that Synthex is already initialized (`.synthex/config.yaml` exists or can be detected)
2. Verify the Synthex plugin is installed (check that Synthex agents are available)
3. Check for leftover team resources from previous sessions (orphan detection -- see Section 3.11)
4. Create `.synthex-plus/config.yaml` from defaults
5. Add `.synthex-plus/` to `.gitignore` if not already present
6. Verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set (warn if not)
7. Print summary of available team commands and templates

**Acceptance Criteria:**
- Warns (does not fail) if Synthex is not initialized
- Verifies Synthex plugin dependency at runtime (since `plugin.json` cannot declare it)
- Warns (does not fail) if the experimental flag is not set
- Checks for and reports orphaned team resources
- Created config file includes comments explaining each setting

---

### 3.7 Cost Guidance & Decision Framework

The ~7x token cost of teams vs. subagents is significant. Synthex+ must help users make informed decisions about when to use teams.

**FR-CG1: Teams vs. Subagents Decision Guide**

Provide clear guidance embedded in command help text and documentation:

| Factor | Use Synthex (Subagents) | Use Synthex+ (Teams) |
|--------|------------------------|---------------------|
| Task duration | Single focused task, < 30 min | Multi-step work, > 1 hour |
| Agent communication | One-way (report to caller) sufficient | Cross-agent discussion needed |
| Context continuity | Fresh context per invocation is fine | Maintaining context across iterations is valuable |
| Parallelism | Independent tasks, no coordination | Parallel tasks with integration points |
| Review depth | Standard review (< 500 LOC) | Deep review (500+ LOC, security-critical) |
| Cost sensitivity | Budget-constrained | Quality over cost for critical work |

**Acceptance Criteria:**
- Decision guide is included in the plugin README and in command help text
- Guide provides concrete thresholds (LOC, estimated time, file count) not just vague guidance

**FR-CG2: Pre-Creation Cost Estimate**

Before creating a team, commands display an estimated cost comparison using a static heuristic formula embedded in the command prompt:

**Formula:**
```
subagent_estimate = num_tasks * tokens_per_task_per_teammate
team_estimate = (num_teammates * base_tokens_per_teammate) + (num_tasks * num_teammates * tokens_per_task_per_teammate)
```

Where:
- `base_tokens_per_teammate`: ~50,000 tokens (configurable in `cost_guidance.base_tokens_per_teammate`)
- `tokens_per_task_per_teammate`: ~20,000 tokens (configurable in `cost_guidance.tokens_per_task_per_teammate`)

**Display:**
```
Team cost estimate (approximate):
  Subagent approach (next-priority): ~X tokens
  Team approach (team-implement):    ~Y tokens (~Nx multiplier)

  Note: This is a prompt-based approximation. Actual usage varies
  based on task complexity, tool invocations, and review cycles.

  Proceed with team creation? [Y/n]
```

The estimate is a prompt-based approximation -- the command calculates it using the formula above with the configured constants. It is not precise; its purpose is to prevent surprise costs.

**Acceptance Criteria:**
- Cost estimate is displayed before team creation (configurable, on by default)
- Estimate uses the defined formula with configurable constants
- User can skip the estimate via config (`cost_guidance.show_cost_comparison: false`)
- Estimate clearly states it is approximate

---

### 3.8 Graceful Degradation

**FR-GD1: Experimental Feature Detection**

If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is not set, Synthex+ commands must:
1. Detect the missing flag
2. Explain what is needed
3. Offer to fall back to the standard Synthex equivalent command (e.g., `team-review` falls back to `review-code`)

**Acceptance Criteria:**
- Commands do not crash when the experimental flag is missing
- Fallback to Synthex equivalent is offered, not forced
- Error message includes the exact flag and how to set it

**FR-GD2: Partial Team Formation**

If a team cannot be fully formed (e.g., a requested agent role is unavailable), the team command must:
1. Note the missing role
2. Proceed with available roles if the missing role is optional
3. Fail with a clear error if the missing role is required (e.g., no Tech Lead for `team-implement`)

**Acceptance Criteria:**
- Optional vs. required roles are defined per template
- Missing optional roles are noted in the team creation summary
- Missing required roles produce a clear, actionable error

---

### 3.9 Coexistence with Synthex

**FR-CX1: No Synthex Modifications**

Synthex+ must not require any changes to the original Synthex plugin. It is a pure addition.

**Acceptance Criteria:**
- All Synthex files remain unmodified after installing Synthex+
- Synthex commands continue to work identically with or without Synthex+

**FR-CX2: Shared Document Paths**

Both plugins use the same default document paths (`docs/reqs/main.md`, `docs/plans/main.md`, etc.) so that users can switch between subagent and team workflows on the same project without reconfiguring paths.

**Acceptance Criteria:**
- Default document paths in `synthex-plus/config/defaults.yaml` match those in `synthex/config/defaults.yaml`
- Both plugins can read from and write to the same implementation plan

**FR-CX3: Marketplace Registration**

Synthex+ is registered as a separate plugin in `marketplace.json`:

```json
{
  "plugins": [
    {
      "name": "synthex",
      "source": "./plugins/synthex",
      "version": "0.1.0",
      "category": "productivity",
      "keywords": ["agents", "organization", "orchestration", "delivery"],
      "description": "AI agents modeled after a software startup org chart..."
    },
    {
      "name": "synthex-plus",
      "source": "./plugins/synthex-plus",
      "version": "0.1.0",
      "category": "productivity",
      "keywords": ["agents", "teams", "orchestration", "collaboration", "parallel"],
      "description": "Teams-optimized orchestration for Synthex — sustained multi-agent collaboration via Claude Code Agent Teams."
    }
  ]
}
```

**Note:** The `requires` field is not part of the current marketplace schema. Synthex dependency is enforced at runtime by `team-init`. Adding `requires` to the marketplace schema is a future enhancement.

**Acceptance Criteria:**
- Synthex+ is listed as a separate plugin
- Keywords differentiate the two plugins (Synthex: "delivery"; Synthex+: "collaboration", "teams")
- No unsupported schema fields are used in `marketplace.json`

---

### 3.10 Team Creation Mechanism

Teams are created via natural language instructions within commands, not via static configuration. This section defines how commands translate templates into team creation prompts.

**FR-TCM1: Prompt-Based Team Creation**

Templates are **prompt templates** -- structured natural language that commands read and inject into a team creation prompt. The team creation prompt is composed from:

1. **Template content** -- role definitions, communication patterns, quality gates
2. **Agent file references** -- Synthex agent definition file paths that each teammate reads on spawn to adopt its identity
3. **Team-specific behavioral overlay** -- per-role coordination behaviors from the template (mailbox usage, task list conventions, reporting patterns)
4. **Task context** -- the specific work to be done (implementation plan, diff, PRD)
5. **Project context** -- references to CLAUDE.md, specs, conventions

**How read-on-spawn works in the creation prompt:** For each teammate role, the template provides: (1) the role name, (2) the Synthex agent file path, and (3) the team-specific behavioral overlay. The command composes a spawn prompt that says: "Read your agent definition at [path] and adopt it as your identity. Additionally: [team overlay from template]."

**Example team creation prompt (illustrative, for `team-implement`):**

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
```

**FR-TCM2: Post-Creation Verification**

After team creation, the command inspects `~/.claude/teams/{team-name}/config.json` (or equivalent team metadata) to verify:
- Expected number of teammates were created
- Required roles are present (per template definition)
- Team name matches the expected pattern

If verification fails, the command reports which roles are missing and either proceeds (if missing roles are optional) or aborts with cleanup (if missing roles are required).

**Acceptance Criteria:**
- Commands compose team creation prompts from: template + agent file references + team-specific overlay + task context
- Teammate spawn prompts instruct each teammate to read the Synthex agent definition file at the specified path and adopt it as their identity
- Team-specific behavioral overlay is provided separately from agent identity in each spawn prompt
- Post-creation verification inspects team metadata to confirm expected roles
- Missing required roles cause abort with cleanup; missing optional roles produce a warning
- Acceptance criteria throughout the PRD use "instructs the lead to..." language reflecting the prompt-mediated nature of team creation

---

### 3.11 Team Lifecycle Management

Teams require explicit lifecycle management to prevent resource leaks, handle failures, and maintain session hygiene.

**FR-LM1: Pre-Flight Checks**

Before creating a team, the command performs:
1. **One-team-per-session check:** Verify no existing team is active in the current session. If a team exists, abort with a message to complete or clean up the existing team first.
2. **Dependency check:** Verify Synthex plugin is installed and agents are accessible.
3. **Orphan check:** Look for leftover team resources from previous sessions (e.g., stale entries in `~/.claude/teams/`). Report findings and offer cleanup.

**Acceptance Criteria:**
- Commands refuse to create a second team in the same session
- Orphaned team resources are detected and reported
- Pre-flight failures produce clear, actionable error messages

**FR-LM2: Graceful Shutdown**

When a team's work completes (all tasks done, or command finishes):
1. Lead summarizes completed work and outstanding items
2. Command instructs all teammates to shut down in order: non-lead teammates first, then the lead
3. Command verifies team resources are cleaned up

**Acceptance Criteria:**
- Shutdown sequence is ordered (non-lead first, then lead)
- Lead produces a completion summary before shutting down
- Team resources are cleaned up after shutdown

**FR-LM3: Failure Recovery**

When errors occur during team execution:
1. **Teammate failure:** If a teammate stops unexpectedly, the lead detects the stopped teammate (via lack of task progress or explicit error), reassigns their pending tasks to other teammates or takes them on directly, and reports the failure.
2. **Lead failure:** If the lead stops, the command attempts to shut down remaining teammates and reports the team name for manual cleanup.
3. **Cleanup failure:** If cleanup itself fails, the command reports the team name and location of team resources so the user can clean up manually.
4. **Stuck task detection:** If a task shows no progress for longer than `lifecycle.stuck_task_timeout_minutes` (default: 30), the lead intervenes -- checking on the assigned teammate and reassigning if necessary.

**Acceptance Criteria:**
- Command instructs the lead to detect and handle teammate failures
- Lead failure triggers best-effort cleanup of remaining teammates
- Failed cleanup reports enough information for manual intervention
- Stuck task timeout is configurable

**FR-LM4: Orphan Prevention**

The `team-init` command checks for orphaned team resources. Additionally:
- Each team command records its team name at creation and removes it at cleanup
- If a command crashes without cleanup, the next `team-init` or team command detects the orphan

**Acceptance Criteria:**
- Team names are recorded at creation and removed at cleanup
- Orphan detection is available via `team-init` and as a pre-flight check in all team commands

---

### 3.12 Context Window Management

Long-running teams consume significant context. These requirements ensure teams remain effective as work progresses.

**FR-CW1: Milestone Scope Limits**

Team invocations should target a single milestone with a soft limit of 15 tasks (configurable via `lifecycle.max_tasks_per_invocation`). Commands warn when the target milestone exceeds this limit and suggest splitting into sub-milestones.

**FR-CW2: Progressive Summarization**

The lead should periodically summarize completed work to free context capacity:
- After each batch of 3-5 completed tasks, the lead summarizes what was done and drops detailed task output
- Summary includes: what changed, key decisions made, files modified, remaining work
- This mirrors the existing Synthex convention of summarizing when plans exceed 1500 lines

**FR-CW3: Auto-Compaction Behavior**

When Claude Code triggers automatic context compaction on a teammate:
- The teammate may lose detailed memory of earlier work
- Task descriptions on the shared list serve as the durable record
- The lead's summaries serve as the authoritative history
- Commands should document this behavior in the team creation prompt so teammates understand they may experience compaction

**Acceptance Criteria:**
- Commands warn when milestone task count exceeds the configured soft limit
- Lead is instructed to summarize completed work periodically
- Team creation prompt includes guidance about auto-compaction behavior

---

### 3.13 Testing Strategy

**FR-TS1: Schema Validation (Layer 1)**

Following the Synthex testing pyramid, Synthex+ needs schema validators for:
- Team composition templates (validate structure, required sections, role definitions, agent file references)
- Hook configuration (validate `hooks.json` structure and script references)
- Command output (validate team creation summaries, progress reports, completion reports)

**FR-TS2: Behavioral Assertions (Layer 2)**

Cached LLM output tests for:
- Team creation prompts contain expected agent file references and communication patterns
- Cost estimates use the defined formula with correct constants
- Pre-flight checks detect orphaned teams and missing dependencies
- Lifecycle management instructions are present in command prompts

**FR-TS3: Integration Scenarios (Layer 3)**

End-to-end scenarios (LLM-as-judge) for:
- `team-implement` executes a small milestone with correct task coordination
- `team-review` produces cross-domain findings via reviewer-to-reviewer messaging
- `team-plan` maintains reviewer context across multiple review cycles

**Acceptance Criteria:**
- Layer 1 tests run on every PR with zero LLM cost
- Layer 2 and 3 tests follow the existing caching strategy
- Test fixtures exist in `tests/fixtures/synthex-plus/`

---

## 4. Non-Functional Requirements

**NFR-1: Token Efficiency**
- Team commands must minimize unnecessary token usage despite the inherent cost of teams
- Task descriptions should use reference links to shared documents rather than inlining full content (configurable via `task_list.context_mode`)
- Hook scripts should be minimal -- hooks fire frequently and bloated hook interactions multiply cost
- Cost guidance must be transparent and use the defined estimation formula

**NFR-2: Context Window Management**
- Teammates operate with independent context windows -- task descriptions must be self-contained
- Long-running teams must manage context decay: lead summarizes completed work periodically, task descriptions serve as durable records
- Hook executions should not consume excessive teammate context -- keep hook interactions brief and focused
- Commands document auto-compaction behavior in team creation prompts

**NFR-3: Graceful Degradation**
- Every Synthex+ command has a clear fallback to a standard Synthex command
- Missing experimental flag produces a helpful error, not a crash
- Partial team formation (missing optional roles) degrades gracefully
- Teammate failures are detected by the lead with work reassignment
- Failed cleanup reports enough information for manual intervention

**NFR-4: Consistency with Synthex**
- Output formats match Synthex conventions (same verdict format, same severity framework, same structured markdown)
- Configuration follows the same override pattern (project config > plugin defaults > hardcoded fallback)
- Document paths, agent names, and terminology are consistent between plugins
- A user familiar with Synthex should immediately understand Synthex+ commands

**NFR-5: No Runtime Code (with Targeted Exception)**
- All team commands, templates, and configuration are markdown and YAML files
- **Targeted exception:** Hook integration requires thin shell shims (`scripts/`) because Claude Code's hook system executes shell commands. These scripts are minimal (under 20 lines each), communicate via exit codes, and contain no business logic -- they are the thinnest possible bridge between Claude Code's hook system and the prompt-based behavioral definitions.
- Team creation, task management, and agent coordination rely on Claude Code's built-in team primitives invoked via prompt instructions

**NFR-6: Observability**
- Team commands should report: team creation time, number of tasks created, task completion progress, hook invocations, final cost estimate
- Progress reporting enables the user to understand what the team is doing and intervene if needed
- Lead produces periodic summaries that serve as both context management and observability

---

## 5. Out of Scope

**Explicitly NOT included in Synthex+ v0.1:**

- **Custom team templates** -- Users cannot author their own templates in v0.1; they use the three provided templates (implementation, review, planning). Custom templates are a future enhancement.
- **Persistent teams across sessions** -- Teams are created per-command-invocation and dismissed when the work completes. Long-lived teams that span multiple sessions are not supported.
- **Dynamic team scaling** -- Adding or removing teammates mid-execution is not supported. Team composition is fixed at creation time.
- **Team-to-team coordination** -- Multiple concurrent teams cannot communicate with each other. Each team is independent.
- **Cost tracking and budgets** -- While cost estimates are shown pre-creation, Synthex+ does not enforce token budgets or track actual spend. This requires Claude Code API integration that does not exist.
- **Visual team dashboard** -- No UI for monitoring team activity. Observation is via terminal output (in-process or tmux panes).
- **Agent memory across teams** -- Learnings from one team invocation do not carry forward to the next. Each team starts fresh (consistent with Synthex's stateless model).
- **Non-Synthex agent support** -- Synthex+ teams can only compose agents defined in the Synthex plugin. Third-party or user-defined agents are not supported in v0.1.
- **Automated Synthex-to-Synthex+ migration** -- No tool to automatically convert existing Synthex command invocations to team equivalents.
- **Marketplace `requires` field** -- Declaring plugin dependencies in `marketplace.json` or `plugin.json` requires a schema extension. Tracked as a future marketplace enhancement; dependency checking is handled at runtime for v0.1.

---

## 6. Success Metrics

### 6.1 Foundation Metrics (v0.1)

| Metric | Target |
|--------|--------|
| All 3 team templates (implementation, review, planning) have complete definitions | 100% |
| All 3 team commands (team-implement, team-review, team-plan) are functional | 100% |
| Hook configuration (`hooks.json` + shell shims) is complete and functional | 100% |
| Synthex+ installs without modifying any Synthex files | Verified |
| Graceful degradation when experimental flag is missing | Verified: fallback offered |
| Cost estimate displayed before team creation using defined formula | Verified: estimate shown, user prompted |
| Output formats match Synthex conventions | Verified: same verdict/severity/structure |
| Agent reuse: zero agent definitions duplicated from Synthex | 0 duplicated files |
| Team lifecycle: pre-flight, shutdown, and cleanup steps execute | Verified |
| Post-creation verification confirms expected teammate roles | Verified |

### 6.2 Quality Metrics

| Metric | Target |
|--------|--------|
| `team-review` cross-domain findings: reviewers discover and communicate issues in each other's domains | Demonstrated in at least one test scenario |
| `team-implement` task completion: team completes a multi-task milestone with correct dependency ordering | Demonstrated |
| `team-plan` review persistence: reviewers reference prior-cycle findings in subsequent cycles | Demonstrated |
| Hook invocation: `TaskCompleted` review gate fires and reopens task on FAIL verdict | Demonstrated |
| Plan-to-task mapping: implementation plan tasks correctly translate to shared task list with dependencies | Verified |
| Orphan detection: `team-init` detects and reports leftover team resources | Verified |
| Stuck task detection: lead intervenes on tasks exceeding timeout | Demonstrated |

---

## 7. Assumptions & Constraints

**Assumptions:**
- Claude Code's Agent Teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) provides stable-enough primitives for: team creation via natural language, shared task list with states and dependencies, inter-agent mailbox messaging, `TeammateIdle` and `TaskCompleted` hooks, and plan approval for teammates. **Hook event names and team metadata paths are assumed based on current documentation and must be validated during implementation against the actual API.** If hook event names differ, `hooks.json` will be adjusted accordingly. If team metadata is not inspectable programmatically, post-creation verification will fall back to prompt-based confirmation (asking the lead to report its team roster).
- Teammates automatically load the project's CLAUDE.md, MCP servers, and installed plugins (including Synthex's agents directory)
- Teammates can read files from the Synthex plugin directory (`plugins/synthex/agents/`) at runtime -- this is required for the read-on-spawn pattern where each teammate reads its agent definition file as its first action
- Reading ~200 lines of agent definition per teammate is an acceptable context cost relative to total team context cost (~50,000+ tokens per teammate); the ~200 lines represent less than 2% of a teammate's context budget
- The ~7x token cost ratio is approximately correct and stable enough for cost estimation
- Teams are created via natural language instructions within commands, not via static configuration files -- this means team composition templates are reference documents that inform the creation prompt, not machine-parsed manifests
- The experimental Teams API will not undergo breaking changes that invalidate Synthex+ commands before v0.1 ships (acknowledged risk)

**Constraints:**
- **Experimental API dependency** -- Agent Teams is experimental. Breaking changes to the Teams API may require updates to Synthex+ commands. This risk is accepted because the value of early adoption outweighs the maintenance cost.
- **Prompt-mediated execution model** -- All behavioral logic (team creation, task assignment, communication patterns, quality gates, lifecycle management) is prompt-mediated and therefore probabilistic. Commands contain structured natural language instructions that guide agent behavior, but agents may interpret or execute those instructions imperfectly. Acceptance criteria throughout this PRD use "instructs the lead to..." language to reflect this. Testing validates that the right instructions are present and that outcomes are achieved in test scenarios, not that behavior is deterministic.
- **No runtime code (with targeted exception)** -- Consistent with Synthex, all definitions are markdown/YAML, with the targeted exception of hook integration scripts which are thin shell shims required by Claude Code's hook system. These scripts contain no business logic.
- **Agent Teams required** -- Synthex+ commands cannot function without Agent Teams enabled. Fallback is to the standard Synthex equivalent, not to a degraded Synthex+ mode.
- **Cost** -- Teams are ~7x more expensive than subagents. Synthex+ commands must justify their cost through demonstrably better outcomes (cross-domain communication, context persistence, parallel-with-coordination).
- **Plugin dependency** -- Synthex+ requires Synthex to be installed. It cannot function standalone because it reuses Synthex's agent definitions. This dependency is enforced at runtime by `team-init` and pre-flight checks.
- **Plugin structure** -- Must follow the `.claude-plugin/` convention established by the marketplace architecture.
- **One team per session** -- Only one team can be active in a session at a time. This simplifies lifecycle management and prevents resource conflicts.

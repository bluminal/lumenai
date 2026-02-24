# Write Implementation Plan

Transform a Product Requirements Document (PRD) into a prioritized, value-driven implementation plan optimized for parallel execution and incremental delivery — refined through multi-agent peer review.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `requirements_path` | Path to the PRD markdown file | `docs/reqs/main.md` | No |
| `plan_path` | Path where the implementation plan will be written | `docs/plans/main.md` | No |
| `specs_path` | Path to technical specifications directory | `docs/specs` | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

You orchestrate the creation of a high-quality implementation plan through:
1. Invoking the **Product Manager sub-agent** to gather requirements and draft the plan
2. Running a **peer review loop** where specialist sub-agents provide structured feedback
3. Iterating until the plan is clear, complete, and compact enough for efficient agent consumption

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. If it exists, load the reviewer configuration and merge with defaults for any unspecified values. If it does not exist, load the defaults from the plugin's `config/defaults.yaml` file (located relative to this command at `../config/defaults.yaml`).

**How configuration works:**

1. The plugin ships a complete default configuration at `config/defaults.yaml`
2. Projects can override any setting by creating `.synthex/config.yaml` in their repo root (use the `init` command to scaffold this file)
3. Only settings present in the project config override the defaults — unspecified values fall through to `config/defaults.yaml`

**Default values** (from `config/defaults.yaml`):

| Setting | Default |
|---------|---------|
| Reviewers | architect, designer, tech-lead (all enabled) |
| `max_review_cycles` | 3 |
| `min_severity_to_address` | high |
| `documents.requirements` | `docs/reqs/main.md` |
| `documents.implementation_plan` | `docs/plans/main.md` |
| `documents.specs` | `docs/specs` |

Projects can customize by running `init` to create `.synthex/config.yaml`, then editing it. They can add reviewers (e.g., a security reviewer, compliance reviewer), disable defaults that aren't relevant, adjust max review cycles, or change the minimum severity threshold. See the Project Configuration section below for full details.

### 2. Read and Understand Requirements

Read the PRD at `@{requirements_path}` thoroughly. Understand:
- The product vision and purpose
- Target users and their needs
- All functional and non-functional requirements
- What is explicitly out of scope
- Success metrics

### 3. Gather Technical Context

Read available technical specifications and project context:
- Check `@{specs_path}` for existing technical specs (architecture, frontend, design system)
- Check `@CLAUDE.md` for project conventions, patterns, and constraints
- Check `package.json` or equivalent for current tech stack
- Understand the current state of the codebase (what already exists)

### 4. User Interview

Launch the **Product Manager sub-agent** to conduct an interactive Q&A with the user. The PM should:
- Clarify any ambiguous or incomplete requirements from the PRD
- Confirm priorities and scope boundaries
- Understand constraints not captured in the PRD
- Fill gaps before drafting the plan

The PM asks questions in small batches (3-5 at a time), adapting follow-ups based on answers. This ensures the plan is grounded in a thorough understanding of the user's intent.

### 5. Draft the Implementation Plan

The Product Manager produces an initial implementation plan draft following the standard template (see Output section below). The draft must include:
- Phased milestones delivering incremental value
- Specific, executable tasks with complexity grades (S/M/L)
- Dependencies and critical path identified
- Parallelizable work explicitly called out
- A **Decisions** section documenting major planning decisions and rationale
- An **Open Questions** section tracking items needing further discovery

### 6. Peer Review Loop

This is the core quality mechanism. The draft plan is reviewed by specialist sub-agents who provide structured feedback.

**Process:**

```
┌─────────────────┐
│  Draft Plan      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Spawn reviewers IN PARALLEL
│  Peer Review     │──── Each reviewer provides structured
│  (all reviewers) │     feedback with severity levels
└────────┬────────┘
         │
         ▼
┌─────────────────┐     PM addresses all CRITICAL and HIGH
│  PM Addresses    │──── PM has final say on requirements
│  Feedback        │     PM asks user for help when unsure
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  All CRITICAL/   │── No ──► Loop back to Peer Review
│  HIGH addressed? │         (up to max_review_cycles)
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│  Compactness     │
│  Review          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Write Final     │
│  Plan            │
└─────────────────┘
```

**Step 6a: Spawn Reviewers**

For each enabled reviewer in the configuration, launch a sub-agent IN PARALLEL with:
- The full draft implementation plan
- The PRD for reference
- The reviewer's specific focus area
- Instructions to provide structured feedback

**Step 6b: Reviewer Feedback Format**

Each reviewer must produce feedback in this structure:

```markdown
## Implementation Plan Review — [Reviewer Role]

### Findings

#### [CRITICAL] Finding Title
- **Section:** [Which part of the plan this affects]
- **Issue:** [What's wrong or missing]
- **Suggestion:** [Specific recommendation for improvement]

#### [HIGH] Finding Title
- **Section:** ...
- **Issue:** ...
- **Suggestion:** ...

#### [MEDIUM] Finding Title
...

#### [LOW] Finding Title
...

### Summary
[Overall assessment: Is the plan ready? What are the top concerns?]
```

**Severity definitions for plan review:**
- **CRITICAL** — Plan cannot be executed as-is. Missing critical tasks, fundamentally wrong sequencing, architectural impossibility, missing entire domain of work.
- **HIGH** — Significant quality issues. Vague acceptance criteria that will cause rework, missing dependencies, parallelization errors, unclear task scope that will block engineers.
- **MEDIUM** — Improvement opportunities. Could be clearer, minor dependency concerns, optimization suggestions, nice-to-have tasks missing.
- **LOW** — Polish. Formatting, naming, minor wording improvements.

**Step 6c: Product Manager Addresses Feedback**

The Product Manager receives all reviewer feedback and:
1. **Must address** all CRITICAL and HIGH findings (per `min_severity_to_address` config)
2. **May address** MEDIUM and LOW findings at its discretion
3. **Has final say** on requirements content — if a reviewer suggests changing *what* to build, the PM decides. But feedback on *clarity* (is this task clear enough to execute?) carries high weight.
4. **Asks the user** for guidance when unsure how to handle feedback — especially architectural trade-offs, scope questions, or conflicting reviewer opinions
5. Documents how each CRITICAL/HIGH finding was addressed (accepted, modified, or rejected with reasoning)

**Step 6d: Re-review if Needed**

If the PM made significant changes, submit the revised plan for another review cycle. Continue until:
- All CRITICAL and HIGH findings are addressed, OR
- `max_review_cycles` is reached (default: 3)

If max cycles are reached with unresolved findings, document them in the Open Questions section.

### 7. Compactness Review

After the peer review loop completes, the Product Manager does a final compactness pass:
- Remove redundant or duplicated information
- Tighten language — say more with fewer words
- Ensure no information is lost in the process
- The plan will be loaded into agent context windows, so every unnecessary line costs capacity

**Rule of thumb:** If a section can be 30% shorter without losing meaning, make it shorter.

### 8. Write the Plan

Write the finalized implementation plan to `@{plan_path}`.

### 9. Update Project Files

- Update `@CLAUDE.md` with any relevant workflow patterns, commands, or conventions discovered during planning
- Do NOT place the plan itself in CLAUDE.md

---

## Output

The implementation plan will follow this structure:

```markdown
# Implementation Plan: [Product Name]

## Overview
[Brief summary linking back to the PRD. Keep this to 2-3 sentences.]

## Decisions

Major decisions made during planning that influence task structure. Ensures consistency as the plan evolves.

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | [What was decided] | [Why this came up] | [Why we chose this path] |

## Open Questions

Items requiring further discovery that could lead to future decisions and plan changes.

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | [What we need to figure out] | [What it could affect in the plan] | Open |

## Phase 1: [Name — Delivers X Value]

### Milestone 1.1: [Name]
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 1 | [Task description] | S/M/L | None | pending |
| 2 | [Task description] | M | Task 1 | pending |
| 3 | [Task description] | S | None | pending |

**Parallelizable:** Tasks 1 and 3 can run concurrently.
**Milestone Value:** [What the user gets when this milestone is complete]

### Milestone 1.2: [Name]
...

## Phase 2: [Name — Delivers Y Value]
...
```

---

## Project Configuration

The `write-implementation-plan` command reads its configuration from `.synthex/config.yaml` in the project root. This is part of the Synthex's project configuration framework — a standard mechanism for projects to customize agent behavior.

### Configuration Schema

```yaml
# .synthex/config.yaml
#
# Project-level configuration for the Synthex plugin.
# When this file is absent, defaults are used.
# Only include sections you want to override — unspecified values use defaults.

implementation_plan:
  # Sub-agents that review the draft implementation plan
  # Each reviewer provides structured feedback that the Product Manager addresses
  reviewers:
    - agent: architect          # Sub-agent to invoke
      enabled: true             # Set to false to skip this reviewer
      focus: "..."              # What this reviewer should focus on

  # Maximum review loop iterations (default: 3)
  max_review_cycles: 3

  # Minimum severity the PM must address (default: high)
  # Options: critical, high, medium, low
  min_severity_to_address: high
```

### Adding a Custom Reviewer

To add a project-specific reviewer (e.g., a security reviewer for a fintech project):

```yaml
implementation_plan:
  reviewers:
    - agent: architect
      enabled: true
      focus: "Technical architecture, feasibility, NFR coverage"
    - agent: designer
      enabled: true
      focus: "Design tasks, UX impact, visual design clarity"
    - agent: tech-lead
      enabled: true
      focus: "Task clarity, acceptance criteria, parallelizability"
    - agent: security-reviewer
      enabled: true
      focus: "Security tasks, compliance requirements, threat modeling coverage"
```

### Disabling a Default Reviewer

To skip the designer reviewer for a backend-only project:

```yaml
implementation_plan:
  reviewers:
    - agent: architect
      enabled: true
      focus: "Technical architecture, feasibility, NFR coverage"
    - agent: designer
      enabled: false
    - agent: tech-lead
      enabled: true
      focus: "Task clarity, acceptance criteria, parallelizability"
```

---

## Critical Requirements

- Every task must trace back to a requirement in the PRD
- Prioritize developer infrastructure and tooling in early milestones (unblocks everything else)
- Each milestone must produce a working, demonstrable increment
- Parallelizable tasks must be explicitly identified
- Dependencies must be accurate — a task should never depend on something in a later phase/milestone
- Complexity grades (S/M/L) should be realistic and consistent
- The Decisions section must capture all major planning decisions with rationale
- The Open Questions section must track all unresolved items
- The final plan must be as compact as possible without losing information
- The Product Manager must address all CRITICAL and HIGH reviewer findings
- The Product Manager may ask the user for help when unsure about feedback

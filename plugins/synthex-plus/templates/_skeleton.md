# {Team Name} Template

> {One-sentence purpose statement describing what this team formation is optimized for.}

<!--
  This is the canonical template skeleton for Synthex+ team templates.
  All concrete templates (implementation.md, review.md, planning.md) MUST
  conform to this structure: same heading levels, same section ordering,
  same prose density rules.

  Structural rules:
  - H2 (##) for top-level sections
  - H3 (###) for subsections within a section
  - Bullets over paragraphs -- max 3 sentences per guidance block
  - Use {placeholder} syntax for values each concrete template fills in

  See ADR-plus-001 (docs/specs/decisions/ADR-plus-001-read-on-spawn.md)
  for the rationale behind the read-on-spawn agent identity approach.
-->

## Purpose

<!-- 2-3 bullets describing the team's mission and when it provides value. Each bullet max 3 sentences. -->

- {What this team formation achieves that the standard Synthex subagent approach cannot}
- {The type of work this team is optimized for and the coordination pattern it enables}
- {The key value proposition -- why a persistent team produces better outcomes here}

## Agent References

<!-- Each role maps to a Synthex agent definition file. The agent file is the single source of truth
     for the teammate's identity (expertise, output format, behavioral rules). The overlay column
     defines team-specific coordination behaviors layered ON TOP of the base agent identity. -->

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| {Lead Role Name} | `plugins/synthex/agents/{lead-agent}.md` | Yes | {Mailbox: how the lead communicates with teammates. Task list: how the lead creates/assigns tasks. Reporting: how the lead reports progress to the caller.} |
| {Specialist Role Name} | `plugins/synthex/agents/{specialist-agent}.md` | Yes/No | {Mailbox: when and how this role messages the lead and other teammates. Task list: how this role claims tasks, reports completion, flags blockers. Communication: who this role coordinates with directly.} |

<!-- Add rows for each role in the team. Mark Required=Yes for roles that must be present
     for the team to function. Mark Required=No for optional roles that enhance the team
     but can be omitted (e.g., Performance Engineer in review teams). -->

### Spawn Pattern (read-on-spawn)

<!-- This section documents the exact spawn prompt structure per ADR-plus-001.
     Every teammate is spawned using this pattern -- no exceptions. -->

Each teammate's spawn prompt follows this structure:

1. **Identity:** "Read your full agent definition at `{agent file path}` and adopt it as your identity"
   - The teammate reads the complete Synthex agent markdown file as its first action
   - This gives the teammate full behavioral fidelity: expertise, output format, severity frameworks, behavioral rules
   - No condensed summaries or inline identities -- the canonical agent file IS the identity

2. **Overlay:** Team-specific behavioral instructions from the overlay column above
   - Mailbox usage conventions (when to send messages, to whom, expected format)
   - Task list conventions (how to claim tasks, report completion, flag blockers)
   - Communication patterns (who this role coordinates with directly, reporting cadence)
   - These overlay instructions layer ON TOP of the base agent identity -- they do not replace it

3. **Context:** Milestone/project context
   - CLAUDE.md and project-level conventions
   - Relevant specifications and design documents
   - Implementation plan (milestone scope, task dependencies, acceptance criteria)
   - Any task-specific context the lead provides at assignment time

## Communication Patterns

<!-- Define how teammates communicate. Use bullets. Max 3 sentences per bullet.
     Cover: who initiates, the medium (mailbox vs. task list), and expected response. -->

- {How the lead distributes work and receives status updates}
- {How specialists communicate with the lead (mailbox messages, task list updates)}
- {How cross-role communication works (e.g., reviewer-to-implementer, specialist-to-specialist)}
- {Escalation path: what happens when a teammate is blocked or discovers cross-cutting concerns}

## Task Decomposition Guidance

<!-- Define how the lead breaks work into shared task list items. Cover: granularity,
     dependency chains, description enrichment, claiming/completion conventions. -->

- {How the lead maps source work items (e.g., plan tasks, review scope) to shared task list items}
- {Dependency chain conventions: when to use blockedBy, how to express parallel vs. sequential work}
- {Task description enrichment: what context each task description must include (CLAUDE.md reference, spec links, acceptance criteria, inter-task integration points, context budget guidance)}
- {Task claiming and completion: how teammates claim tasks, how they report completion, what "done" means for this team}

## Quality Gates

<!-- Define which quality mechanisms apply to this team formation. Cover: hooks,
     review criteria, re-review cycles. Max 3 sentences per bullet. -->

- {Which hooks apply (e.g., TaskCompleted review gate, TeammateIdle work assignment)}
- {Review criteria: what must pass before work is considered complete (verdict handling, severity thresholds)}
- {Re-review cycle behavior: how the team handles FAIL verdicts, who re-reviews, scope of re-review}

## When to Use / When NOT to Use

<!-- Provide concrete, measurable thresholds. Avoid vague guidance like "complex work" --
     use specific numbers (hours, LOC, file count, requirement count). -->

**Use this template when:**

- {Concrete threshold, e.g., "Estimated work exceeds 4 hours"}
- {Specific scenario with measurable criteria, e.g., "Changes span 5+ files across 2+ system layers"}
- {Coordination need, e.g., "Multiple specialists need to communicate findings to each other"}

**Do NOT use this template when:**

- {Concrete threshold, e.g., "Single focused task under 30 minutes"}
- {Specific scenario, e.g., "Work is confined to a single domain (frontend-only, backend-only)"}
- {Fallback guidance: "Use standard Synthex `{fallback command}` instead"}

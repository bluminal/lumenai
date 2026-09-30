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

  See ADR-plus-001 (docs/specs/decisions/ADR-plus-001-read-on-spawn.md) for the read-on-spawn
  agent identity approach this skeleton originally documented, and ADR-plus-002
  (docs/specs/decisions/ADR-plus-002-teammate-identity-via-subagent-type.md) for why concrete
  templates (review.md) now spawn reviewer teammates with `agentType: synthex:<agent-name>`
  instead. Templates for roles without a stable one-teammate-per-agent-file mapping (e.g. a
  role that is deliberately generic, or the Lead role, which has no Synthex agent file) may
  still use the read-on-spawn pattern below.
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

### Spawn Pattern (`agentType: synthex:<agent-name>`)

<!-- This section documents the default spawn shape per ADR-plus-002 (which reverses
     ADR-plus-001's read-on-spawn approach for roles that map to a Synthex agent file).
     Every teammate with a Synthex agent file row in the Agent References table above is
     spawned using this pattern. -->

Every role with a `plugins/synthex/agents/{agent}.md` row in the Agent References table is
spawned with its `agentType` set to `synthex:{agent-name}` on the team-spawn call, not with a
"read your agent file" instruction. This resolves the teammate's model, effort, and full system
prompt from the agent file at spawn time, re-attached on every request outside the
conversation-history message stream -- durable across compaction (ADR-plus-002; Task 51
live-compaction spike). Roles with no Synthex agent file (e.g. a Lead role that is the command
orchestrator, not an agent) keep a prompt-based identity per the read-on-spawn pattern below.

Each teammate's spawn still carries two more things beyond agent-type identity:

1. **Overlay:** Team-specific behavioral instructions from the overlay column above
   - Mailbox usage conventions (when to send messages, to whom, expected format)
   - Task list conventions (how to claim tasks, report completion, flag blockers)
   - Communication patterns (who this role coordinates with directly, reporting cadence)
   - These overlay instructions layer ON TOP of the base agent identity -- they do not replace it

2. **Context:** Milestone/project context
   - CLAUDE.md and project-level conventions
   - Relevant specifications and design documents
   - Implementation plan (milestone scope, task dependencies, acceptance criteria)
   - Any task-specific context the lead provides at assignment time

**Fallback (read-on-spawn, for roles without a Synthex agent file, or if a host's team-spawn
primitive does not accept `agentType`):** the teammate's spawn prompt instructs it directly:
"Read your full agent definition at `{agent file path}` and adopt it as your identity" as its
first action -- the canonical agent file IS the identity, no condensed summary. See
ADR-plus-002's Consequences for the detection/fallback contract (verify with `ListAgents`, not by
reading `config.json`; if a spawned teammate's `agentType` is empty or mismatched, re-issue the
read-on-spawn instruction for that teammate).

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

---

## Labeled Prose Overlay Convention

<!-- IMPORTANT: This section documents a Synthex+ architectural convention (D22).
     It applies to ALL concrete templates, not just this skeleton.
     When adding a new conditional behavior to any template, follow this pattern. -->

### What are labeled overlay sections?

Synthex+ templates may expose **labeled prose overlay sections** — named Markdown subtrees that
commands conditionally include verbatim into teammate spawn prompts when specific feature flags
resolve true. The section naming convention is:

```
### <Name> Overlay (apply when <flag>=true)
```

For example, `review.md` currently defines two overlays (a third, the Standing Pool Identity
Confirm Overlay for FR-MMT5b, was retired by ADR-plus-002 — see that ADR and the Spawn Pattern
section above for what replaced it):

1. **`### Multi-Model Conditional Overlay (apply when multi_model=true)`** — included verbatim
   into the team Lead's and native reviewers' spawn prompts when `multi_model: true` resolves for
   the team (FR-MMT4, FR-MMT20). Contains (a) the Lead-suppression instruction directing the Lead
   to wait for the orchestrator's report instead of producing its own, and (b) the reviewer
   JSON-envelope instruction requiring native reviewers to produce structured `findings_json`
   alongside their markdown report.

2. **`### Standing Pool Lifecycle Overlay (apply when standing=true)`** — included verbatim into
   the Pool Lead's spawn prompt ONLY when `standing: true` resolves for the pool (FR-MMT12,
   FR-MMT9b, FR-MMT14). Defines `last_active_at` maintenance, idle persistence, shutdown signal
   handling, draining, and clean exit.

### There is no rendering engine

**IMPORTANT:** There is no Handlebars, Mustache, Jinja2, or any other template rendering engine
in Synthex+. Template files are plain Markdown. Conditional composition is NOT performed by
expanding `{{#if flag}}…{{/if}}` blocks at read time.

Composition works as follows:

1. The command workflow markdown instructs the host model (Claude Code) to read the relevant
   template file.
2. The command workflow conditionally includes the labeled overlay section verbatim when its flag
   resolves true — this is a direct instruction in the command's workflow prose, e.g.:
   > "If `multi_model: true`, include the full text of the
   > `### Multi-Model Conditional Overlay (apply when multi_model=true)` section from
   > `templates/review.md` verbatim in the teammate's spawn prompt."
3. The host model follows the command's workflow instruction and performs the raw inclusion.
   No rendering, no variable substitution, no partial evaluation.

**Test surface:** Layer 1 schema tests validate the presence of overlay text by raw-string matching
against what the command writes into the composed spawn-prompt blob — not by evaluating template
syntax.

### How to add a new overlay to a template

1. Append a new `### <Name> Overlay (apply when <flag>=true)` section to the relevant template
   file (e.g., `review.md`, `implementation.md`, `planning.md`).
2. Keep the overlay as a **single contiguous Markdown subtree** under the heading. Do not scatter
   fragments across multiple headings.
3. Include a composition note at the top of the overlay section documenting: (a) that there is no
   rendering engine, (b) when the overlay fires (which flag, which spawn-prompt point), and (c) how
   command workflow markdown is responsible for verbatim inclusion.
4. Update the command workflow markdown (e.g., `commands/team-review.md`) to include an explicit
   instruction for when and how to include the overlay verbatim.
5. Add a Layer 1 schema test asserting the overlay heading and at least one key verbatim string are
   present in the composed spawn-prompt blob.

### Existing overlays reference

| Template | Overlay Heading | Flag | Fires At | PRD Source |
|----------|-----------------|------|----------|-----------|
| `review.md` | `### Multi-Model Conditional Overlay (apply when multi_model=true)` | `multi_model=true` | Spawn time (Lead + reviewers) | FR-MMT4, FR-MMT20 |
| `review.md` | `### Standing Pool Lifecycle Overlay (apply when standing=true)` | `standing=true` | Spawn time (Lead only) | FR-MMT12, FR-MMT9b, FR-MMT14 |

Retired: `### Standing Pool Identity Confirm Overlay (apply when standing=true)` (FR-MMT5b,
`standing=true`, fired per task claim) — deleted by ADR-plus-002; reviewer identity now comes
from the `agentType: synthex:<agent-name>` spawn-time attachment instead of a per-task re-read.

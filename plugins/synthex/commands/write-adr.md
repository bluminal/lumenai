# Write ADR

Create an Architecture Decision Record (ADR) through an interactive process with the Architect sub-agent. ADRs capture important technical decisions with their context, alternatives considered, and consequences — ensuring institutional memory persists beyond any individual's involvement.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `title` | Short title describing the decision | None | Yes |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

You facilitate the creation of a well-structured ADR by:
1. Invoking the **Architect sub-agent** to conduct an interactive decision-making session
2. Ensuring all alternatives are genuinely considered (not just straw-man options)
3. Writing the final ADR document with a unique, sequential ID

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load the architecture configuration for the decisions path.

**Default values:**

| Setting | Default |
|---------|---------|
| `architecture.decisions_path` | `docs/specs/decisions` |

### 2. Determine ADR Number

Scan the decisions directory for existing ADR files. ADR filenames follow the pattern `NNNN-kebab-case-title.md` (e.g., `0001-use-postgresql.md`). Determine the next sequential number.

If the decisions directory doesn't exist, create it.

### 3. Launch Architect Sub-Agent

Invoke the **Architect sub-agent** in ADR authoring mode. Provide:
- The decision title
- The project's existing ADR directory (so the Architect can reference related past decisions)
- The project's `CLAUDE.md` and any existing specs for technical context

The Architect will conduct an interactive session with the user:

1. **Clarify the decision context** — What problem are we solving? What constraints exist? What triggered this decision?
2. **Explore alternatives** — At minimum, enumerate 2-3 genuine alternatives (including "do nothing" where applicable). For each: describe the approach, list pros/cons, and assess trade-offs.
3. **Reach a decision** — Guide the user toward a decision by summarizing trade-offs. The user makes the final call.
4. **Document consequences** — What becomes easier? What becomes harder? What risks does this create?

### 4. Write the ADR

The Architect produces the ADR document in this format:

```markdown
# ADR-[NNNN]: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Date

[YYYY-MM-DD]

## Context

[What is the issue that we're seeing that is motivating this decision or change?
Include constraints, requirements, and forces at play.]

## Decision

[What is the change that we're proposing and/or doing?
State the decision clearly and concisely.]

## Alternatives Considered

### Alternative 1: [Name]
- **Description:** [How this alternative would work]
- **Pros:** [Benefits]
- **Cons:** [Drawbacks]
- **Why not chosen:** [Specific reason this was rejected]

### Alternative 2: [Name]
[Same format]

### Alternative 3: [Name] (if applicable)
[Same format]

## Consequences

### Positive
- [What becomes easier or better]

### Negative
- [What becomes harder or worse]

### Risks
- [What could go wrong and how we'd mitigate it]

## Related Decisions

- [Links to related ADRs, if any]
```

Write the ADR to `{decisions_path}/NNNN-{kebab-case-title}.md`.

### 5. Confirm and Guide

```
ADR-[NNNN] written to [path].

Status: [Proposed/Accepted]
Decision: [One-line summary]
Alternatives considered: [count]

To reference this decision, link to: ADR-[NNNN]
To supersede this decision later, create a new ADR and update the Status field.
```

---

## Critical Requirements

- The Architect MUST explore genuine alternatives — at minimum 2 real options beyond the chosen approach
- "Do nothing" is a valid alternative and should be considered when the status quo is viable
- The user makes the final decision, not the Architect — the Architect advises
- Consequences must include both positive AND negative outcomes — one-sided ADRs are incomplete
- ADR numbers are sequential and never reused, even if an ADR is deprecated
- Every ADR must be self-contained — a reader should understand the decision without reading external documents

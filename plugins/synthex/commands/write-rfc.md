# Write RFC

Create a Request for Comments (RFC) document for a significant technical proposal — combining product context with technical design and structured multi-agent review.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `title` | Short title describing the proposal | None | Yes |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

You facilitate the creation of an RFC by:
1. Invoking the **Architect sub-agent** to lead the technical design process
2. Gathering product context from the **Product Manager sub-agent**
3. Running a structured review loop with multiple perspectives
4. Writing the final RFC document with clear acceptance criteria

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load the architecture configuration.

**Default values:**

| Setting | Default |
|---------|---------|
| `architecture.rfcs_path` | `docs/specs/rfcs` |
| `architecture.review_loops.max_cycles` | inherited from global `review_loops.max_cycles` (2) |
| `architecture.review_loops.min_severity_to_address` | inherited from global `review_loops.min_severity_to_address` (high) |

**Review loop config resolution order:** `architecture.review_loops` > global `review_loops` > hardcoded default (max_cycles: 2, min_severity_to_address: high).

### 2. Determine RFC Number

Scan the RFCs directory for existing RFC files. RFC filenames follow the pattern `NNNN-kebab-case-title.md` (e.g., `0001-migrate-to-event-sourcing.md`). Determine the next sequential number.

If the RFCs directory doesn't exist, create it.

### 3. Gather Product Context

Launch the **Product Manager sub-agent** to provide product context for the RFC:

- What user problem does this proposal address?
- What product goals does it serve?
- What are the success metrics?
- Are there user research findings or data that support this proposal?

The PM provides this context but does NOT make the technical decision.

### 4. Launch Architect for RFC Authoring

Invoke the **Architect sub-agent** to lead an interactive RFC creation session. Provide:

- The RFC title
- The product context from the PM
- The project's existing specs, ADRs, and previous RFCs for technical context
- The project's `CLAUDE.md` for conventions

The Architect conducts an interactive session:

1. **Problem statement** — What technical problem are we solving? Why now?
2. **Proposed solution** — Detailed technical design with diagrams (Mermaid), data models, API contracts, and component interactions
3. **Alternatives** — At minimum 2 genuine alternatives with trade-off analysis
4. **Migration strategy** — How do we get from here to there? (if applicable)
5. **Risks and mitigations** — What could go wrong?
6. **Acceptance criteria** — How do we know this is done and successful?

### 5. RFC Review Loop

This step runs up to `review_loops.max_cycles` iterations (default: 2). Each cycle:

**Step 5a: Launch Reviewers**

Launch **fresh** reviewer sub-agents IN PARALLEL (new instances each cycle — never resume prior agents):

**Architect sub-agent (self-review):**
- Technical feasibility, architectural consistency, scalability

**Product Manager sub-agent:**
- Product alignment, user impact, success metrics adequacy

**Tech Lead sub-agent:**
- Implementation feasibility, team capacity, incremental delivery path

**Security Reviewer sub-agent:**
- Security implications, threat model changes, compliance impact

Each reviewer receives the current RFC draft and provides structured feedback in the standard format (CRITICAL/HIGH/MEDIUM/LOW findings). On cycles 2+, reviewers also receive a compact summary of unresolved findings from the prior cycle (see Context Management below).

**Step 5b: Address Findings**

The Architect addresses all CRITICAL and HIGH findings (per `review_loops.min_severity_to_address`), revising the RFC as needed. MEDIUM and LOW findings may be addressed at the Architect's discretion.

**Step 5c: Check Exit Conditions**

Exit the loop when:
- All CRITICAL and HIGH findings are addressed, OR
- `review_loops.max_cycles` is reached

If max cycles are reached with unresolved CRITICAL or HIGH findings, document them in the RFC's Open Questions section with a note that they require resolution before the RFC can be accepted.

**Context Management:** Each cycle spawns new sub-agent instances to prevent context exhaustion across multiple review iterations. Between cycles, the orchestrating command carries forward only:
1. The updated RFC draft (full text)
2. A compact findings summary: one line per unresolved finding with severity, title, and reviewer
3. The current cycle number

Do NOT carry forward full reviewer outputs or resolution notes from prior cycles.

### 6. Write the RFC

The Architect produces the final RFC document:

```markdown
# RFC-[NNNN]: [Title]

## Status

[Draft | In Review | Accepted | Rejected | Superseded by RFC-XXXX]

## Date

[YYYY-MM-DD]

## Authors

[Who proposed this]

## Reviewers

[Who reviewed this and their roles]

---

## Summary

[2-3 sentence executive summary of what this RFC proposes and why]

## Product Context

[User problem, product goals, success metrics — from the PM]

## Problem Statement

[Detailed technical problem description. Why is the current approach insufficient?
What constraints and forces are driving the need for change?]

## Proposed Solution

### Overview
[High-level description of the proposal]

### Detailed Design
[Technical details: data models, API contracts, component interactions,
sequence diagrams (Mermaid), state machines, etc.]

### Implementation Plan
[How this would be broken into incremental, deliverable chunks]

## Alternatives Considered

### Alternative 1: [Name]
- **Description:** [How this alternative would work]
- **Pros:** [Benefits]
- **Cons:** [Drawbacks]
- **Why not chosen:** [Specific reasoning]

### Alternative 2: [Name]
[Same format]

## Migration Strategy

[How to transition from the current state to the proposed state.
Include backward compatibility considerations, feature flags, data migration.]

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [risk] | [H/M/L] | [H/M/L] | [specific mitigation] |

## Security Considerations

[Security implications, threat model changes, new attack surfaces]

## Acceptance Criteria

- [ ] [Specific, verifiable criterion]
- [ ] [Another criterion]

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | [Unresolved question] | [What it affects] | Open |

## Related Documents

- [Links to related ADRs, RFCs, specs]
```

Write the RFC to `{rfcs_path}/NNNN-{kebab-case-title}.md`.

### 7. Confirm and Guide

```
RFC-[NNNN] written to [path].

Status: Draft
Proposal: [One-line summary]
Reviewers: Architect, Product Manager, Tech Lead, Security Reviewer
Open questions: [count]

Next steps:
1. Share with stakeholders for asynchronous review
2. Address open questions
3. Update status to Accepted or Rejected after decision
```

---

## Critical Requirements

- RFCs are for SIGNIFICANT proposals — architecture changes, new system components, major refactors, technology migrations. Not for bug fixes or minor features.
- The Product Manager provides context but does NOT make technical decisions — the RFC process is technically led by the Architect
- At minimum 2 genuine alternatives must be considered — "do nothing" is valid when the status quo is viable
- The implementation plan section must show how to deliver incrementally — big-bang deployments are a red flag
- Security considerations are mandatory, not optional
- The RFC document must be self-contained — a reader should understand the proposal without reading external documents
- Open questions are healthy — they signal intellectual honesty about what isn't yet resolved

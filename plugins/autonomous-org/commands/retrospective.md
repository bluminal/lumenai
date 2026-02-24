# Retrospective

Facilitate a structured retrospective at the end of a delivery cycle, phase, or milestone — combining quantitative metrics with qualitative analysis to produce actionable improvement items.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `scope` | What period/milestone this retrospective covers | current phase in implementation plan | No |
| `implementation_plan_path` | Path to the implementation plan | `docs/plans/main.md` | No |
| `config_path` | Path to autonomous-org project config | `.autonomous-org/config.yaml` | No |

## Core Responsibilities

You orchestrate a structured retrospective by:
1. Invoking the **Metrics Analyst sub-agent** to gather quantitative data
2. Invoking the **Retrospective Facilitator sub-agent** to conduct the retrospective
3. Ensuring the retrospective produces actionable, owned, timeboxed improvement items

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load the retrospective configuration.

**Default values:**

| Setting | Default |
|---------|---------|
| `retrospective.output_path` | `docs/retros` |
| `retrospective.format` | `start-stop-continue` |
| `retrospective.max_improvement_items` | `3` |

### 2. Determine Retrospective Scope

Resolve what period this retrospective covers:

- **Explicit scope provided:** Use the specified milestone/phase/period
- **No scope provided:** Read `@{implementation_plan_path}` and identify the most recently completed phase or milestone

### 3. Gather Quantitative Data

Launch the **Metrics Analyst sub-agent** to collect and analyze quantitative data for the retrospective period. Provide:

- The implementation plan (for planned-vs-actual analysis)
- The git history for the period (commits, PRs, deployment frequency)
- Any available CI/CD data (build times, test results, deployment logs)

The Metrics Analyst returns:
- DORA metrics snapshot (where applicable)
- Planned vs actual task completion
- Estimation accuracy analysis
- Any notable quantitative trends

### 4. Review Previous Retrospective

Check for previous retrospective documents in the output directory. If a previous retrospective exists:

- Load the improvement items from the most recent retrospective
- Track their status (Done / In Progress / Not Started / Dropped)
- Calculate the follow-through rate

This data feeds into the "Previous Improvement Items Follow-Up" section.

### 5. Launch Retrospective Facilitator

Invoke the **Retrospective Facilitator sub-agent** with:

- The scope and period being covered
- The quantitative data from the Metrics Analyst
- The previous improvement items follow-up data
- The implementation plan for planned-vs-actual context
- The configured retrospective format

The Retrospective Facilitator conducts an interactive session:

1. **Previous improvement items review** — What happened with the items we committed to last time?
2. **Planned vs actual analysis** — What did we plan? What happened? Where did we deviate and why?
3. **Retrospective format session** — Guided discussion using the configured format (Start/Stop/Continue, 4Ls, or Sailboat)
4. **Pattern recognition** — Identify themes that recur across retrospectives
5. **Improvement item selection** — Prioritize 2-3 specific, owned, timeboxed improvement items
6. **Celebration** — Acknowledge wins from the cycle

### 6. Write Retrospective Document

The Retrospective Facilitator produces the full retrospective document. Write it to:

```
{output_path}/YYYY-MM-DD-[scope-slug].md
```

For example: `docs/retros/2025-03-15-phase-1-mvp.md`

### 7. Report Results

```
Retrospective Complete: [scope]

Previous improvement follow-through: [X of Y] ([%])
Format: [Start/Stop/Continue | 4Ls | Sailboat]

Improvement Items:
1. [Item 1] — Owner: [owner], Due: [date]
2. [Item 2] — Owner: [owner], Due: [date]
3. [Item 3] — Owner: [owner], Due: [date]

Celebration: [What we're celebrating]

Full retrospective written to: [path]
```

---

## Configuration

```yaml
# .autonomous-org/config.yaml (retrospective section)
retrospective:
  # Where retrospective documents are stored
  output_path: docs/retros

  # Retrospective format: start-stop-continue | 4ls | sailboat
  format: start-stop-continue

  # Maximum improvement items per cycle (more = less focus)
  max_improvement_items: 3
```

---

## Critical Requirements

- The retrospective MUST be blameless — all observations framed in terms of systems and processes, never individuals
- Previous improvement items MUST be reviewed at the start — this is non-negotiable and ensures accountability
- Improvement items MUST be specific, owned, and timeboxed — "improve test coverage" is not acceptable; "add integration tests for the auth module, targeting 80% branch coverage, due by end of next cycle" is acceptable
- Limit improvement items to 2-3 per cycle — more than 3 competing for attention means none get done
- The celebration section is mandatory — retrospectives that only focus on problems create dread
- Items that appear in 2+ consecutive retrospectives without resolution MUST be escalated with a different approach
- Quantitative data from the Metrics Analyst complements but does not replace the qualitative discussion

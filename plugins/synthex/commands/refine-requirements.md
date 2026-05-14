---
model: opus
---

# Refine Requirements

Improve a Product Requirements Document (PRD) by running it through a multi-agent review loop focused on clarity, completeness, and communicability — then updating the PRD directly with the improvements.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `requirements_path` | Path to the PRD markdown file | `docs/reqs/main.md` | No |
| `specs_path` | Path to technical specifications directory | `docs/specs` | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |
| `--loop` | Enable native looping (FR-NL1/FR-NL2). When set, the command iterates per the "Native Looping" section below until the completion promise is emitted or `--max-iterations` is reached. | off | No |
| `--completion-promise <string>` | Promise text the agent emits as `<promise>X</promise>` to terminate the loop. | — | Required with `--loop` (unless `--resume*`) |
| `--max-iterations <int>` | Iteration cap (FR-NL13). Hard ceiling 200. | `20` | No |
| `--loop-isolated` | Fresh-subagent isolation mode per iteration (FR-NL18). | off (shared-context default) | No |
| `--name <slug>` | User-supplied loop-id slug `^[a-z0-9][a-z0-9-]{0,63}$`. | auto: `<command-slug>-<4-char-hex>` | No |

## Core Responsibilities

You orchestrate the refinement of a PRD through:
1. Having specialist sub-agents review the PRD for clarity and completeness
2. Collecting their questions and concerns
3. Answering questions you can answer from context, and escalating to the user for the rest
4. Updating the PRD to address all findings

This command does NOT produce an implementation plan. It improves the PRD so that downstream agents (and humans) can understand it without ambiguity.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. If it exists, load the reviewer configuration and merge with defaults for any unspecified values. If it does not exist, load the defaults from the plugin's `config/defaults.yaml` file (located relative to this command at `../config/defaults.yaml`).

**Default values** (from `config/defaults.yaml`):

| Setting | Default |
|---------|---------|
| Reviewers | product-manager, tech-lead, designer (all enabled) |
| `review_loops.max_cycles` | 2 (per-command override; global default is 2) |
| `review_loops.min_severity_to_address` | high (inherited from global) |
| `documents.requirements` | `docs/reqs/main.md` |

**Review loop config resolution order:** `refine_requirements.review_loops` > global `review_loops` > hardcoded default (max_cycles: 2, min_severity_to_address: high).

### 2. Read and Understand Requirements

Read the PRD at `@{requirements_path}` thoroughly. Build a mental model of:
- The product vision and purpose
- Target users and their needs
- All functional and non-functional requirements
- What is explicitly out of scope
- Success metrics

### 3. Gather Technical Context

Read available technical context to inform whether reviewer questions already have answers:
- Check `@{specs_path}` for existing technical specs
- Check `@CLAUDE.md` for project conventions, patterns, and constraints
- Check `package.json` or equivalent for current tech stack
- Understand the current state of the codebase (what already exists)

This context is critical — it lets you answer reviewer questions without bothering the user when the answers are already documented.

### 4. PRD Review Loop

This is the core quality mechanism. The PRD is reviewed by specialist sub-agents who identify areas that are unclear, incomplete, or ambiguous from their perspective.

**Process:**

```
┌─────────────────┐
│  Current PRD     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Spawn FRESH reviewers IN PARALLEL
│  PRD Review      │──── Each reviewer is a new sub-agent
│  (all reviewers) │     (never resumed from prior cycle)
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Haiku-backed dedup/group/sort
│  Findings        │──── Consolidates N reviewer outputs
│  Consolidator    │     into a single attributed list
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Triage findings:
│  Address         │──── - Answerable from context → update PRD directly
│  Findings        │     - Needs user input → AskUserQuestion
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  All CRITICAL/   │── No ──► Loop back to Review
│  HIGH addressed? │         (up to review_loops.max_cycles)
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│  Write Updated   │
│  PRD             │
└─────────────────┘
```

**Step 4a: Spawn Reviewers**

For each enabled reviewer in the configuration, launch a **fresh** sub-agent IN PARALLEL with:
- The full PRD (current version)
- Technical context gathered in Step 3
- The reviewer's specific focus area
- Instructions to review from a PRD clarity perspective (see feedback format below)
- On cycles 2+: a compact summary of unresolved findings from the prior cycle

**Context Management:** Each review cycle spawns **new** sub-agent instances — never resume prior reviewer agents. Between cycles, carry forward only:
1. The updated PRD (full text)
2. A compact findings summary: for each unresolved finding, one line with severity, title, and which reviewer raised it
3. The current cycle number

**Step 4b: Reviewer Feedback Format**

Each reviewer must produce feedback in this structure:

```markdown
## PRD Review — [Reviewer Role]

### Findings

#### [CRITICAL] Finding Title
- **Section:** [Which part of the PRD this affects]
- **Issue:** [What is unclear, missing, or ambiguous]
- **Question:** [Specific question that, if answered, would resolve the issue]
- **Suggestion:** [How the PRD could be improved to address this]

#### [HIGH] Finding Title
- **Section:** ...
- **Issue:** ...
- **Question:** ...
- **Suggestion:** ...

#### [MEDIUM] Finding Title
...

#### [LOW] Finding Title
...

### Summary
[Overall assessment: Is the PRD clear enough to build from? What are the top concerns?]
```

**Severity definitions for PRD review:**
- **CRITICAL** — Cannot build from this PRD. Entire feature areas undefined, fundamental contradictions, missing core requirements, target users not identified.
- **HIGH** — Significant ambiguity that will cause different interpretations. Vague acceptance criteria, unclear scope boundaries, missing non-functional requirements that affect architecture, undefined edge cases for core flows.
- **MEDIUM** — Improvement opportunities. Could be clearer, minor gaps, nice-to-have clarifications, edge cases for secondary flows.
- **LOW** — Polish. Formatting, wording, structural improvements.

**Step 4c: Consolidate Findings**

Before triaging raw reviewer outputs, invoke the **findings-consolidator** sub-agent (Haiku-backed) with all reviewer outputs from Step 4a. The consolidator:

- Deduplicates findings that multiple reviewers raised about the same PRD section
- Groups findings by PRD section
- Sorts by severity, preserves reviewer attribution
- Flags severity disagreements between reviewers

Work from the consolidated list in the next step rather than reading each reviewer's raw output. This substantially reduces reading load without losing information.

**Step 4d: Triage and Address Findings**

For each finding across all reviewers:

1. **Check if the answer exists in context** — If the question can be answered from the technical context gathered in Step 3 (CLAUDE.md, specs, codebase), update the PRD directly to communicate that information. Do NOT ask the user questions you already know the answer to.

2. **Ask the user when necessary** — If the finding raises a genuine product question that requires the user's judgment, preferences, or domain knowledge, use `AskUserQuestion` to get their input. Batch related questions together (3-5 at a time).

3. **Update the PRD** — For each addressed finding, revise the relevant section of the PRD to make the information clear. The goal is that a future reader of the PRD would not have the same question.

4. **Must address** all CRITICAL and HIGH findings (per `review_loops.min_severity_to_address`).

5. **May address** MEDIUM and LOW findings at your discretion.

**Step 4e: Re-review if Needed**

If significant changes were made to the PRD, submit the revised version for another review cycle by returning to Step 4a (spawning fresh reviewer sub-agents). Continue until:
- All CRITICAL and HIGH findings are addressed, OR
- `review_loops.max_cycles` is reached

If max cycles are reached with unresolved findings, add them to an "Open Questions" section at the end of the PRD.

### 5. Write the Updated PRD

Write the refined PRD back to `@{requirements_path}`.

Preserve the existing PRD structure and style. Do not reorganize or reformat sections that weren't affected by findings. The changes should feel like natural improvements to the existing document, not a rewrite.

### 6. Summary

Output a brief summary to the user:
- How many findings were identified across all reviewers
- How many were addressed (and how: from context vs. user input)
- Any remaining open questions added to the PRD
- Which sections of the PRD were most improved

---

## Reviewer Focus Areas

Each reviewer evaluates the PRD from their professional perspective:

### Product Manager
- Are requirements outcome-focused rather than implementation-focused?
- Are acceptance criteria specific and testable?
- Is scope clearly bounded (in-scope AND out-of-scope)?
- Are success metrics defined and measurable?
- Are user personas and pain points well-articulated?
- Are there contradictions between requirements?

### Tech Lead
- Are requirements clear enough for an engineer to estimate and implement?
- Are there implicit technical assumptions that should be explicit?
- Are non-functional requirements (performance, scale, security) specified with concrete targets?
- Are there missing requirements that would only surface during implementation?
- Are edge cases and error states addressed for core flows?

### Lead Frontend Engineer (Designer)
- Are UX requirements clear enough to design from?
- Are interaction patterns described (not just data requirements)?
- Are responsive/accessibility requirements specified?
- Are there visual or interaction design decisions that need to be made before implementation?
- Are user flows complete (including error states, empty states, loading states)?

---

## Project Configuration

The `refine-requirements` command reads its configuration from `.synthex/config.yaml`.

### Configuration Schema

```yaml
refine_requirements:
  reviewers:
    - agent: product-manager
      enabled: true
      focus: "Requirement clarity, acceptance criteria, scope boundaries, success metrics"

    - agent: tech-lead
      enabled: true
      focus: "Technical clarity, implicit assumptions, NFR targets, missing requirements"

    - agent: designer
      enabled: true
      focus: "UX clarity, interaction patterns, accessibility, user flow completeness"

  # Per-command review loop overrides.
  # review_loops:
  #   max_cycles: 2
```

### Adding a Custom Reviewer

```yaml
refine_requirements:
  reviewers:
    - agent: product-manager
      enabled: true
      focus: "Requirement clarity, acceptance criteria, scope boundaries"
    - agent: tech-lead
      enabled: true
      focus: "Technical clarity, implicit assumptions, NFR targets"
    - agent: designer
      enabled: true
      focus: "UX clarity, interaction patterns, accessibility"
    - agent: security-reviewer
      enabled: true
      focus: "Security requirements completeness, compliance gaps, threat model coverage"
```

---

## Native Looping

This command supports the native Synthex looping primitive (introduced by `docs/plans/native-looping.md`). Pass `--loop` to iterate until the completion promise is emitted or `--max-iterations` is reached. The mechanical iteration framework — state file schema, loop-id rules, shared-context vs. fresh-subagent iteration, auto-compaction guarantees, promise emission, iteration markers — lives once in [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md). Only the command-specific bits are inlined below.

### Emission Point

Emit `<promise>{completion_promise}</promise>` (literal text from `--completion-promise`) in the iteration's final response when ALL of the following hold:

- The PRD's `Open Questions` section is empty (or every question is annotated `Resolved` with the resolution recorded).
- No ambiguity markers (`?`, `TBD`, `unclear`, `to-be-decided`) remain in the Vision, Users, Scope, Success Criteria, or Constraints sections.
- The PRD is structurally complete: every required section is populated; section summaries are coherent.
- A follow-up iteration would not add new clarifying questions (the agent's judgment — typically when the previous iteration's questions have all been answered and no new ambiguities surfaced).

Do NOT emit the promise while the agent is still asking the user clarifying questions or while answers are pending. Native looping does NOT bypass `[H]` user-input gates — the loop simply re-runs `refine-requirements` until the PRD stabilizes.

### Iteration Body

When `--loop` is set, this command's existing workflow runs once per iteration. The agent follows the iteration loop body documented at [`shared-iter`](../docs/native-looping.md#shared-iter) by default (D-NL1 shared-context), or [`subagent-iter`](../docs/native-looping.md#subagent-iter) when `--loop-isolated` is passed: boundary check → increment counter → print marker → execute workflow → scan for promise → cancellation check → loop. State lives in `.synthex/loops/<loop-id>.json` per [FR-NL8](../docs/native-looping.md#state). Auto-compaction is safe because iteration state and work output both live on disk (FR-NL16, FR-NL17, FR-NL24).

The iteration marker (`[loop <loop-id> iteration <N>/<max>]`) prints to stdout before each iteration's workflow runs. See [`markers`](../docs/native-looping.md#markers).

### Precedence with Ralph Loop

If `--loop` is passed AND `.claude/ralph-loop.local.md` exists with `active: true`, native looping takes precedence per FR-NL44. The command prints a one-line advisory:

```
Note: --loop overrides Ralph Loop. The ralph-loop plugin's state file is unchanged; cancel the ralph loop separately if you want it gone.
```

`.claude/ralph-loop.local.md` is NOT mutated by this command. See [`precedence`](../docs/native-looping.md#precedence).

### See Also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration-framework spec.
- `/synthex:loop` — generic prompt loop (no command body).
- `/synthex:list-loops`, `/synthex:cancel-loop` — loop management.
- Plan: `docs/plans/native-looping.md` (Tasks 13–21, FR-NL1–FR-NL45).

## Critical Requirements

- The PRD is the ONLY artifact modified — no implementation plans, specs, or other documents are created
- Changes to the PRD must preserve its existing structure and voice
- Questions answerable from existing context (specs, CLAUDE.md, codebase) must NOT be escalated to the user
- Questions requiring user judgment MUST use `AskUserQuestion`
- All CRITICAL and HIGH findings must be addressed before completion
- The goal is clarity and communicability, not technical depth — leave technical details for implementation planning

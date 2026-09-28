# Structural Lint Rubric (FR-HM3, FR-HM26, Task 45)

No-shell prose fallback for `write-implementation-plan.md` Step 5.5, read when `command -v node` fails (the retired `plan-linter` Haiku sub-agent's rubric, now `plugins/synthex/scripts/lint-plan.mjs`). This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`. On hosts without `${CLAUDE_PLUGIN_ROOT}` expansion, resolve the plugin root via `.synthex/state.json`.

Self-check the draft plan against every item below. Record each violation the same way the script would: severity (CRITICAL / HIGH / MEDIUM), a one-line issue description, and a concrete fix. Report only violations — an empty list means the draft passes.

## Document-level

| Check | Severity |
|-------|----------|
| Starts with `# Implementation Plan: [Name]` | HIGH |
| Has a `## Overview` section | MEDIUM |
| Has a `## Decisions` section | HIGH |
| Has a `## Open Questions` section | HIGH |
| Has at least one `## Phase N: [Name]` section | CRITICAL |
| Has at least one `### Milestone N.N: [Name]` section | CRITICAL |

## Decisions / Open Questions tables

If a table exists under `## Decisions`, its header row must cover `#`, `Decision`, `Context`, `Rationale` (a merged "Context / Rationale" column satisfies both). Missing any of the four: **HIGH**. Same rule for `## Open Questions` against `#`, `Question`, `Impact`, `Status`.

## Per-milestone checks

For every `### Milestone` section:

| Check | Severity |
|-------|----------|
| Has a task table (`# \| Task \| Complexity \| Dependencies \| Status`, extra columns OK) | CRITICAL |
| Task table header row covers all five required columns | HIGH per missing column |
| Has a `**Milestone Value:**` line | HIGH |
| Has a `**Parallelizable:**` line — only required when the milestone has more than one task | HIGH |
| Has an `**Observational Outcomes:**` line — only required when an `` `[O]` `` criterion appears anywhere in the milestone | MEDIUM |

## Per-task checks

For every row in a milestone's task table:

| Check | Severity |
|-------|----------|
| Complexity is `S`, `M`, or `L` | HIGH |
| Dependencies cell is non-empty (a value, or "None") | HIGH |
| Status cell is non-empty | MEDIUM |
| A `**Task N Acceptance Criteria:**` line exists for that task | CRITICAL |
| That line's content contains at least one `` `[T]` ``, `` `[H]` ``, or `` `[O]` `` tag | CRITICAL |
| That content does not contain the generic phrase "works correctly" or "functions as expected" | HIGH |

Do **not** flag a task for lacking a `` `[T]` `` criterion just because all its criteria are `` `[H]` ``/`` `[O]` `` — legitimate spike/investigation tasks are all-`[H]` by design (see Milestone 1.2/1.3 of `docs/plans/harness-modernization.md` for the shipped precedent).

## Cross-referential checks

- Every task number named in a Dependencies cell must exist somewhere in the plan's task tables. Missing: **HIGH**.
- No task may depend on a task that appears LATER in the document (a forward reference). **CRITICAL**.
- An `` `[O]` `` tag must appear only at milestone/phase level (in a `**Observational Outcomes:**` line), never inside a `**Task N Acceptance Criteria:**` block. **MEDIUM**.

## Reporting

Present the findings to the Product Manager exactly as `lint-plan.mjs` would: a total count broken down by CRITICAL/HIGH/MEDIUM, and one entry per finding with its severity, location (milestone + task, or document section), the rule it violates, the issue, and a concrete fix. The PM addresses every CRITICAL and HIGH finding; MEDIUM findings are addressed at the PM's discretion.

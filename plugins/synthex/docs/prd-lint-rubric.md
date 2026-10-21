No-shell prose fallback for the PRD and epic-page structural audit, read when `command -v node` fails (the retired `prd-linter` Haiku sub-agent's rubric, now `plugins/synthex/scripts/lint-prd.mjs`). This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

Produce the same CRITICAL / HIGH / MEDIUM shape the script emits. Verdict: FAIL on any CRITICAL, WARN on HIGH without CRITICAL, PASS otherwise.

## Which rubric applies

`epic_page` for an epic row's own body (Notion only); `prd` for a Product Requirements Document.

## Epic page

| Check | Severity |
|-------|----------|
| `## Why this exists` present and non-empty | CRITICAL |
| `## Where the detail lives` present | CRITICAL |
| No status, date, count, task, or milestone outside `## Where the detail lives` | CRITICAL |
| The navigation block sits directly after `## Why this exists` | HIGH |
| It links the requirements page, the plan, and the work items | HIGH |
| Each link carries a current-state line | HIGH |
| The disclaimer is present **verbatim** | HIGH |
| `## Out of scope` present and non-empty | HIGH |
| `## How we'll know it worked` present | HIGH |
| `*Maintained by Synthex*` marker present | MEDIUM |
| No section beyond the standard five plus `Additional context` | MEDIUM |

The disclaimer, verbatim:

> This page is a summary, not the plan. For current status, follow the links above.

Flag volatile content with the offending text quoted and the artifact it belongs in — the plan for anything milestone- or task-shaped, the work items for anything status-shaped. **Report it; never move it yourself, and never delete it.**

## PRD

**Match sections by name, not by number.** The two shapes number differently — the filesystem shape keeps Vision, Out of Scope, and Success Metrics that the Notion shape moves to the epic page.

| Check | Severity |
|-------|----------|
| A `Functional Requirements` section with at least one `#### FR-` | CRITICAL |
| `# Product Requirements Document:` header present | HIGH |
| `**Epic:**` reference present, when an epic page holds the why | HIGH |
| A `Non-Functional Requirements` section present | HIGH |
| `Target Users / Personas` present under either shape | HIGH |
| Vision, Out of Scope, and Success Metrics all present, when there is **no** epic page | HIGH |
| None of those three present, when there **is** an epic page | MEDIUM |
| `Assumptions & Constraints` and `Open Questions` present | MEDIUM |
| `**Provenance:**` legend present | MEDIUM |
| Section numbers run contiguously from 1 | MEDIUM |
| A `Current and Target State` section present | MEDIUM |

When `Current and Target State` is present:

| Check | Severity |
|-------|----------|
| Both a today and an once-delivered diagram | HIGH |
| Each diagram is a fenced ```mermaid block | HIGH |
| The today diagram carries an italic basis line | HIGH |
| No milestone labels — sequencing is the plan's | HIGH |
| Node labels containing parentheses are quoted | HIGH |

## Every requirement

| Check | Severity |
|-------|----------|
| Carries one of `[S]` / `[U]` / `[D]` / `[A]` | CRITICAL |
| Has a `**Source:**` line | CRITICAL |
| No `[A]` survives, under the default blocking policy | CRITICAL |
| Carries exactly one tag | HIGH |
| `[S]` names a document **and** a location within it | HIGH |
| `[S]` names a document that appears in the supplied sources | HIGH |
| `[S]` does not cite a source that could not be read | HIGH |
| `[S]` citing a summarized source carries a verbatim excerpt | HIGH |
| Every `[A]` states its reasoning | HIGH |
| Has acceptance criteria, and they are specific | HIGH |
| No `FR-<id>` appears twice | HIGH |
| Requirement has a stable `FR-<id>` | MEDIUM |

## Source accounting

| Check | Severity |
|-------|----------|
| A `Source Map` section present when sources were supplied | HIGH |
| No Source Map entry cites an unsupplied document, **when its `Contributed` cell is filled** | HIGH |
| Every supplied source appears in the Source Map | MEDIUM |
| Every link in the PRD body is accounted for | MEDIUM |

**A `pending` cell is valid, never a finding.** The `Contributed` column is a closed vocabulary: `pending` (or empty) means a human queued that source and it has not been ingested; `none`, `declined`, `unreadable — <reason>`, and `self-reference — not ingested` are outcomes Synthex writes. A `pending` row is a standing instruction to `/synthex:refine-requirements`, not an incomplete table.

## What this rubric deliberately does not check

Say these were skipped rather than implying they passed:

- **Whether success measures are measurable.** "Users are happy" is not a metric, but deciding that is a semantic judgement.
- **Whether a reshaped epic page lost any claim from its prior content.** Requires comparing two prose documents for meaning. This is the highest-value omission, so `write-prd` keeps it as an instruction to the Product Manager instead.
- **Whether Out of Scope contradicts a requirement**, or success metrics relate to the vision.
- **Citation checks**, when no sources manifest was supplied.

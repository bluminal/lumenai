No-shell prose fallback for the PRD structural and provenance audit, read when `command -v node` fails (the rubric `plugins/synthex/scripts/lint-prd.mjs` enforces). This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

Produce the same CRITICAL / HIGH / MEDIUM shape the script emits. Verdict: FAIL on any CRITICAL, WARN on HIGH without CRITICAL, PASS otherwise.

## PRD

**Match sections by name, not by number.** The template invites adapting sections to the product, so a section's number is not its identity.

| Check | Severity |
|-------|----------|
| A `Functional Requirements` section with at least one `#### FR-` | CRITICAL |
| `# Product Requirements Document:` header present | HIGH |
| A `Non-Functional Requirements` section present | HIGH |
| `Target Users / Personas` present | HIGH |
| Vision, Out of Scope, and Success Metrics all present | HIGH |
| `Assumptions & Constraints` and `Open Questions` present | MEDIUM |
| `**Provenance:**` legend present | MEDIUM |
| Section numbers run contiguously from 1 | MEDIUM |

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

## Source accounting

| Check | Severity |
|-------|----------|
| A `Source Map` section present when sources were supplied | HIGH |
| No Source Map entry cites an unsupplied document, **when its `Contributed` cell is filled** | HIGH |
| Every supplied source appears in the Source Map | MEDIUM |
| Every link in the PRD body is accounted for | MEDIUM |

Report a source's accounting state as one of `yes`, `yes (no contribution)`, or `pending — awaiting ingest`. A pending row must appear in the report: it is in the Source Map but not in the supplied sources, and leaving it out of both is how a queued source becomes invisible.

**A `pending` cell is valid, never a finding.** The `Contributed` column is a closed vocabulary: `pending` (or empty) means a human queued that source and it has not been ingested; `none`, `declined`, `unreadable — <reason>`, and `self-reference — not ingested` are outcomes Synthex writes. A `pending` row is a standing instruction to `/synthex:refine-requirements`, not an incomplete table.

## What this rubric deliberately does not check

Say these were skipped rather than implying they passed:

- **Whether success measures are measurable.** "Users are happy" is not a metric, but deciding that is a semantic judgement.
- **Whether Out of Scope contradicts a requirement**, or success metrics relate to the vision.
- **Citation checks**, when no sources manifest was supplied.

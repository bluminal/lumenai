---
model: opus
---

# Refine Requirements

Improve a Product Requirements Document (PRD) by running it through a multi-agent review loop focused on clarity, completeness, and communicability — then updating the PRD directly with the improvements.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `--from <path>` | New source material to fold into the PRD. Repeatable. Accepts a file, a glob, a directory, a URL, or a Notion page URL. Same semantics as `/synthex:write-prd`'s flag. | — | No |
| `requirements_path` | Path to the PRD markdown file | `docs/reqs/main.md` | No |
| `specs_path` | Path to technical specifications directory | `docs/specs` | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |
| `--loop` | Enable native looping (FR-NL1/FR-NL2). When set, the command iterates per the "Native Looping" section below until the completion promise is emitted or `--max-iterations` is reached. | off | No |
| `--completion-promise <string>` | Promise text the agent emits as `<promise>X</promise>` to terminate the loop. | `ALLDONE<session_id>` (falls back to `ALLDONE<loop_id>`) | No |
| `--max-iterations <int>` | Iteration cap. Hard ceiling 200. | `20` | No |
| `--loop-isolated` | Fresh-subagent isolation mode per iteration. | off (shared-context default) | No |
| `--name <slug>` | User-supplied loop-id slug `^[a-z0-9][a-z0-9-]{0,63}$`. | auto: `<command-slug>-<4-char-hex>` | No |
| `--profile <economy\|balanced\|premium>` | Override `models.profile` for spawned reviewers (see Model Resolution). | `models.profile` config (`balanced`) | No |

### Model Resolution

Each spawned agent's model and effort resolve in this order: `--profile` flag > `models.agents.<name>` > `models.profile` delta > the agent's own frontmatter (FR-HM15, D29). On Claude Code, the resolved values are applied via the Agent tool's per-call `model` override; on every other host, `models`/`hosts.<harness>.models` are advisory only — applied where the host supports per-subagent model selection, otherwise ignored. Standing-pool routing is unaffected: pools never re-spawn, so a profile change reaches only newly spawned agents.

## Core Responsibilities

You orchestrate the refinement of a PRD through:
1. Having specialist sub-agents review the PRD for clarity and completeness
2. Collecting their questions and concerns
3. Answering questions you can answer from context, and escalating to the user for the rest
4. Updating the PRD to address all findings

This command does NOT produce an implementation plan. It improves the PRD so that downstream agents (and humans) can understand it without ambiguity.

---

## Document Backend

**When `notion.enabled` is `false` — the default — skip this section entirely** and resolve `requirements_path` directly against the filesystem exactly as the Workflow below describes. The disabled path must stay byte-identical to pre-Notion behavior (FR-NB2), and the surest way to guarantee that is to run no new logic at all.

Otherwise Read `${CLAUDE_PLUGIN_ROOT}/docs/document-backends.md` and follow it, including the `refine-requirements` section for this command's specifics. On other hosts, resolve the plugin root from `.synthex/state.json`'s `plugin_root` field and read the same file relative to it.

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
- If the host did not already inject the project instruction file into your context, Read the first of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.hermes.md` that exists at the repository root.
- Check `package.json` or equivalent for current tech stack
- Understand the current state of the codebase (what already exists)

This context is critical — it lets you answer reviewer questions without bothering the user when the answers are already documented.

### 3.5. Ingest New Sources

**Skip this step entirely when there is nothing to ingest** — no `--from` was supplied and the Source Map holds no pending entry. That is the ordinary refinement run, and it must behave exactly as it did before this step existed.

Amendment runs **before** the review loop, so reviewers see the amended document and the loop becomes the thing that makes the amendment safe.

#### 3.5a. Collect the pending set

Two inputs, combined:

- Everything supplied via `--from` on this invocation.
- Every Source Map row whose `Contributed` cell reads `pending`. **Pending rows are the `--from` list when no `--from` was given** — a human pasting a link into the Source Map is leaving a standing instruction, and that is the whole mechanism.

**Find the Source Map by name, never by number.** It is `## 10.` under the filesystem shape and `## 7.` under the Notion shape.

**Dedupe on resolved identity.** A `--from` path that already has a pending row fills that row rather than adding a second. The same URL pasted in two forms is one source.

#### 3.5b. The `Contributed` column is a closed vocabulary

| Value | Meaning | Written by |
|-------|---------|------------|
| `pending` *(or an empty cell)* | Not yet ingested | **A human — the only state a human writes** |
| `FR-3, FR-9` | Ingested; contributed these | You |
| `none` | Ingested; contributed nothing | You |
| `declined` | Candidates presented; all rejected | You |
| `unreadable — <reason>` | Attempted; could not be read | You |
| `self-reference — not ingested` | Rejected as circular | You |

`pending` is canonical; treat a blank or whitespace-only cell as the same thing.

**Never leave a cell blank after a run.** Blank means pending, so a source that was read and yielded nothing would be re-ingested on the next run — and a conversational source would ask a human to re-confirm candidates they already declined.

#### 3.5c. Reject self-reference

**A document cannot be its own source.** Reject any entry resolving to the PRD being amended, to this initiative's epic page, implementation plan, or retrospectives, or to a glob that expands to include them. Mark the cell `self-reference — not ingested` and say why.

Ingesting a PRD into itself converts every `[A]` it holds into an `[S]`. That is provenance laundering, and it passes every other check in the rubric.

**Compare resolved identities, not typed strings.** A self-reference may arrive as a relative path, an absolute path, a Notion page URL, a Notion page id, or a directory containing the document.

#### 3.5d. Classify each source, then confirm before fetching

Each source is **authoritative** (a specification, an ADR, a prior PRD — a record of something decided) or **conversational** (a transcript, meeting notes, a chat log — a record of something discussed).

**Default to conversational.** Where the kind is not evident, treat it as conversational and ask. Misclassifying a specification costs one confirmation step; misclassifying a transcript costs a requirement nobody agreed to.

**A source cannot classify itself.** Propose a classification per entry and let the user correct it before anything is read for requirements.

**Name the fetches before performing them.** List what will be read and confirm. Under the `notion` backend the PRD page is editable by the whole workspace, so a pending row is not necessarily something the person running this command put there.

#### 3.5e. Assemble

Run `plugins/synthex/scripts/assemble-bundle.sh assemble` (resolved from the installed plugin root — Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/assemble-bundle.sh" assemble --source <path>...`) as ONE Bash call. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

Pass `--source <path>` per collected entry. The script applies the byte caps, routes anything oversized to `needs_summary[]` without reading it, and returns the bundle path; summarize those entries yourself. Its `sources[]` manifest records what was read, what was summarized, and **what could not be read, with a reason** — the one category whose failures it records rather than skipping.

**Promote the pending entries into `sources` before assembling.** By lint time every ingested row is then genuinely a supplied source, and `prd-linter`'s fabricated-citation check holds unchanged rather than needing to be weakened.

**Technical context is not source material.** Step 3 reads specs, `CLAUDE.md`, and `package.json` to answer reviewer questions. Those do not enter the Source Map and are not ingested here.

**A pending entry that cannot be read does not block the run.** Write `unreadable — <reason>` into its cell, leave the row where it is, and report it. Do not delete the row — it is the human's record of intent. Do not infer content from the URL, the page title, or the meeting name: a Source Map row naming a document nobody could open is a weaker claim than no row at all.

**When network egress is denied, say so once.** Every URL fails identically under the sandbox, and a per-row "check your share link" message buries the real cause. Leave those rows `pending` rather than `unreadable` — they were never attempted, and `unreadable` would stop the next run retrying.

**Say which entries arrived summarized**, before the confirmation pass. A user who learns their 90-minute transcript was compressed may prefer to amend one source at a time.

#### 3.5f. Apply authoritative sources, then confirm conversational candidates

**Authoritative first.** A candidate the user is asked to confirm must be shown against the PRD as it *will* stand, not as it stood before the run — otherwise a specification silently overwrites something they just confirmed.

**Conversational sources produce candidates, never requirements.** Present them as one reviewable list with the location each came from, and let the user strike what was not decided:

```
From the Oct 8 sync, 4 candidates:
  1. Bulk export    [12:04 Dana]
  2. SSO by Q1      [23:51 Raj]
  3. Drop the CSV   [31:02 Dana]   <- contradicts FR-7
  4. Rate limiting  [44:17 Raj]

Strike what wasn't decided.
```

**One confirmation pass per run**, with candidates grouped by the requirement they touch rather than the source they came from. Two transcripts describing one decision produce one question carrying both citations; asking twice invites two different answers.

**A confirmed candidate is `[U]`, never `[S]`** — see `product-manager.md`, Provenance Tagging. The transcript is where it was said; the confirmation is what made it a requirement.

**A candidate declined because the answer is unsettled goes to Open Questions.** One declined silently will be raised again by the next source that mentions it. A candidate declined as noise needs no record.

#### 3.5g. Apply, atomically

**FR ids append; they are never renumbered.** A new requirement takes the next unused id. Implementation plans and work items cite these ids, and renumbering silently repoints every one of them.

**There is no partial ingestion.** The confirmation pass either completes — every candidate accepted or rejected — or it is abandoned and nothing is written. A `Contributed` cell cannot say "three of seven," and inventing a way for it to say that would make every later run reconstruct which three.

**One write, at the end**, carrying both the requirement changes and the `Contributed` cell updates. Under the `notion` backend that is a single `patch` with several edits, not several patches. A run that adds requirements and leaves the entry `pending` will add them again on the next run.

### 4. PRD Review Loop

This is the core quality mechanism. The PRD is reviewed by specialist sub-agents who identify areas that are unclear, incomplete, or ambiguous from their perspective.

**Reviewers must leave pending Source Map entries alone.** A row whose `Contributed` cell reads `pending` is a standing instruction, not an incomplete table. Do not fill it with a plausible contribution, do not delete the row, and do not raise it as a finding. This breaks silently and is near-impossible to diagnose afterwards, because the evidence that a source was ever queued is the row itself.

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

**Lint before writing.** Run `plugins/synthex/scripts/lint-prd.mjs` (resolved from the installed plugin root — Claude Code: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lint-prd.mjs" "@{requirements_path}" --sources <bundle_path>`) as ONE Bash call, guarded with `command -v node`. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from. Without node, Read `${CLAUDE_PLUGIN_ROOT}/docs/prd-lint-rubric.md` and self-check by hand, producing the same CRITICAL/HIGH/MEDIUM shape.

This command changes requirements — in the triage step as well as on an amendment — and until now nothing checked that the result still carried honest provenance.

**An amendment is linted whole, but only its own findings block it.** Report findings across the document, because a reader needs the full picture, but require resolution only of findings on requirements this run introduced or changed. A pre-existing unconfirmed assumption is a reason to keep refining, not a reason to block a pasted link from being ingested — and blocking on it pushes toward "resolving" an old `[A]` by inventing a confirmation. Say which findings were pre-existing rather than letting them pass unmentioned.

Write the refined PRD back to `@{requirements_path}`.

Preserve the existing PRD structure and style. Do not reorganize or reformat sections that weren't affected by findings. The changes should feel like natural improvements to the existing document, not a rewrite.

### 6. Summary

When sources were ingested, lead with the amendment delta — it is what tells a user their paste worked:

```
Amended from 2 sources
  oct-8-sync.md (conversation)  4 candidates -> 3 confirmed -> FR-23, FR-24, FR-25
  billing-spec.md (authoritative)                              FR-26
  granola.ai/...  unreadable - 403, still listed, not ingested
```

Then output a brief summary to the user:
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

**Loop engine (FR-HM19, D34):** when `--loop` is set, before the first iteration run `bash <plugin-root>/scripts/lib/config-get.sh native_looping.engine prose`; if it prints exactly `workflow`, `--loop-isolated` is not set, and a `Workflow` tool is in your tool list, Read `${CLAUDE_PLUGIN_ROOT}/docs/engines/loop-workflow.md` and follow it (this instruction is the `Workflow` opt-in, D31); otherwise follow this command's Stage 1 loop prose unchanged, never a host feature named Workflow. `<plugin-root>` is the installed plugin root (other hosts: `plugin_root` in `.synthex/state.json`).

### Emission Point

Emit `<promise>{completion_promise}</promise>` (the resolved `completion_promise`) in the iteration's final response when ALL of the following hold:

- The PRD's `Open Questions` section is empty (or every question is annotated `Resolved` with the resolution recorded).
- No ambiguity markers (`?`, `TBD`, `unclear`, `to-be-decided`) remain in the Vision, Users, Scope, Success Criteria, or Constraints sections.
- The PRD is structurally complete: every required section is populated; section summaries are coherent.
- A follow-up iteration would not add new clarifying questions (the agent's judgment — typically when the previous iteration's questions have all been answered and no new ambiguities surfaced).

Do NOT emit the promise while the agent is still asking the user clarifying questions or while answers are pending. Native looping does NOT bypass `[H]` user-input gates — the loop simply re-runs `refine-requirements` until the PRD stabilizes.

### Iteration Body

When `--loop` is set, this workflow runs once per iteration, gated by ONE Bash call: `loop-step.sh advance <loop-id>` (FR-HM18 durability boundary; non-zero exit means stop). See [`shared-iter`](../docs/native-looping.md#shared-iter) / [`subagent-iter`](../docs/native-looping.md#subagent-iter) (`--loop-isolated`) for the call and cross-host resolution. On promise match run `loop-step.sh finish <loop-id> completed`; else loop back. State: `.synthex/loops/<loop-id>.json` ([FR-NL8](../docs/native-looping.md#state)); auto-compaction-safe since state and output live on disk.

The iteration marker (`[loop <loop-id> iteration <N>/<max>]`) prints to stdout before each iteration's workflow runs. See [`markers`](../docs/native-looping.md#markers).

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

# Document Backends — Shared Resolution Mechanics

> The mechanical framework every document-centric Synthex command uses to resolve, read, and write its documents. It lives here once so the filesystem-vs-Notion branch is stated in a single place instead of being re-derived in each command. Commands inline only their own command-specific bits and link here for the rest.
>
> The normative contract this implements is [`../agents/_shared/document-store-contract.md`](../agents/_shared/document-store-contract.md). Where this document and the contract disagree, the contract wins.

## Status: Reference

---

## 1. When this applies

Any command that reads or writes a Synthex artifact — a PRD, an implementation plan, an ADR, an RFC, a runbook, a retrospective, or implementation-plan task state.

If `notion.enabled` is `false` (the default), **skip this entire document**. Resolve `@{path}` parameters directly against the filesystem exactly as before. This is the FR-NB2 regression contract: the disabled path must behave byte-identically to pre-Notion Synthex, and the cheapest way to guarantee that is to not run any new logic at all.

---

## 2. Resolve the backend

For the document type you are about to touch, resolve its backend. First match wins:

1. `documents.backend_overrides.<doc_type>`
2. `documents.backend`
3. `filesystem`

Document types are the keys of the `documents` config block: `requirements`, `implementation_plan`, `specs`, `decisions`, `rfcs`, `runbooks`, `retros`.

**Guard:** if the resolved backend is `notion` but `notion.enabled` is `false`, that is a configuration error. Report it and fall back to `filesystem`:

> `Config names the notion backend for <doc_type>, but notion.enabled is false. Using local markdown. Run /synthex:configure-notion to enable it.`

Do not treat a named backend as an implicit opt-in — the master switch is the consent signal.

---

## 3. Dispatch

### Backend `filesystem`

Resolve the document type to its configured path and use the Read / Write / Edit tools directly, as commands have always done. Nothing else in this document applies.

### Backend `notion`

Delegate. Do not call Notion MCP tools inline from a command.

| What you need | Delegate to |
|---------------|-------------|
| Prose documents — PRDs, plan overviews, ADRs, RFCs, runbooks, retros | `notion-document-store` |
| Implementation-plan task state — the queue, status writes, criteria evidence | `notion-task-store` |

Both are Haiku-backed, which is the point: a command running on Opus should not spend its tokens on property mapping and page fetches. Pass the operation, the document type, and the resolved `notion` config block. Each returns the contract's §7 response envelope.

---

## 4. Handle the response

On `status: "success"`, use `result` and continue.

On `status: "failed"`, apply the degradation policy:

- **`notion.strict_mode: false`** (default) — fall back to the `filesystem` backend for this document type and carry on. Surface a one-line warning naming the error code and the document type:

  > `Notion unavailable for <doc_type> (<error_code>). Using local markdown instead.`

- **`notion.strict_mode: true`** — abort the command, reporting the error code and the affected document type. Do not fall back.

Two cases override the above:

1. **`mcp_unavailable` for every document type** — emit one remediation message, not one per type:

   > `The Notion backend is configured but the Notion MCP server isn't available in this session. Using local markdown for everything. Run /synthex:configure-notion to reconfigure.`

2. **A epic-scoping failure** (`schema_mismatch` from `notion-task-store` Step 1) — never falls back to an unscoped query. Report it and stop touching tasks. Documents may still proceed.

**Always surface a degradation.** A run that silently fell back to local markdown looks identical to a healthy Notion run until someone wonders why Notion is stale. The envelope's `degraded_from` field exists for exactly this.

---

## 5. The epic reference — resolve it once, use it twice

Under the `notion` backend the epic reference does two jobs, and both happen before you touch anything:

- it **anchors epic-scoped documents**, because the initiative's own page holds its PRD, plan, and retrospectives as subpages;
- it **scopes task queries**, because the work items relate to that same page.

Resolving it once and using it for both is what keeps documents and tasks from disagreeing about which initiative a run is operating on.

### Step A — read the plan and take its reference

The epic **property** comes from `notion.epic.property`. The **value** comes from the plan, because a repository usually has several initiatives in flight and one configured value would make their rows indistinguishable.

Take it in this order:

1. The plan's `**Epic:**` line, immediately beneath its H1 — **authoritative**
2. `notion.epic.value` — a default for plans that do not declare one
3. Neither → report `schema_mismatch` and do **not** touch documents or tasks

```markdown
# Implementation Plan: Billing Migration

**Epic:** [Billing Migration](https://www.notion.so/<epic-row-id>)
```

The link form carries a label for people and an id for the filter, in one line.

### Step B — resolve it to a page id

If the scoping property is a `relation`, the filter needs a page **UUID** — Notion cannot filter a relation by page name. Extract the id from the markdown link, a bare URL, or a bare UUID. A plain name resolves only by a unique exact title match in `notion.epics_database`; anything else is `schema_mismatch`.

If the property is a `select`, `status`, or text type, the value is used as-is and there is no page to resolve — which also means **epic-scoped document anchoring is unavailable**, and those types fall back to `docs_root` or the filesystem. Anchoring needs a page; a tag is not a page.

### Step C — pass it to both adapters

| Adapter | Field | Value |
|---------|-------|-------|
| `notion-document-store` | `epic_page` | the resolved page id (epic-scoped types need it) |
| `notion-task-store` | `epic` | `{ property, value }` with the resolved value |

Neither adapter reads plan documents. Resolution is the caller's job, which is what makes it impossible to query task rows without having first read the plan those rows belong to — no flag to forget, no config entry to drift.

**When a plan declares a value, it wins, even if config names a different one.** Config is a default, not an override. If the two differ, mention it once in your output so the discrepancy is visible, then proceed with the plan's value.

**Never invent a value.** Not from the plan's title, not from the filename, not from the branch. A derived value that matches nothing silently returns an empty queue, which looks exactly like "all work complete." Missing means `schema_mismatch`.

### Step D — assignee scoping comes for free

When `notion.assignee.property` is set, the task store additionally scopes to work you may take — assigned to you, or unassigned — and claims an item by assigning it to you when it moves to `in_progress`. You do not pass an identity; it resolves the current user from Notion itself.

This matters when several engineers share one epic. Without it, two of them running `next-priority` on the same initiative can select the same item.

### Other task specifics

- **Status vocabulary.** Work in the canonical enum — `pending`, `in_progress`, `done`, `blocked`. The adapter translates to and from the workspace's own option names. Never write a workspace-specific label like `"Shipped"` across the contract boundary.
- **Identity.** A task's identity is its `task_ref`, which is opaque. `ordinal` is display-only and gets renumbered whenever tasks are inserted or removed. Never look a task up by ordinal and never treat a renumber as re-identifying a task.
- **Prose vs. rows.** Under the `notion` backend an implementation plan is two things: an overview page holding the prose sections (Overview, Decisions, Open Questions, milestone summaries) and a set of task rows in the task database. Read and write each through the matching adapter.
- **Degraded fields.** When the target database has no home for `complexity`, `milestone`, or `dependencies`, the adapter reports a degradation and that data belongs in the overview page instead. Honor that — do not invent a property to hold it.

---

## 6. What not to do

- **Do not call Notion MCP tools directly from a command.** Delegate, so the mapping and scoping rules live in one place and are tested in one place.
- **Do not create documents as a side effect of reading one.** Creation is an explicit operation.
- **Do not prompt the user from inside a resolution failure.** Report and degrade, or abort under strict mode. Configuration belongs to `/synthex:configure-notion`.
- **Do not write a full-document `write` when a section-scoped `patch` would do.** A human may be editing another part of the same page.
- **Do not add new error codes.** The enum in §6 of the contract is closed.

---

## Source Authority

- [`../agents/_shared/document-store-contract.md`](../agents/_shared/document-store-contract.md) — the normative contract
- FR-NB1 (backend resolution), FR-NB2 (regression contract), FR-NB9 (error enum and degradation)

## Used by

`write-implementation-plan`, `refine-requirements`, `next-priority`, `write-adr`, `write-rfc`, `retrospective`, `reliability-review`

---

## Per-command specifics

Each document command Read-gates this file; the stanza for the command you are running is below.

### next-priority

This command reads the implementation plan's task queue and writes task state back. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `implementation_plan` (read and write, including task state)



**Active-epic fallback.** When no explicit path argument is given, resolve in this order: explicit argument → `.synthex/active-epic.json` → `documents.*` from config. Under the `notion` backend with more than one epic available, **stop** rather than falling through to config — defaulting to `main.md` on a multi-epic project is how someone operates on another initiative. Name the epic in your first line of output so a run is never ambiguous about which initiative it touched. See [`use-epic.md`](./use-epic.md).

**Command-specific notes**

- **Resolve the epic reference from the plan first.** Read the plan, take its `**Epic:**` line (falling back to `notion.epic.value`, and reporting `schema_mismatch` if neither exists), resolve it to an epic page id, and pass it to every task-store call. This is what keeps a run scoped to the epic you invoked it on: with several initiatives in one repository, a configured value alone would return another epic's tasks and the plan-complete check would never fire. See [`document-backends.md`](../docs/document-backends.md) §5.
- **Work is additionally scoped to what you may take.** When `notion.assignee.property` is set, the task store returns only items assigned to the current user or unassigned, and claims an item by assigning it to that user when Step 3 moves it to `in_progress`. Two consequences for this command:
  - **Another engineer's in-flight work never enters your queue**, so two engineers can run this command against the same epic concurrently without selecting the same item.
  - **"No actionable tasks" can mean "all remaining work is claimed by someone else."** That is a normal outcome, not a completion. Do not emit the completion promise; report what remains and who holds it, exactly as with blocked or `[H]`-gated tasks.
- This is the one command that mutates task state, so it is the one most affected by the backend. Under `notion`, delegate every task read and write to `notion-task-store`:

  | Workflow step | Task-store operation |
  |---------------|---------------------|
  | Step 1 — select work | `list_tasks` (epic-filtered) |
  | Step 3 — mark in progress | `update_task_status` with `in_progress` |
  | Step 9 — mark done | `update_task_status` with `done`, then `annotate_task` |
  | Error handling — blocker | `update_task_status` with `blocked` |

- **The plan-complete check in Step 1 uses the epic-filtered queue.** `list_tasks` returns only this project's rows, so "every task is `done`" means every Synthex task in this epic, not every row in a shared database. That is the intended semantics — other teams' tickets are none of this command's business and must never gate its completion.
- **Never resolve a task by ordinal.** Use the `task_ref` returned by `list_tasks`. Ordinals are display-only and get renumbered when tasks are inserted or removed; treating one as identity would silently retarget a write to the wrong row.
- Acceptance-criteria evidence from Step 9 — `[T]` test linkage, `[H]` approval, and the `--auto-decide` decision record — goes through `annotate_task`. When `acceptance_criteria` is unmapped, the adapter records it in the task page body.
- **Refresh the epic's navigation block once, at the end of the run.** The epic page carries a `## Where the detail lives` section listing the requirements page, the plan, and the work-item view, each with a current-state line. Rewrite that section via `notion-document-store` `patch` on the `epic_page` document type, updating the phase, the done/total task counts, the in-progress and to-do counts, and the dates.

  This is the one volatile thing in an epic body, and it is Synthex's to maintain. It exists because a stakeholder once read a detailed-but-stale epic as the live plan; the freshness line is what makes staleness visible instead of invisible. Keeping it current is therefore not cosmetic.

  **Once per run, not per task.** A write on every status transition would churn the page history for no added signal. Update after the batch completes, including when the run ends with tasks still open — a partially-finished run is exactly when someone is most likely to go looking.

  Use `patch`, never `write`: the rest of the body is the team's.

  **When the section does not exist**, which is the case for any epic that has not been through `/synthex:write-prd`, do not inject it. Insert it only when the body is already in standard epic-page shape — directly after `## Why this exists`. Otherwise report once and move on:

  > `This epic's body isn't in standard epic-page shape, so there's no navigation block to refresh. Run /synthex:write-prd --epic-only to standardize it.`

  Restructuring a free-form epic body is a decision for `write-prd`, where the user is present to approve the mapping. Silently reshaping someone's page mid-run is exactly the failure the refine-don't-discard rule exists to prevent, and a task-execution command is the wrong place to make that call.

### refine-requirements

This command reads and rewrites a PRD. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `requirements` (read and write)



**Active-epic fallback.** When no explicit path argument is given, resolve in this order: explicit argument → `.synthex/active-epic.json` → `documents.*` from config. Under the `notion` backend with more than one epic available, **stop** rather than falling through to config — defaulting to `main.md` on a multi-epic project is how someone operates on another initiative. Name the epic in your first line of output so a run is never ambiguous about which initiative it touched. See [`use-epic.md`](./use-epic.md).

**Command-specific notes**

- This command rewrites an existing document in place, so prefer a section-scoped `patch` over a full-document `write`. A stakeholder may be reading or commenting on another section of the same Notion page while this runs.
- Reviewer sub-agents receive the PRD **content**, not a path. They are unaffected by which backend supplied it.
- **An amendment patches; it never writes.** Replace only the rows and requirement blocks that changed. A PRD that accepts pending Source Map entries is a document a human edits between runs — the same property that makes the epic page a `patch`-only target.
- **Supply `version` on an amend write.** The person who pasted the pending link seconds ago is the most likely person to still be in the page. On `conflict`, re-read, re-derive the pending set, and re-apply — but **do not re-run the confirmation pass**; a second answer may differ from the first.

### write-implementation-plan

**If the PRD's Source Map holds a row whose `Contributed` cell reads `pending`**, name it and say that `/synthex:refine-requirements` folds pending sources in — planning from a PRD that is knowingly missing information is worth one sentence of warning. Do not ingest it here; this command has no source-ingestion path and should not grow one.

This command a PRD and writes an implementation plan. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `requirements` (read), `specs` (read), `implementation_plan` (write)



**Active-epic fallback.** When no explicit path argument is given, resolve in this order: explicit argument → `.synthex/active-epic.json` → `documents.*` from config. Under the `notion` backend with more than one epic available, **stop** rather than falling through to config — defaulting to `main.md` on a multi-epic project is how someone operates on another initiative. Name the epic in your first line of output so a run is never ambiguous about which initiative it touched. See [`use-epic.md`](./use-epic.md).

**Command-specific notes**

- Under the `notion` backend the finished plan is written as two things, not one: the prose sections (Overview, Decisions, Open Questions, milestone summaries) go to the plan page via `notion-document-store`, and each task becomes a row in the work database via `notion-task-store`, linked to the epic. Step 7 below writes both.
- **The plan page is a subpage of its epic.** When the epic property is a relation to an epics database, the plan is created beneath that epic's own row — so anyone opening the epic finds its requirements, plan, and work items together. Resolve the epic from **the PRD's** `**Epic:**` link — the PRD is this command's input, and `write-prd` recorded it there precisely so this command need not ask again. Without an anchor `notion-document-store` returns `schema_mismatch` rather than filing the plan somewhere arbitrary.
- **New task rows are created unassigned.** A planned task is available work. Engineers claim items as they start them, which is how concurrent work on one epic stays collision-free.
- **Link each task row back into the plan table.** `create_tasks` returns a `task_ref` per row; render each task's **Task cell as a markdown link** to its work item:

  ```markdown
  | # | Task | Complexity | Dependencies | Status |
  |---|------|-----------|--------------|--------|
  | 1 | [Add rate limiting middleware](https://www.notion.so/<row-id>) | M | None | pending |
  ```

  **Link the title; do not add a column.** The header `| # | Task | Complexity | Dependencies | Status |` is pinned as CRITICAL by `plan-linter`, appears in both plan templates, and is asserted by `tests/schemas/implementation-plan.test.ts` and by the pre-change baseline in `tests/schemas/notion-baseline-snapshots.test.ts`. A new column would require editing that baseline, which would both defeat its purpose and mean the disabled path's output changed — an FR-NB2 violation. Linking the title changes no header.

  It also degrades correctly: with no Notion backend there are no work items, so the cell stays plain text and the filesystem plan is byte-identical to before. And it leaves dependency references alone, since those cite ordinals (`Task 1`) rather than titles.

  **Create the rows before writing the final plan**, so the links are present in the single write rather than requiring a follow-up patch to a document you just produced.
- **Copy the epic reference onto the plan.** Every plan records the initiative it belongs to beneath its H1. Take it from the PRD's `**Epic:**` link rather than asking the user — re-asking something already recorded is how two artifacts end up pointing at different epics. Write it as a markdown link so the line carries both a human label and the page id the relation filter needs:

  ```markdown
  **Epic:** [Billing Migration](https://www.notion.so/<epic-row-id>)
  ```

  Ask the user only when the PRD has no `**Epic:**` link — for a PRD written before this convention, or on a plan with no PRD. Then search the epics database by title and let them pick. Do not create an epic row unless the user asks — an epics row usually carries owner, dates, and business context that this command has no basis to fill in. Do not derive a value from a filename or branch: one matching no rows yields an empty task queue that reads as "all work complete." For a `select` or text epic property, a plain name is correct and no link is needed.
- Create task rows with the canonical status `pending`, stamped with that epic value. The adapter translates the status to whatever the target database calls it.
- When the task database has no property mapped for `complexity`, `milestone`, or `dependencies`, the adapter reports a degradation and that data belongs in the overview page instead. Keep it in the plan prose rather than inventing a property for it.
- The `plan-linter` structural audit in Step 5.5 runs against the **draft markdown**, before any backend write. It is unaffected by this section.

### write-adr

This command writes an Architecture Decision Record. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `decisions` (write)



**Command-specific notes**

- Each ADR is a new document, so use `create` rather than `write`. Never overwrite an existing ADR page — superseding an ADR means writing a new one that references the old, exactly as on the filesystem.
- ADRs are read by the `architect` agent and by `review-code`'s spec-compliance check on every invocation. Teams that care about review latency usually leave `decisions` on the filesystem; that is a legitimate choice and this command works either way.

### write-rfc

This command writes a Request for Comments. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `rfcs` (write)



**Command-specific notes**

- Each RFC is a new document, so use `create` rather than `write`.
- RFCs exist to be commented on, which makes them one of the better fits for the Notion backend: Notion's native comments give reviewers a place to respond that a markdown file in a repo does not.

### retrospective

This command reads the implementation plan and writes a retrospective document. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `implementation_plan` (read), `retros` (read prior, write new)



**Active-epic fallback.** When no explicit path argument is given, resolve in this order: explicit argument → `.synthex/active-epic.json` → `documents.*` from config. Under the `notion` backend with more than one epic available, **stop** rather than falling through to config — defaulting to `main.md` on a multi-epic project is how someone operates on another initiative. Name the epic in your first line of output so a run is never ambiguous about which initiative it touched. See [`use-epic.md`](./use-epic.md).

**Command-specific notes**

- Step 4 reads the **previous** retrospective to compute follow-through. Under the `notion` backend use `list` on the `retros` type and pick the most recent; do not assume filesystem directory ordering. Retrospectives are epic-scoped, so `list` returns those belonging to this initiative only — a prior retro from another epic must not feed this cycle's follow-through rate.
- Step 6 creates a new document, so use `create`. Under the `notion` backend it becomes a dated subpage of the epic (`Retrospective <YYYY-MM-DD>`), alongside that initiative's requirements and plan. Prior retrospectives are read-only — never modify one.
- Step 3's planned-vs-actual analysis needs task state. When `implementation_plan` resolves to `notion`, resolve the epic value from the plan's `**Epic:**` line first, then read task state via `notion-task-store` `list_tasks` so the analysis covers that initiative's rows only. A retrospective that silently folded in another epic's tasks would misreport this cycle's planned-vs-actual.

### reliability-review

This command reads SLO definitions and runbooks. When the Notion backend is enabled for those document types, resolve them through the document-store contract rather than reading the path parameters directly. The mechanical framework — backend resolution order, delegation to `notion-document-store` and `notion-task-store`, response handling, and the strict-mode vs. fail-soft degradation policy — lives once in [`plugins/synthex/docs/document-backends.md`](../docs/document-backends.md). Only the command-specific bits are inlined below.

**Document types touched:** `specs` (read), `runbooks` (read)



**Command-specific notes**

- This command is read-only with respect to documents, so the degradation path is cheap: if Notion is unavailable, falling back to local markdown costs nothing but freshness.
- A missing SLO document is already a normal, handled outcome for this command. Treat `target_not_found` the same way you treat an absent file — report the gap in the review, do not fail the command.

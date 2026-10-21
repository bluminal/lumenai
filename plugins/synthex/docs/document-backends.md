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

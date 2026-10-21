## Status: Final

# Architecture — Notion Document & Task Backend

> How the Notion backend is layered, what each piece owns, and why the seams fall where they do.

## Related Documentation

- [`../../reqs/notion-backend.md`](../../reqs/notion-backend.md) — the PRD (FR-NB1–FR-NB9, NFR-NB1–NFR-NB4)
- [`../../../plugins/synthex/agents/_shared/document-store-contract.md`](../../../plugins/synthex/agents/_shared/document-store-contract.md) — the normative contract
- [`../../../plugins/synthex/docs/document-backends.md`](../../../plugins/synthex/docs/document-backends.md) — shared resolution mechanics commands follow
- [`./setup.md`](./setup.md) — user-facing setup guide

---

## 1. Overview

Before this feature, every document-centric command named a filesystem path and used Read/Write/Edit on it directly. There was no indirection of any kind — nine commands each hardcoded their own paths, and every task-state mutation was prose telling an LLM to rewrite a markdown table cell.

The backend introduces exactly one seam: a **document store contract** that commands speak instead of naming paths. Two backends implement it. Everything else follows from that.

```
      command  (write-implementation-plan, next-priority, retrospective, …)
         │
         │  resolves backend per document type  (FR-NB1)
         ▼
   ┌─────────────────────────────────┐
   │   document store contract       │   ← the only seam
   └────────────┬───────────┬────────┘
                │           │
       filesystem           notion
       (default)              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       notion-document-store       notion-task-store
       (prose: pages)              (tasks: database rows)
                 │                         │
                 └──────────┬──────────────┘
                            ▼
                      Notion MCP server
```

The `filesystem` backend is not an implementation so much as the absence of one: it is the existing inline Read/Write/Edit behavior, preserved unchanged as the fallthrough. This is deliberate — see §3.

On the Notion side, the workspace is two related databases rather than one, and that shape drives the rest of the design:

```
  Epics DB
    ▸ Billing Migration                (row = page)
        ├─ Product Requirements        (subpage)
        ├─ Implementation Plan         (subpage)
        ├─ Retrospective 2026-09-22    (subpage)
        │
  Work DB │
    ├─ Add rate limiting     ──relation──┘   assignee: unassigned
    ├─ Migrate invoice job   ──relation──┘   assignee: me
    └─ Backfill ledger       ──relation──┘   assignee: someone else   ← never touched
```

Because every row of a Notion database is itself a page, the epic row anchors both halves: its documents hang beneath it as subpages, and its work items relate to it. One reference resolves both.

---

## 2. Why the seam is a contract, not a library

Synthex agents and commands are pure markdown with zero runtime code. There is no place to put a `DocumentStore` class, and adding one would mean introducing a runtime dependency to a plugin whose entire distribution model is "markdown files a harness reads."

So the abstraction is a **normative document** describing operations, an envelope, and a closed error enum — enforced not by a type system but by Layer 1 tests that assert the markdown says what it must. This is the same technique the repository already uses for the multi-model review adapter contract and the canonical finding schema, and it works for the same reason: the enforcement lives in the test suite rather than in a compiler.

The practical consequence is that the contract document *is* the implementation surface. Changing behavior means changing that document, and the tests fail if an adapter drifts from it.

---

## 3. Why the disabled path runs no new code

FR-NB2 promises byte-identical behavior when the feature is off. There are two ways to deliver that: implement the filesystem backend faithfully and trust it, or skip the new machinery entirely when the feature is disabled.

The second is chosen. Commands check `notion.enabled` first and, when false, resolve `@{path}` parameters exactly as before — no backend resolution, no adapter delegation, no envelope handling. `plugins/synthex/docs/document-backends.md` opens by telling the reader to skip the entire document in that case.

This makes the regression contract cheap to honor and cheap to verify: the disabled path cannot regress from a bug in code it never executes. The pre-refactor baselines in `tests/__snapshots__/notion-backend/baseline/` exist to catch the one remaining risk — that someone restructures a command's workflow while wiring the enabled path.

---

## 4. Two adapters, not one

Prose documents and task rows are different enough to warrant separate agents.

| | `notion-document-store` | `notion-task-store` |
|---|---|---|
| Notion primitive | pages | database rows |
| Operations | resolve, read, write, patch, create, list | list_tasks, create_tasks, update_task_status, annotate_task |
| Content shape | markdown in, markdown out | canonical task objects |
| Scoping | rooted under `docs_root` | **epic-filtered** (FR-NB4) |
| Schema concerns | none | property mapping and degradation (FR-NB5) |
| Risk profile | adds pages to a page tree | writes into a live shared board |

The task store carries nearly all the danger in this feature, and separating it means its scoping and mapping rules live in one file with their own test suites rather than being conditionals inside a general-purpose adapter.

Both run on Haiku. A command orchestrating on Opus should not spend its tokens fetching pages and mapping property names — the same reasoning that produced the existing `*-review-prompter` and the Product Manager (editing the plan in place) utility agents.

---

## 5. Epic scoping as a structural guarantee

The central safety problem: Synthex writes into a database it does not own, holding rows it must not touch.

Scoping is enforced at three points, and the redundancy is intentional:

1. **Preflight** (`notion-task-store` Step 1) — verify the property exists in the live schema, supports equality filtering, and has a configured value. Failing this is terminal.
2. **Read** — every query filters on the epic property. There is no unfiltered query path.
3. **Write** — every mutation re-reads the target row and confirms its epic value before writing, failing `permission_denied` otherwise.

Step 3 is what makes the guarantee true for writes rather than merely for reads. A filter protects a query; only a pre-write check protects an update against a stale or hand-supplied `task_ref`.

**There is no override.** Not strict mode, not a config flag, not a "force" parameter. The failure mode this prevents — mutating another team's ticket — is silent and discovered late, which is exactly the kind of failure that should be structurally impossible rather than merely discouraged.

A consequence worth stating plainly: `next-priority`'s "all tasks done" check operates on the epic-filtered queue. Other teams' tickets never gate Synthex's completion, which is the intended semantics.

### The value belongs to the plan, not to config

Scoping by a single configured value separates Synthex from other *teams* but not one of its own initiatives from another. A repository commonly runs several concurrently — Synthex already supports that on the filesystem, where each initiative is its own plan document — and a shared value would make their rows indistinguishable. `list_tasks` for one epic would return the other's work, and the plan-complete check would never fire until both finished.

So the **property** stays in config, because it describes the database's schema, while the **value** is carried by each plan on a `**Epic:**` line beneath its H1. Commands resolve it from the plan, falling back to `notion.epic.value` only for plans that do not declare one.

This is the same move as the pre-write verification in §5: convert a rule someone has to remember into a property of the structure. A command cannot touch task rows without having read the plan those rows belong to, and that plan names its own epic — so there is no flag to forget and no config entry to drift out of sync. The cost is one plan read before the first task operation, which every one of these commands performs anyway.

The adapter contract is untouched by this. Callers resolve the value and pass it in; `notion-task-store` never reads plan documents and simply refuses when either half of the pair is absent.

### Relations make the value a page id, not a name

When work items point at their epic through a Notion **relation**, the filter value must be a page UUID — Notion cannot filter a relation by page title. This is worth stating as an architectural constraint rather than an implementation note, because the failure it produces is silent and points the wrong way: a plan naming its epic as bare text filters on nothing and returns an empty result set, which reads as "this initiative has no work left."

So the plan carries a markdown link — `[Billing Migration](https://www.notion.so/<id>)` — which serves people and the filter from one line. A bare URL or UUID works; a plain name resolves only by a unique exact title match in the epics database, and fails otherwise rather than guessing.

A corollary that is easy to miss: a `select`-typed epic **cannot anchor documents**. Anchoring needs a page, and a tag is not a page. Such projects keep tasks scoped but lose epic-scoped document placement, falling back to the docs root.

### Assignee scoping — the second dimension

Scoping to an initiative separates Synthex from other teams and from its own other initiatives. It does not separate two engineers working the same epic, who can still select the same item.

So when an assignee property is configured, queries narrow again to work the invoking engineer may take: **theirs, or unassigned.** Items someone else holds are not read, not written, not reported.

What makes this more than advisory is the claim. Synthex creates items unassigned — a planned task is available work — and assigns one to the current user on the transition to `in_progress`. Once claimed, another engineer's query excludes it, because it is neither theirs nor unassigned. Without the claim, "unassigned is claimable" lets two engineers claim the same item in the same instant.

Claiming is the only property beyond status that a status transition writes, and it is bounded to three conditions: the property is mapped, the transition is to `in_progress`, and the item is currently unassigned. It never reassigns an item that has an owner and never clears one.

One behavioral consequence falls out and is worth naming: because claimed items are excluded from queries, **a queue holding only other engineers' work is not completion.** Commands report work remaining rather than signalling done — the same handling as blocked or `[H]`-gated tasks.

---

## 6. Schema adaptation

Synthex does not own the target database's schema and must assume it can change between invocations. So mapping is validated against the **live fetched schema** on every invocation, not trusted from config.

Three fields are load-bearing (`title`, `status`, `epic`); the rest degrade into the plan overview page or task page body. The asymmetry is deliberate: guessing which column holds status would silently write to the wrong one, whereas an unmapped `complexity` costs only queryability.

Degradations are reported in the response envelope, because a silent degradation is indistinguishable from a healthy integration until someone tries to filter on a column nothing populated.

**Schema is never migrated.** The tempting shortcut — the board has no "Blocked" option, so add one — is forbidden even when it would make the operation succeed. Consent for any schema change is obtained once, interactively, by `configure-notion`, defaulting to no.

---

## 7. Document scope

Documents split along a line that predates this feature: `requirements`, `implementation_plan`, and `retros` belong to one initiative; `specs`, `decisions`, `rfcs`, and `runbooks` outlive every initiative.

The epic-scoped four anchor to the epic row — and `epic_page` is anchored *as* the row, not beneath it.

That exception is where the information architecture comes from, and it is worth being precise about its cause. Notion gives an initiative a page people **land on**: a database row with a body that gets opened and skimmed. A repository does not have one — `ls docs/` is the navigation, and a reader opens the document they want.

Having a landing page creates a constraint: **the page you land on must not be the page that changes fastest**, or it is stale by default and its detail lends false authority to old information. That is not a preference about documents; it is the failure that actually occurred here, when a stakeholder read a detailed-but-stale epic body as the live plan.

So under `notion` the epic page holds the slowest-changing content — why this exists, how success is judged, strategic scope — plus a navigation block routing to the rest. The PRD subpage holds requirements, and links back. Under `filesystem` there is nothing to protect from staleness-by-arrival, so `epic_page` does not exist as a doc type and the PRD is one self-contained document. Same information, placed where each backend's readers arrive.

Each artifact then answers exactly one question: the epic page answers *why*; the PRD answers *what must be true*; the plan answers *how and in what order*; the work items answer *what state each piece is in*. Under the Notion shape a PRD is not readable alone, which is the accepted price of one authoritative home per fact — a copy of the why in both places would drift, with no way for a reader to tell which was current.

Two rules keep this from destroying work. **Content is relocated, never stripped:** volatile content on an epic page belongs in the plan, but must not be removed until the plan verifiably holds it. Phases are the common case — the plan carries every phase at two resolutions, all named with outcomes and only committed ones decomposed, because detail follows commitment. And **Synthex's own prior output is not a convention:** an epic page asserting its own authority proves nothing if Synthex drafted that assertion, so provenance is checked before deferring to a document's claim about itself.

The cross-cutting four have no anchor, resolve against the docs root, and **default to the filesystem** — Synthex reads specs and decisions on every review invocation, so fetching them over MCP would tax every review, and they are engineering-internal anyway.

An epic-scoped resolve without a resolved epic fails rather than falling back to the docs root. Falling back would file one initiative's PRD into a shared page, or resolve onto another initiative's identically-titled document — a silent cross-contamination worse than an error.

## 8. Task identity

Under `notion`, a task's identity is its Notion page ID. Under `filesystem`, it is `<milestone>.<ordinal>`, preserving today's semantics exactly.

The hazard this design avoids: the Product Manager (editing the plan in place) renumbers task ordinals whenever tasks are inserted or removed, and the pre-existing `Dependencies` column is free text referencing those ordinals. Projecting that scheme onto Notion rows would mean every insert silently rewires the dependency graph.

Separating opaque `task_ref` from display-only `ordinal` removes the hazard entirely, and the Notion backend gets real relation properties for dependencies when one is mapped. The filesystem backend keeps its existing unstable-ordinal behavior untouched, because changing it would break the regression contract.

---

## 9. Failure handling

Default is fail-soft: fall back to `filesystem` for the affected document type, warn naming the error code, and continue. `strict_mode: true` aborts instead, for teams where silent divergence between Notion and local state is worse than a failed command.

Two deviations:

- **Epic-scoping failure never degrades**, per §5.
- **`mcp_unavailable` across all types emits one remediation message**, not one per document type — the same reasoning as the multi-model review cloud-surface rule, where a per-CLI cascade buried the actionable message in noise.

`conflict` deserves specific mention. A human editing a Notion page while Synthex writes it is routine. Reads capture a version marker, writes re-check it, and `patch` is section-scoped so edits to untouched sections survive. Losing a stakeholder's comment or revision because Synthex replaced a whole page is a real cost, not a theoretical one.

---

## 10. Validation surface

| Concern | Test |
|---------|------|
| Envelope and canonical task shape | `tests/schemas/document-store-envelope.{ts,test.ts}` |
| Epic scoping stated at every enforcement point, no escape hatch | `tests/schemas/notion-epic-scoping.test.ts` |
| Required vs optional mapping, degradation reported, no silent migration | `tests/schemas/notion-property-mapping.test.ts` |
| Config block shape, off-by-default, maps-not-arrays, documented subkeys | `tests/schemas/defaults-yaml-notion.test.ts` |
| Command wiring, disabled-path short-circuit, init delegation | `tests/schemas/notion-command-integration.test.ts` |
| Epic anchoring, relation resolution, assignee scoping, claiming | `tests/schemas/notion-epic-anchoring.test.ts` |
| Pre-refactor behavior preserved | `tests/schemas/notion-baseline-snapshots.test.ts` + baselines |

All Layer 1: zero LLM cost, runs on every PR.

---

## 11. Deferred

- **Bidirectional sync.** One backend per document type; no reconciliation of divergent copies.
- **Content migration.** No bulk import in either direction.
- **Notion comments as review input.** A natural follow-on, but out of scope here.
- **Other trackers.** The contract is backend-neutral so a Jira or Linear store would not disturb commands, but none is implemented.

---

## Source Authority

- FR-NB1 (backend resolution), FR-NB2 (regression contract), FR-NB3 (document operations), FR-NB4 (epic scoping), FR-NB5 (property mapping), FR-NB6 (wizard), FR-NB7 (task identity), FR-NB8 (consent), FR-NB9 (error enum)
- NFR-NB1 (zero credential surface), NFR-NB2 (zero cost when disabled), NFR-NB3 (non-destructive), NFR-NB4 (fetched content is data)

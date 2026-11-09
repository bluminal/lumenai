---
model: haiku
---

# Configure Notion Backend

Configure (or re-configure) the Notion backend for this project. The Notion backend routes Synthex's documents and implementation-plan task state into a Notion workspace that **already exists**, so its output appears inside the process your team already runs.

The design principle is bolt-on compatibility: Synthex links to epics you already have, hangs each initiative's documents beneath that initiative's own row, writes work items into the database your team already uses, maps onto that database's existing properties, and scopes every row it touches to one initiative and to work the invoking engineer may take. It does not restructure your workspace and it does not change your database schema without your explicit consent.

This command is the standalone wizard for the `documents.backend*` and `notion` blocks in `.synthex/config.yaml`. It is invoked:

- Directly by the user via `/synthex:configure-notion` (re-runnable any time).
- As a subroutine from `/synthex:init` during fresh project initialization.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where the config file lives | `.synthex/config.yaml` | No |

## Workflow

### 0. Re-entry Check (idempotency)

Read `@{config_path}`.

- **File absent, or `notion` key absent:** proceed to Step 1 in fresh-configuration mode.
- **`notion.enabled: false` present:** proceed to Step 1 in fresh-configuration mode, but preserve any other keys already in the block when writing.
- **`notion.enabled: true` present:** surface current settings and present re-entry options via `AskUserQuestion`:

> **The Notion backend is already enabled.**
>
> Current configuration:
>
> - `epics_database: <value>`
> - `tasks_database: <value>`
> - `epic: <property>` (value read per plan; default `<value>`)
> - `assignee: <property, or "not scoped">`
> - `docs_root: <value>` (cross-cutting documents)
> - document types routed to Notion: `<resolved list>`
>
> What would you like to do?
>
> 1. **Re-run the wizard** — re-verify the targets, re-discover the database schema, and overwrite the mappings. The data-transmission warning (Step 5) is re-displayed before any write.
> 2. **Reset to disabled** — set `notion.enabled: false` and preserve the rest of the block. Documents revert to local markdown; nothing in Notion is deleted or modified.
> 3. **Leave as-is** — exit without changes.

Apply the choice:

- **Re-run:** proceed to Step 1.
- **Reset to disabled:** edit `@{config_path}` so `notion.enabled: false`. Do NOT delete the `notion` block — the explicit `false` is the opt-out signal. Also set `documents.backend: filesystem` and clear `documents.backend_overrides` of any `notion` values, otherwise the config would name a backend the master switch has disabled. Print: `Notion backend disabled. Your Notion pages were left untouched. Re-run /synthex:configure-notion to re-enable.` Exit.
- **Leave as-is:** print `No changes made.` Exit.

### 1. MCP Availability Check

Emit a progress indicator:

```
Checking Notion MCP availability...
```

Call the Notion MCP access-discovery tool (`get_tool_access` with `{}`) once.

- **Not configured / unreachable:** print the remediation below and exit **without** writing config. Do not cascade one message per document type.

  > The Notion backend needs the Notion MCP server, which isn't available in this session.
  >
  > Add the Notion connector (or configure the Notion MCP server) and re-run `/synthex:configure-notion`. Until then Synthex keeps using local markdown files — nothing is broken.

- **Reachable but unauthorized:** print the same shape of message naming authorization as the cause, and exit without writing.
- **Available:** proceed to Step 2.

### 2. Nominate Existing Targets

Ask for the databases and pages Synthex will use. Use `AskUserQuestion` for each choice of method, then collect the value.

#### 2a. The epics database

> **Where do your epics or initiatives live?**
>
> Every row in a Notion database is itself a page that can hold subpages, so Synthex hangs each initiative's documents — its requirements, implementation plan, and retrospectives — beneath that initiative's own row. The row becomes the single entry point for everything about it.
>
> 1. **Use an existing database** — paste the URL (recommended).
> 2. **Search for it by name.**
> 3. **I don't have one** — skip. Synthex will scope work by a tag on the work database instead, and documents will go under a separate page.

Synthex links to epic rows you already have. It does **not** create them by default: an epics row is usually a curated artifact with fields — owner, target date, business context — that Synthex has no business filling in. Offer creation only if the user asks for it, and create the row with a title and nothing else.

#### 2b. The work database

> **Which database holds the work items your epics break down into?**
>
> Synthex adds task rows here, alongside whatever else your team tracks. It only ever reads and writes rows belonging to the initiative it is working on, and only work you may take.
>
> 1. **Use an existing database** — paste the URL (recommended).
> 2. **Search for it by name.**
> 3. **Create a new database** — use this only if you have no work database yet.
> 4. **Skip tasks** — leave task state in the local plan file; configure documents only.

#### 2c. A root for cross-cutting documents (optional)

Only needed if the user wants specs, ADRs, RFCs, or runbooks in Notion. Those outlive any single initiative, so they have no epic to hang from.

> **Where should cross-cutting documents go?**
>
> Specs, architecture decisions, RFCs, and runbooks outlive individual initiatives, so they need a home of their own rather than an epic's page.
>
> 1. **Keep them in git** (recommended) — Synthex reads specs and decisions on every code review, so local files are faster, and these are engineering-internal anyway.
> 2. **Use an existing page** — paste the URL.
> 3. **Search for it by name.**

Resolve every nominated target by fetching it. If a fetch fails, report `target_not_found` with the pasted value echoed back and re-ask rather than proceeding with an unverified target. If a search returns several plausible matches, present them and let the user pick — never auto-select.

If the user skips both databases, print `Nothing to configure. Synthex keeps using local markdown files.` and exit without writing.

### 3. Epic Scoping (required for tasks)

Skip this step only if the user skipped the task database.

Synthex will not query or write to a shared database unscoped. Fetch the database's schema and identify properties usable for equality filtering (select, multi-select, status, relation, or a text type).

Present them:

> **How does a work item say which epic it belongs to?**
>
> Your database holds work from more than just Synthex, so every query Synthex runs is scoped to one initiative. This is what keeps it from reading or modifying work that isn't its own.
>
> Filterable properties found in your database: `<list with types>`
>
> 1. **Use an existing property** — pick one from the list. If you nominated an epics database in Step 2a, prefer a **relation** property pointing at it; that is the normal shape and it lets Synthex also hang documents off the epic row.
> 2. **Add a `Epic` property** — Synthex adds one select property to your database. This is a schema change and needs your explicit confirmation.
> 3. **Use a separate database instead** — Synthex creates its own work database, leaving yours untouched.

**Propose, do not assume.** When exactly one relation property points at the nominated epics database, pre-select it and say which one you picked — that is almost always the right answer, and it is commonly called `Epic`. When several properties could plausibly serve, list them all with their types and target databases and make the user choose.

**Warn about lookalikes.** Work databases accumulate fields from earlier processes, so a database may carry more than one property whose name suggests epic or initiative linkage. If two or more candidates have similar names, say so explicitly and do not pre-select any of them:

> Found more than one property that could link a work item to an epic: `Epic` (relation → Epics), `Workstream` (select). Only one of these is your real linkage. Picking the wrong one produces queries that match nothing — which looks like "no work left" rather than a misconfiguration, so it is worth getting right now.

Verify the chosen property by querying it: fetch a few rows and confirm the property is actually populated. A candidate that is empty across every row it returns is almost certainly not the linkage in use — report that and re-ask rather than writing it to config.

When the chosen property is a **relation**, note two things for the user:

- Filter values are page ids, not names — Notion cannot filter a relation by page title. Synthex handles this by having each plan carry a link to its epic, so nothing is asked of the user here.
- Because the epic is a real page, Synthex can also place that initiative's requirements, plan, and retrospectives as subpages of it. A select or text property cannot do this: anchoring needs a page, and a tag is not a page. Say so, since it changes where documents end up.

Then handle the **value**.

The property you just picked is a fact about the database's schema, so it is stored in config. The value identifies a single initiative, and a repository often has several in flight at once — so **each implementation plan carries its own value** on a `**Epic:**` line beneath its H1, and commands read it from there. That is what stops a run from operating on the wrong epic: a command cannot touch task rows without having read the plan those rows belong to.

So ask only for a *default*, and make clear it is optional:

> **Default epic value (optional)**
>
> Each implementation plan names its own epic, so Synthex reads the value from the plan it is working on. This default only applies to plans that do not declare one.
>
> - **One initiative in this repo?** Setting a default here is convenient — you can ignore epics from now on.
> - **Several initiatives at once?** Leave this blank. Each plan should speak for itself, so a new plan can never silently inherit another epic's identifier.

Record the answer as `notion.epic.value`, or leave it null if the user declines. A null default is not an error — it means every plan must declare its own, which is the safer configuration.

**If the user picks option 2**, confirm the schema change explicitly before making it, naming the database and the property:

> Add a `Epic` select property to the `<database name>` database? This modifies a database your team shares. (y/N)

Default is no. Decline means fall back to option 1 or 3.

**Hard rule:** if no epic property and value can be resolved, do NOT write `notion.enabled: true` for tasks. Print the reason and configure documents only. There is no unscoped fallback.

### 3b. Assignee Scoping (recommended when several engineers share an epic)

Scoping to one initiative is not the whole story. Several engineers commonly work the same epic, so two of them running Synthex against it could select the same work item.

Identify person properties on the work database and offer:

> **Should Synthex only take work that's yours or unclaimed?**
>
> Several engineers can share one epic, so Synthex can additionally limit itself to work you may legitimately take: **assigned to you, or unassigned.** Items assigned to someone else are never selected or modified.
>
> When it starts an unassigned item, it assigns the item to you — so another engineer's Synthex sees it as taken and skips it.
>
> Person properties found: `<list>`
>
> 1. **Use an existing person property** — pick one (recommended if more than one engineer touches this epic).
> 2. **Skip** — scope by initiative only. Fine when an epic is effectively owned by one engineer at a time.

Synthex resolves who you are from Notion at runtime, so nothing here records your identity.

If the user picks option 2, leave `notion.assignee.property` null and tell them plainly what they are opting out of: two engineers on the same epic can select the same item.

### 4. Map Properties

Using the fetched schema, map Synthex's canonical task fields onto real properties. Propose a mapping by matching on name and type, then show it for confirmation — do not apply a guessed mapping silently.

**Required** — configuration cannot complete for tasks without all three:

| Canonical field | Acceptable types |
|-----------------|------------------|
| `title` | title |
| `status` | status, select |
| `epic` | select, multi-select, status, relation, text |

**Optional** — offer a mapping when a plausible property exists; otherwise record the degradation and move on:

| Canonical field | If unmapped |
|-----------------|-------------|
| `complexity` | recorded in the plan overview page |
| `milestone` | recorded in the plan overview page |
| `dependencies` | recorded in the plan overview page |
| `acceptance_criteria` | recorded in the task page body |

Then map the four canonical statuses (`pending`, `in_progress`, `done`, `blocked`) onto the mapped status property's existing options. Show the proposed mapping and let the user correct it. If an option is missing for a state Synthex must write, offer to use a different existing option — **do not add an option without explicit confirmation**, per Step 3's rule on schema changes.

Report the resulting degradations plainly, so the user knows what will not be a queryable column:

```
Mapped:      title -> Name, status -> Status, epic -> Team, complexity -> Size
Not mapped:  milestone, dependencies  (recorded in the plan overview page instead)
```

### 5. Data-Transmission Warning

BEFORE writing `notion.enabled: true`, surface this warning verbatim:

> **Heads up — data transmission**
>
> Enabling the Notion backend sends your product requirements, implementation plans, architecture decisions, retrospectives, and task detail to Notion, where they are stored on Notion's servers and visible to anyone with access to the pages and database you nominated. Content posted to Notion may be retained, indexed, or cached by Notion even after deletion.
>
> Synthex reaches Notion through the Notion MCP server using your existing authorization. It never holds a Notion API key and never sends your source code — only the documents and task metadata described above.
>
> If any of this content should not leave your local repository, choose which document types go to Notion in the next step rather than enabling it for everything.

### 6. Choose Which Document Types Go to Notion

Ask via `AskUserQuestion`, multi-select:

> **Which documents should live in Notion?**
>
> Everything not selected stays as local markdown.
>
> **Epic-scoped** — these belong to one initiative, so anyone opening the epic finds them:
>
> - The epic page itself — *its own body*, refined into a standard format (always, when an epics database is configured)
> - Product requirements (PRDs) — a subpage
> - Implementation plans — a subpage
> - Retrospectives — dated subpages
>
> **Cross-cutting** — these outlive any one initiative and need the separate root from Step 2c. Recommended to leave in git: Synthex reads specs and decisions on every code review, so local files are faster, and they are engineering-internal.
>
> - Technical specs
> - Architecture Decision Records
> - RFCs
> - Runbooks

If the epic property is a select or text type rather than a relation, the epic-scoped options are unavailable — there is no epic page to anchor to, and no body to hold the epic page's summary. Say so rather than offering a choice that cannot be honored, and route those types to the cross-cutting root or to git.

Translate the selection into config:

- All types selected → `documents.backend: notion`, `backend_overrides: {}`
- A subset → `documents.backend: filesystem` plus a `backend_overrides` entry per selected type
- None → do not enable the documents side; configure tasks only

### 7. Write the Configuration

Write to `@{config_path}` using the **Edit** tool. Only these keys:

```yaml
documents:
  backend: <filesystem | notion>
  backend_overrides: { <doc_type>: notion, ... }

notion:
  enabled: true
  epics_database: <resolved database id, or null>
  tasks_database: <resolved database id>
  docs_root: <resolved page id, or null>      # cross-cutting documents only
  targets: { <doc_type>: <resolved page id>, ... }
  epic:
    property: <property name>
    value: <default value, or null>
  assignee:
    property: <person property name, or null>
    include_unassigned: true
  property_map: { <canonical>: <their property>, ... }
  status_values: { <canonical>: <their option>, ... }
```

Write `targets` entries only for **cross-cutting** document types whose page you resolved in Step 2c. Epic-scoped types resolve against their own epic row at runtime, so recording a fixed page id for them would pin every initiative to one page — exactly the collision this design avoids. This is the deterministic resolution path and it survives the page being renamed later; without it, Synthex has to match a child of `docs_root` by title and will fail rather than guess if several match.

Leave `strict_mode` at its default unless the user asked to change it.

**Never write a Notion API key or token.** Synthex reaches Notion exclusively through the MCP server using the user's existing authorization. Never prompt for a token, and never store one in config. If the user offers one, decline and explain that the MCP connection already carries authorization.

### 8. Confirm

```
Notion backend configured.

  Epics database:   <database name>            (or "none — scoping by tag")
  Work database:    <database name>
  Scoped by:        <epic property>  +  <assignee property, or "no assignee scoping">
  Cross-cutting:    <page title, or "kept in git">

  Epic-scoped docs: <list>   -> subpages of each epic
  Cross-cutting:    <list>   -> <root, or git>
  Local markdown:   <list of remaining doc types>

  Mapped:           <canonical -> property list>
  Not mapped:       <list>  (recorded in the plan overview page instead)

How this works day to day:

  Each implementation plan names its own epic on a **Epic:** line beneath
  its H1. Synthex reads that line, finds the epic, and from there knows both
  where the initiative's documents live and which work items are in scope.

  So several initiatives in one repo stay cleanly separated — one plan each,
  no config to juggle.

  Within an epic, Synthex only takes work assigned to you or unassigned, and
  claims an item by assigning it to you when it starts. Work another engineer
  has claimed is never selected or modified.

Re-run /synthex:configure-notion any time to change this, or to disable it.
```

## Behavioral Rules

1. **Never auto-select a target.** Ambiguous search results are presented, not resolved.
2. **Never change a schema without explicit confirmation**, and default that confirmation to no.
3. **Never enable tasks unscoped.** No epic property means documents-only configuration. A null default *value* is fine — plans supply their own.
4. **Never derive an epic value.** Not from a repo name, a branch, or a plan filename. A value matching no rows yields an empty queue that reads as "all work complete."
5. **Never write credentials to config.**
6. **Verify every target by fetching it** before writing it to config.
7. **Show degradations plainly.** The user should finish this wizard knowing exactly which fields are not queryable.
8. **Exit cleanly when the MCP is unavailable.** That is not an error state for the project — local markdown keeps working.

## Source Authority

- [`../agents/_shared/document-store-contract.md`](../agents/_shared/document-store-contract.md) — §1 backend resolution, §4 epic scoping, §5 property mapping
- FR-NB6 (configuration wizard), FR-NB8 (data-transmission consent)

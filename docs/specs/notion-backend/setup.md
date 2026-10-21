## Status: Final

# Setup Guide — Notion Backend

> How to point Synthex at an existing Notion workspace, what it will and will not touch, and how to undo it.

## Related Documentation

- [`./architecture.md`](./architecture.md) — how it works internally
- [`../../reqs/notion-backend.md`](../../reqs/notion-backend.md) — the PRD

---

## 1. What you get

Synthex's documents and implementation-plan tasks appear in Notion instead of only as markdown in your repository:

- The **epic's own body becomes a standardized summary** — why this exists, how you'll know it worked, and what's out of scope. If your epic already has content, Synthex reads it and refines it into that shape *with you*; it never discards what's there.
- The epic page carries a **`Where the detail lives`** block near the top: links to the requirements, the plan, and the work items, each with a current-state line, plus a blunt note that the page is a summary rather than the plan. Synthex refreshes it at the end of every `next-priority` run.
- An initiative's **requirements, plan, and retrospectives become subpages of its epic**, so anyone opening the epic finds them.
- **Plan tasks become rows in your work database**, linked to that epic, with status updated as work completes.

```
Epics DB
  ▸ Billing Migration              ← the epic you already have
      │  body = why + navigation   ← refined into a standard format, with you
      │    Why this exists
      │    Where the detail lives  ← links + freshness, kept current by Synthex
      │    How we'll know / Out of scope
      ├─ Product Requirements      ← Synthex adds these
      ├─ Implementation Plan
      └─ Retrospective 2026-09-22

Work DB
  ├─ Add rate limiting      → Billing Migration    (unassigned)
  ├─ Migrate invoice job    → Billing Migration    (you)
  └─ Backfill ledger        → Billing Migration    (someone else — untouched)
```

Cross-cutting documents — specs, ADRs, RFCs, runbooks — stay in git by default, since they outlive any one initiative and Synthex reads them on every code review.

You choose which of those document types go to Notion. Anything you do not select stays as local markdown.

**Off by default.** If you never run the wizard, nothing changes.

---

## 2. Prerequisites

The Notion MCP server, available and authorized in your session. Synthex never holds a Notion API key — it reaches Notion entirely through the MCP connection using your existing authorization.

You will also want:

- Your existing **epics database** — the one whose rows are epics or initiatives.
- Your existing **work database** — where those epics' work items live, related back to the epic.

Synthex links to epic rows you already have. It will not create one unless you ask, because an epics row usually carries owner, dates, and business context it has no basis to fill in.

Both must be shared with the Notion integration your MCP connection uses; otherwise Synthex sees them as nonexistent.

---

## 3. Setup

```
/synthex:configure-notion
```

The wizard walks eight steps. It is re-runnable at any time and idempotent.

### What it asks

| Step | What it needs | Notes |
|------|--------------|-------|
| 2a | Your epics database | Paste a URL or search by name |
| 2b | Your work database | Paste a URL or search by name |
| 2c | A root for cross-cutting docs | Optional — recommended to keep these in git |
| 3 | How a work item names its epic | Usually a relation property — see §4 |
| 3b | An assignee property | Recommended when several engineers share an epic — see §4 |
| 4 | Property mappings | Proposed from your database's real schema; you confirm |
| 6 | Which document types go to Notion | Multi-select; the rest stay local |

Before enabling anything it shows a data-transmission warning describing exactly what leaves your repository. Read it — this is the point at which your requirements and plans start living on Notion's servers.

`/synthex:init` runs this wizard as one of its steps. If the MCP server is not available it exits cleanly and `init` continues; an unavailable Notion setup never breaks initialization.

---

## 3. Working several epics, and sharing config with your team

`.synthex/config.yaml` is committed and holds **no particular epic** — only where epics live, which property links a work item to one, and the property mappings. So you and a colleague share one config and each work a different initiative.

Which epic *you* are on is per-developer state in `.synthex/active-epic.json`, which `init` gitignores:

```bash
/synthex:use-epic "Billing Migration"
```

```
Active epic: Billing Migration
  requirements  docs/reqs/billing.md
  plan          docs/plans/billing.md
```

From then on, commands default to that initiative — no `--implementation_plan_path` on every call. Switch any time:

```bash
/synthex:use-epic "Checkout Revamp"     # switch
/synthex:use-epic                       # show active + available
/synthex:use-epic --clear               # back to explicit paths
```

Switching **never writes to your working tree.** It only changes which epic is active, so it is safe to do freely and safe to undo. If the epic has no documents yet it says so and points you at `write-prd`, rather than leaving empty files that look like work has begun.

`write-prd --epic <url>` sets the active epic itself, since that is where an initiative starts — you do not need to activate it first.

**One safety behaviour worth knowing.** With several epics available and no active epic and no explicit path, commands **stop** instead of falling back to `docs/plans/main.md`:

> `No active epic, and no path given. Run /synthex:use-epic <epic> first, or pass --implementation_plan_path explicitly.`

On a multi-epic project a silent default is how someone marks another initiative's tasks done. Every command that operates on an epic also names it in its first line of output, so a run is never ambiguous about what it touched.

## 3a. Starting a PRD from an epic and some source docs

The common case: an epic exists in your Epics database, and you have notes, research, or a draft spec.

```bash
/synthex:write-prd \
  --epic https://www.notion.so/<epic-row-url> \
  --from notes/kickoff.md \
  --from research/ \
  --from https://www.notion.so/<meeting-notes-page>
```

`--from` is repeatable and takes files, globs, directories, URLs, and Notion pages — including the epic's own body, which is often the best single source.

What happens, in order:

1. **The epic is resolved and verified** by fetching it. Omit `--epic` and Synthex searches your Epics database and asks you to pick; it never auto-selects, even on a single match.
2. **Sources are read**, along with the repo itself — README, CLAUDE.md, package.json, existing specs — and capped, with anything oversized summarized. You are told what was read and what got summarized.
3. **Discovery** settles why this exists, for whom, what is out of scope, and how success is judged. Answers come from the sources where they exist; you are asked only where they do not.
4. **The epic page is refined** into standard shape, collaboratively — mapping shown, gaps and leftovers raised, approval taken before anything is written. Nothing already there is discarded.
5. **Requirements are specified**, each tagged with where it came from.
6. **The PRD is written** as the epic's `Product Requirements` subpage, opening with an `**Epic:**` link.

Then `/synthex:write-implementation-plan` reads that link and inherits the epic — you are not asked twice.

**If you only want to fix the epic page**, stop after step 4:

```bash
/synthex:write-prd --epic <url> --epic-only
```

**Expect a longer interview when sources are thin.** With nothing but the repo, Synthex must elicit everything and will say so up front. That is the honest cost of a PRD grounded in conversation rather than documents.

## 4. How Synthex stays in its lane

**This is the most important section.** Two dimensions of scoping, and both matter.

### Which initiative (the epic)

Your work database holds items from many epics. Synthex acts on exactly one at a time, and each **plan names its own epic** on a line beneath its H1:

```markdown
# Implementation Plan: Billing Migration

**Epic:** [Billing Migration](https://www.notion.so/<epic-row-id>)
```

The link form matters. If your work items point at their epic through a Notion **relation**, the filter needs the epic's page id — Notion cannot filter a relation by page name. The markdown link carries a label for people and the id for the filter in one line, so you never deal with a bare UUID.

So several concurrent initiatives stay separated with no config juggling:

```
/synthex:next-priority --implementation_plan_path docs/plans/checkout.md
  -> reads its epic from that plan, acts only on that epic's work

/synthex:next-priority --implementation_plan_path docs/plans/billing.md
  -> reads its epic from that plan, acts only on that epic's work
```

Each run's "all tasks complete" covers only its own initiative, so finishing checkout does not wait on billing.

`notion.epic.value` in config is just a default for plans that don't declare one. **If you run several initiatives, leave it null** — then a new plan can never silently inherit another epic's identity; it has to say what it is.

### Whose work (the assignee)

Scoping to an epic isn't enough when several engineers share it — two of you could pick the same item. So Synthex also limits itself to work you may legitimately take:

> **assigned to you, or unassigned**

- Items **someone else holds are never** read into your queue, updated, or reassigned.
- New items Synthex creates are **unassigned** — a planned task is available work.
- When Synthex **starts** an item, it **assigns it to you**. That's what makes the claim real: another engineer's Synthex now sees it as taken and skips it.

You don't configure who you are; Synthex asks Notion at runtime.

One consequence worth knowing: if every remaining item in an epic is claimed by others, Synthex reports *work remaining*, not *done*. A queue that's empty because your colleagues hold everything is not a finished epic.

This is optional — leave the assignee property unset and you get epic scoping only, which is fine when one engineer owns an epic at a time. The wizard will tell you what you're opting out of.

### Not guessing

Synthex will not derive an epic from a filename, branch, or plan title. A guessed value matching no rows returns an empty queue, which looks exactly like "all work complete" — so a missing or ambiguous epic is an error you hear about, not a silent no-op.

## 4a. Why the epic body stays short

An epic row is something people skim, and that produced a failure worth knowing about: a stakeholder opened an epic, did not notice the requirements and plan subpages beneath it, and — because the body held a lot of detail — took the body to be the current plan. It was stale.

Two things went wrong. The live artifacts were invisible, and **detail read as freshness** — a long document looks maintained, so a reader stops looking for a newer one.

So the epic body holds only what stops changing once an initiative is defined:

| Stays in the epic | Never in the epic |
|---|---|
| The problem, and why now | Requirements |
| Who it's for | Milestones and tasks |
| Out of scope | Status, dates, counts |
| How we'll know it worked | Anything with a checkbox |

**The rule: if it has a status, a date, a count, or a task, it does not go in the epic body.** The single exception is the `Where the detail lives` block, which is volatile on purpose and maintained by Synthex rather than by hand — which is what stops it becoming the stale detail it warns against.

If you find yourself wanting to put progress in the epic, that is what the block is for, and `next-priority` already keeps it current.

## 4b. Regenerating an epic on an existing project

Your PRD and plan already exist, and the epic body is either free-form or has drifted. Two situations, two answers.

**Standardize or re-derive the epic page:**

```
/synthex:write-prd --epic-only
```

This skips the PRD entirely — it is not that run's concern. Synthex reads the epic body, maps what is there onto the standard sections, shows you what landed where, asks about gaps and leftovers, and writes back with a section-scoped patch once you approve. Nothing already in the body is discarded; anything that fits no section is raised with you or preserved under `Additional context`.

The same option appears inside a normal `/synthex:write-prd` run as **"Refresh the epic page,"** so you do not have to remember the flag.

**Refresh just the freshness numbers:** nothing to run. `/synthex:next-priority` rewrites the `Where the detail lives` block at the end of every run.

One caveat worth knowing: `next-priority` will **not** insert that block into an epic body that is not already in standard epic-page shape. It reports this instead —

> `This epic's body isn't in standard epic-page shape, so there's no navigation block to refresh. Run /synthex:write-prd --epic-only to standardize it.`

— because restructuring your page is a decision that belongs where you are present to approve the mapping, not to a task-execution run.

## 5. Property mapping

Synthex maps its fields onto your database's existing property names. It does not rename your columns or impose its own.

| Synthex field | Required? | If your database has no home for it |
|---------------|-----------|-------------------------------------|
| `title` | **Yes** | Setup cannot complete for tasks |
| `status` | **Yes** | Setup cannot complete for tasks |
| `epic` | **Yes** | Setup cannot complete for tasks |
| `complexity` | No | Recorded in the plan overview page |
| `milestone` | No | Recorded in the plan overview page |
| `dependencies` | No | Recorded in the plan overview page |
| `acceptance_criteria` | No | Recorded in the task page body |

Unmapped optional fields are not lost — they just are not queryable columns. The wizard tells you which ones degraded, and so does every run that encounters one.

Status names are mapped too, so Synthex uses your vocabulary:

```yaml
notion:
  status_values:
    pending: Backlog
    in_progress: In Progress
    done: Shipped
    blocked: Blocked
```

---

## 6. What Synthex will never do

- Rename, move, archive, or delete any page that existed before it arrived.
- Reorganize the contents of your docs root.
- Modify a work item belonging to a different epic.
- Read, modify, or reassign a work item that another engineer has claimed.
- Add a property, add a select option, or change a property type without asking you first — and that prompt defaults to no.
- Store a Notion API key or token anywhere.
- Create an epic row, unless you explicitly ask — and then only with a title.
- Send your source code. Only documents and task metadata are transmitted.

---

## 7. Choosing what goes to Notion

Document types divide by whether they belong to one initiative or outlive them all:

| Epic-scoped — belong to one initiative | Cross-cutting — no epic to hang from |
|---|---|
| The epic page — *the row's body itself* | Technical specs |
| Product requirements | Architecture decisions (ADRs) |
| Implementation plan | RFCs |
| Retrospectives | Runbooks |

The recommended split, which is also the default:

```yaml
documents:
  backend: filesystem
  backend_overrides:
    requirements: notion         # PMs read these
    implementation_plan: notion  # stakeholders track these
    retros: notion               # the team discusses these
    # specs, decisions, rfcs, runbooks stay in git
```

The reason to leave the cross-cutting four in git: `review-code` reads specs and decisions on every invocation for spec-compliance checking, so fetching them from Notion taxes every review — and they're engineering-internal anyway. Put the artifacts humans outside the team read in Notion; leave the ones Synthex reads on disk.

If your work items name their epic with a **select or text** property rather than a relation, epic-scoped placement isn't available — anchoring needs a page, and a tag is not a page. Those documents fall back to the cross-cutting root or to git, and the wizard says so rather than offering a choice it can't honor.

---

## 8. When something goes wrong

By default Synthex **falls back to local markdown** for the affected document type and warns you:

```
Notion unavailable for implementation_plan (target_not_found). Using local markdown instead.
```

Your work continues. To make Notion failures abort instead — appropriate when a silent divergence between Notion and local state is worse than a failed command:

```yaml
notion:
  strict_mode: true
```

| Error | Usually means |
|-------|--------------|
| `mcp_unavailable` | The Notion MCP server isn't configured in this session |
| `notion_auth_failed` | MCP is present but not authorized for this workspace |
| `target_not_found` | The page or database was deleted, or isn't shared with the integration |
| `permission_denied` | The integration can't write there, or a row failed the epic check |
| `schema_mismatch` | A required property mapping is missing or the wrong type — re-run the wizard |
| `rate_limited` | Notion throttled the request; retried once |
| `conflict` | Someone edited the page while Synthex was writing; re-read and retry |

One exception to fall-back: a epic-scoping failure never degrades to an unscoped query. Synthex stops touching tasks and tells you why.

---

## 9. Turning it off

```
/synthex:configure-notion
```

Choose **Reset to disabled**. Documents revert to local markdown immediately.

Your Notion pages and rows are left exactly as they are — disabling the backend does not delete anything. Re-enable any time by re-running the wizard; your previous settings are preserved in config, so it is a one-step re-entry.

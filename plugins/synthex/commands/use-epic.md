---
model: haiku
---

# Use Epic

Set which epic this working copy is currently operating on, so document-centric commands default to that initiative's requirements and plan instead of needing a path every time.

This exists because `.synthex/config.yaml` is **committed and shared**. It holds workspace facts — which database holds epics, which property links a work item to one — and deliberately holds no particular epic. "Which epic am I on" is per-developer and per-clone, so it lives in local state that is never committed. You and a colleague share one config and each work a different epic.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `epic` | The epic to activate: a Notion page URL, a page id, or enough of its title to match one unambiguously. Omit to see what is active and what is available. | — | No |
| `--clear` | Deactivate, so commands require an explicit path again. | off | No |

## State File

`.synthex/active-epic.json`, in the project root. **Per-developer, per-clone, gitignored** — `init` adds it alongside `.synthex/state.json` and `.synthex/loops/`.

```json
{
  "schema_version": 2,
  "ref": "https://www.notion.so/<epic-row-id>",
  "label": "Billing Migration",
  "documents": {
    "requirements": {
      "backend": "notion",
      "handle": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      "exists": true
    },
    "implementation_plan": {
      "backend": "filesystem",
      "handle": "docs/plans/billing.md",
      "exists": false
    }
  },
  "updated_at": "2026-10-05T14:02:11Z"
}
```

**A handle's form depends on its backend.** Per [§2 of the contract](../agents/_shared/document-store-contract.md), a handle is a repo-relative path under `filesystem` and a **page ID** under `notion`. The two are not interchangeable, so each entry records which backend produced it — a bare string would leave a consumer guessing, and guessing wrong means handing a page ID to the filesystem.

That also makes the state self-correcting. When an entry's recorded `backend` no longer matches what `documents.backend_overrides.<type>` → `documents.backend` resolves to — because someone changed the config — **re-resolve rather than using the stored handle.** A page ID interpreted as a path is a missing file; a path interpreted as a page ID is a failed fetch. Both are confusing in ways the recorded backend makes avoidable.

Treat a `schema_version` below 2 as unresolved and re-resolve: v1 stored bare paths with no backend, so its handles cannot be interpreted safely.

It is a **separate file rather than a key in `.synthex/state.json`** for a concrete reason: `scripts/upgrade-nudge.sh` rebuilds `state.json` from a fixed set of fields on every version bump, so anything else stored there is erased. Do not move this into `state.json`.

Paths are **recorded, not derived from the label.** A slug convention breaks the moment someone renames an epic in Notion, and a stale derived path silently points at the wrong document.

## Workflow

### 1. Preflight

Requires the Notion backend: read `.synthex/config.yaml` and confirm `notion.enabled` is true and `notion.epics_database` is set.

If not, say so and stop — there are no epics to activate, and commands should keep using their configured paths:

> `This project isn't using the Notion backend, so there's no epic to activate. Commands use the paths in documents.* as normal. Run /synthex:configure-notion to set it up.`

### 2. No Argument — Report

Read `.synthex/active-epic.json` if present, then query `notion.epics_database`.

Resolve each epic's documents using Step 5 — **per type, against the backend that type actually routes to.** Reporting from a directory scan alone would show Notion-backed documents as missing.

Show the backend alongside each document, since a page ID and a path are not interchangeable and a reader needs to know which they are looking at:

```
Active epic: Billing Migration
  requirements  notion      Product Requirements      (a1b2c3d4…)
  plan          notion      Implementation Plan       (e5f6a7b8…)

Available:
  Billing Migration         (active)
  Checkout Revamp           requirements: notion · plan: filesystem docs/plans/checkout.md
  Platform Hardening        no documents yet
```

"no documents yet" is only correct when every type has been checked against its own backend. With no active epic, say so and list what is available. Do not pick one.

### 3. `--clear`

Delete `.synthex/active-epic.json`. Confirm, and name the consequence so it is not a surprise:

> `No active epic. Document commands now need an explicit path, e.g. --implementation_plan_path docs/plans/billing.md.`

### 4. Resolve the Epic

First match wins:

1. A Notion page URL or id → fetch it to verify it exists and is a row of `notion.epics_database`.
2. A title fragment → query the epics database and match case-insensitively.

**Never auto-select on an ambiguous match.** Two or more candidates means presenting them and asking. One candidate still gets confirmed when the input was a fragment rather than an id — a substring match is a guess about intent, and activating the wrong epic silently redirects every subsequent command.

Nothing found → report it with the input echoed back, list the available epics, and stop.

### 5. Resolve Its Documents

Resolve **per document type**, not once for all of them. `requirements` and `implementation_plan` can route to different backends, so a single resolution strategy is wrong for at least one of them.

For each type, first resolve its backend using the contract's order — `documents.backend_overrides.<type>` → `documents.backend` → `filesystem` — then use the matching branch.

#### Notion-routed types

The document is a subpage of the epic row and **is never on disk**. Do not scan directories, and do not apply the slug convention: both are filesystem concepts, and a manufactured local path for a document that lives in Notion is a guaranteed-wrong answer written into durable state.

Resolve in this order:

1. **The epic page's `## Where the detail lives` block.** When the epic has been standardized, that block names its requirements and plan explicitly, and Synthex maintains it. It is the cheapest and most reliable source — prefer it.
2. **The epic row's child pages.** Fetch them and match the conventional title for the type: `Product Requirements`, `Implementation Plan`. More than one match is ambiguous — report it rather than choosing.
3. **Genuinely absent.** Only now is the document "not yet created."

Record the resolved **page ID**. Per contract §2 a handle is a repo-relative path under `filesystem` but a **page ID** under `notion`; storing a path here would be the wrong kind of handle.

#### Filesystem-routed types

1. **A document whose `**Epic:**` link resolves to this epic** — scan the directory named by `documents.<type>`. Authoritative: the document itself says which epic it belongs to.
2. **Convention:** `<dir>/<slug>.md`, where `slug` is the epic's title lowercased with non-alphanumerics collapsed to hyphens.

Record the repo-relative path.

#### Both branches

Record, per type, the backend used, the handle, and whether the document currently exists. A type reported as missing must have been checked against the backend it actually routes to — reporting "not yet created" for a substantial Notion page because a directory scan found nothing is worse than not reporting at all, because it is confidently wrong and it gets written into state.

**Do not create any document.** Switching epics changes which epic is active and nothing else — it never writes to the working tree or to Notion, so it is safe to do freely and safe to undo. Creating a document is `write-prd`'s job, and it is the step that actually puts content in one.

### 6. Write and Confirm

Write `.synthex/active-epic.json` atomically — temp file then rename — so an interrupted write cannot leave malformed state.

Report, naming missing documents plainly and pointing at the command that creates them:

```
Active epic: Billing Migration
  requirements  docs/reqs/billing.md   (not yet created)
  plan          docs/plans/billing.md  (not yet created)

Run /synthex:write-prd to start the PRD. It will use this epic automatically.
```

When both exist, the same block without the annotations.

## How Commands Use It

Any command taking `requirements_path` or `implementation_plan_path` resolves in this order:

1. An explicit argument — always wins.
2. `.synthex/active-epic.json`, when present.
3. `documents.*` from config.

**When the Notion backend is on with more than one epic available, and there is no active epic and no explicit argument, stop rather than falling through to step 3.** Defaulting to `docs/plans/main.md` on a multi-epic project is how someone marks another initiative's tasks done:

> `No active epic, and no path given. Run /synthex:use-epic <epic> first, or pass --implementation_plan_path explicitly.`

**Every command operating on an epic names it in its first line of output.** A run must never be ambiguous about which initiative it touched.

`/synthex:write-prd --epic <url>` sets the active epic as a side effect — that is where an initiative begins, so activating it separately first would be redundant.

## Behavioral Rules

1. **Never write a document.** This command only ever changes which epic is active.
2. **Never auto-select an ambiguous epic**, and confirm a single fuzzy match before activating.
3. **Never store active-epic state in `.synthex/state.json`** — the upgrade-nudge hook rebuilds that file and would erase it.
4. **Never derive a recorded path from a label after the fact.** Record handles at activation; a renamed epic must not silently repoint a stale slug.
5. **Never apply a filesystem convention to a Notion-routed type.** Directory scans and `<dir>/<slug>.md` are filesystem concepts. A manufactured local path for a document that lives in Notion is wrong by construction, and writing it into durable state points every downstream command at a file that will never exist.
6. **Never report a document missing without checking its own backend.** "Not yet created" for a substantial Notion page is worse than silence: it is confidently wrong, and it gets persisted.
7. **Write atomically.** Temp file then rename.
8. **Stay silent when the backend is off.** No epics means nothing to activate; it is not an error.
9. **Do not chat.** Output is the status block.

## Source Authority

- `../agents/_shared/document-store-contract.md` — epic resolution and the epic-scoped document types
- `write-prd.md` — originates the epic reference and sets this as a side effect

# Migrating off Synthex Plus

**Synthex Plus is deprecated.** Its standing-review-pool capability — the pool
commands, pool agents, templates, docs, capability ladder, and lifecycle
hooks — has been folded into `synthex` itself. There is nothing left that
only `synthex-plus` can do. This guide gets an existing `synthex-plus`
project onto plain `synthex` in three steps: stop any running pools, move
your config, switch the commands you type.

If you've never run `/synthex-plus:start-review-team` or `/synthex-plus:team-init`
in this project, there's nothing to migrate — just stop installing the
`synthex-plus` plugin.

## Why this happened

`synthex-plus` originally existed because standing review pools needed
Claude Code's Agent Teams primitive, which standard `synthex` commands
didn't use. Now that `synthex` routes to a standing pool the same way
(gated on tool presence, via the capability ladder), keeping a second
plugin around only doubled the release surface and the per-task context
cost. See `docs/plans/harness-modernization.md` Milestone 6.1–6.2 and
decisions D6–D8 for the full rationale.

## Step 1 — Stop any running pools

Before you upgrade (or before you remove the plugin), drain and stop
whatever pools this project has running:

```
/synthex-plus:stop-review-team
```

Run `/synthex-plus:list-teams` first if you're not sure what's active.
Stopping the pool now avoids an orphaned pool process that nothing is
routing to once you switch commands in Step 3.

## Step 2 — Move your config

Standing-pool settings currently live in `.synthex-plus/config.yaml` under
the `standing_pools:` key. Move that block into `.synthex/config.yaml`
(the file `/synthex:init` creates) — same key, same shape, nothing to
translate:

```yaml
# .synthex/config.yaml
standing_pools:
  enabled: true
  routing_mode: prefer-with-fallback
  matching_mode: covers
  ttl_minutes: 60
  # ...any other standing_pools.* keys you'd customized
```

Or skip the copy-paste and run the wizard, which writes `.synthex/config.yaml`
for you and walks through the same enable / routing-mode / matching-mode
questions:

```
/synthex:configure-teams
```

`configure-teams` never writes `.synthex-plus/config.yaml` — only the new
location. Once `.synthex/config.yaml` has a `standing_pools:` block, delete
the old `.synthex-plus/` directory (see Step 4).

## Step 3 — Switch commands

Every `synthex-plus` command you used has a direct `synthex` equivalent,
except `team-*`, which is retired outright (see below).

| Old (`synthex-plus:`) | New (`synthex:`) |
|---|---|
| `start-review-team` | `start-review-team` |
| `stop-review-team` | `stop-review-team` |
| `list-teams` | `list-teams` |
| `configure-teams` | `configure-teams` |

Just swap the plugin prefix — parameters and behavior are unchanged.
`start-review-team`, `stop-review-team`, and `list-teams` still require a
host with an Agent Teams tool (`SendMessage`/`ListAgents`); on a host
without one they print the same pool-unavailable message they always did.
`configure-teams` is ungated, as before.

### What happened to `team-*`

`team-review`, `team-implement`, `team-plan`, and `team-refine` are
**retired, not folded** — there's no `synthex:team-review`. Standard
Synthex commands now fan out the same way a team did, via the capability
ladder (pool → parallel subagents → sequential, selected by what the host
actually supports):

| Old (`synthex-plus:`) | Use instead |
|---|---|
| `team-review` | `/synthex:review-code` |
| `team-plan` | `/synthex:write-implementation-plan` |
| `team-refine` | `/synthex:refine-requirements` |
| `team-implement` | `/synthex:next-priority` |
| `team-init` | `/synthex:init`, then `/synthex:configure-teams` if you want standing pools |

`star`, `dismiss-upgrade-nudge`, and `api-spike` are also retired without a
`synthex` replacement — `synthex` already has its own `star` and
`dismiss-upgrade-nudge` commands, and `api-spike` was a one-time spike
tool. `synthex-plus`'s `.synthex-plus/state.json` (nudge dismissal,
star status) is not read by `synthex` and is safe to delete.

## Step 4 — Remove the leftover directory and uninstall

Once `.synthex/config.yaml` has your `standing_pools:` block and you've
confirmed pool routing works from `synthex` alone:

1. Delete the project's `.synthex-plus/` directory (config, state, task
   lists) — it's gitignored, so this is local cleanup only.
2. Uninstall the `synthex-plus` plugin the same way you installed it —
   through Claude Code's `/plugin` command (or your marketplace client's
   plugin manager), pointing at the `bluminal/lumenai` marketplace and
   removing the `synthex-plus` entry. `synthex` is unaffected; it's a
   separate plugin in the same marketplace.

## The legacy config fallback (one major version)

You don't have to migrate `.synthex-plus/config.yaml` immediately.
Per decision D6, every `synthex` reader of `standing_pools.*` falls back
to the legacy `.synthex-plus/config.yaml` location for **one major
version** if `.synthex/config.yaml` has no `standing_pools` block,
printing a deprecation notice each time it does. This exists so a project
that hasn't gotten around to Step 2 doesn't silently lose pool routing on
upgrade. It is not a long-term option — the fallback is removed in the
release after next, and `synthex-plus` will be gone by then anyway (see
Timeline).

You'll also see a one-line reminder at the start of any session in a
project where `.synthex-plus/` still exists, independent of whether pool
routing is currently working — that's the signal to finish Steps 2–4.

## Timeline

1. **This release** — `synthex-plus`'s pool capability is folded into
   `synthex`. `synthex-plus` still works exactly as before; nothing is
   removed yet. This is a good time to migrate.
2. **Tombstone release** — `synthex-plus` ships with empty hooks, no
   agents, and command stubs that print these same migration steps
   instead of running. Anything still pointed at `synthex-plus` stops
   working at this point; the `.synthex-plus/config.yaml` fallback in
   `synthex` is unaffected by this release. This is a major (breaking)
   version bump.
3. **Removal release** — the `synthex-plus` plugin, its marketplace
   entry, and the `.synthex-plus/config.yaml` fallback are deleted
   entirely. If you haven't migrated by then, pool routing in `synthex`
   stops working until you complete Step 2.

Migrating in Step 1–4 above at any point before the removal release is
all that's required; there's no reason to wait for the tombstone.

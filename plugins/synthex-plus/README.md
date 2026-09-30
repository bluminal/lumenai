# Synthex+

> **Deprecated — see the migration guide.** Synthex+ is tombstoned. Its
> standing-review-pool and team capabilities have been folded into
> [Synthex](../synthex/) itself; there is nothing left that only Synthex+
> can do. Every command in this plugin is now a stub that prints migration
> steps and performs no other action — its hooks are empty and it defines
> no agents. See [`docs/migrations/synthex-plus.md`](../../docs/migrations/synthex-plus.md)
> for the full guide: stopping any running pools, moving your config, and
> the command-by-command mapping (including what replaces `team-*`, which
> is retired outright rather than folded).

## What to do

1. Stop any running pools: `/synthex-plus:stop-review-team` (or, since this
   release, the equivalent `/synthex:stop-review-team`).
2. Move `.synthex-plus/config.yaml`'s `standing_pools:` block into
   `.synthex/config.yaml`, or run `/synthex:configure-teams`.
3. Switch every command you used to its `synthex` equivalent. See the
   mapping table in [`docs/migrations/synthex-plus.md`](../../docs/migrations/synthex-plus.md).
4. Delete the local `.synthex-plus/` directory and uninstall this plugin.

## Removal timeline

This tombstone release ships in the same PR as the pool capability's fold
into `synthex`. A later release deletes this plugin and its marketplace
entry outright; removing a plugin from the marketplace does not uninstall
a copy you already have, which is why this tombstone exists — to disable
stale hooks and commands for installs that haven't uninstalled yet.

## See also

- [`docs/migrations/synthex-plus.md`](../../docs/migrations/synthex-plus.md) — full migration guide.
- [Synthex plugin](../synthex/) — where every Synthex+ capability now lives.

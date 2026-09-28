---
model: haiku
---

# Configure Standing Review Pools (retired)

**synthex-plus is deprecated.** This command is a migration stub — it prints
the steps below and does nothing else. Standing-pool configuration now lives
in `synthex`.

Full guide: [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md).

This command takes no arguments and writes no config.

## Workflow

Print the following verbatim and stop:

```
synthex-plus is deprecated and no longer does any work.

Use instead: /synthex:configure-teams — same enable / routing-mode /
matching-mode questions, but it writes .synthex/config.yaml instead of
.synthex-plus/config.yaml.

Full migration guide: docs/migrations/synthex-plus.md
```

## See also

- [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md) — Step 2 covers moving your `standing_pools:` config block.

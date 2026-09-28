---
model: haiku
---

# Stop Review Team (retired)

**synthex-plus is deprecated.** This command is a migration stub — it prints
the steps below and does nothing else — it sends no shutdown signal and
stops no pool. Standing review pools now stop from `synthex`.

Full guide: [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md).

This command takes no arguments.

## Workflow

Print the following verbatim and stop:

```
synthex-plus is deprecated and no longer does any work — it will NOT stop
your pool.

Use instead: /synthex:stop-review-team — same parameters and behavior;
just swap the plugin prefix. Run /synthex:list-teams first if you're not
sure what's active.

Full migration guide: docs/migrations/synthex-plus.md
```

## See also

- [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md) — Step 1 covers draining and stopping pools before you finish migrating.

---
model: haiku
---

# Dismiss Synthex+ Upgrade Nudge (retired)

**synthex-plus is deprecated.** This command is a migration stub — it prints
the steps below and does nothing else. It no longer reads or writes
`.synthex-plus/state.json`.

Full guide: [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md).

This command takes no arguments and has no replacement in `synthex-plus`.

## Workflow

Print the following verbatim and stop:

```
synthex-plus is deprecated and no longer does any work.

There is no synthex-plus replacement for this command: synthex already has
its own /synthex:dismiss-upgrade-nudge command, which silences the
one-line nudge synthex prints about lingering .synthex-plus/ state — use
that instead. synthex-plus's own .synthex-plus/state.json is safe to
delete; nothing reads it anymore.

Full migration guide: https://github.com/bluminal/lumenai/blob/main/docs/migrations/synthex-plus.md
```

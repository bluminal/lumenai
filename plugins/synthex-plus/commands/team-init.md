---
model: haiku
---

# Initialize Synthex+ (retired)

**synthex-plus is deprecated.** This command is a migration stub — it prints
the steps below and does nothing else. The capability `team-init` used to set
up (persistent agent teams) now lives in `synthex` itself.

Full guide: [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md).

This command takes no arguments and performs no scaffolding, no config
writes, and no dependency checks.

## Workflow

Print the following verbatim and stop:

```
synthex-plus is deprecated and no longer does any work.

Use instead: /synthex:init to set up a project, then /synthex:configure-teams
if you want standing review pools (synthex-plus's team-* commands are
retired outright — see the mapping table in the guide below).

Full migration guide: https://github.com/bluminal/lumenai/blob/main/docs/migrations/synthex-plus.md
```

## See also

- [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md) — full migration guide, including the `team-*` → `synthex` command mapping table.

---
model: haiku
---

# Start Review Team (retired)

**synthex-plus is deprecated.** This command is a migration stub — it prints
the steps below and does nothing else. Standing review pools now start from
`synthex`.

Full guide: [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md).

This command takes no arguments and starts no pool.

## Workflow

Print the following verbatim and stop:

```
synthex-plus is deprecated and no longer does any work.

Use instead: /synthex:start-review-team — same parameters and behavior;
just swap the plugin prefix. It still requires a host with an Agent Teams
tool (SendMessage/ListAgents).

Full migration guide: https://github.com/bluminal/lumenai/blob/main/docs/migrations/synthex-plus.md
```

## See also

- [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md) — Step 1 covers draining and stopping any pool this command previously started.

---
model: haiku
---

# Team Review (retired)

**synthex-plus is deprecated.** This command is a migration stub — it prints
the steps below and does nothing else. `team-review` is retired outright,
not folded; `synthex` fans reviewers out the same way via its capability
ladder.

Full guide: [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md).

This command takes no arguments and creates no team.

## Workflow

Print the following verbatim and stop:

```
synthex-plus is deprecated and no longer does any work.

Use instead: /synthex:review-code — it fans reviewers out via the
capability ladder (standing pool -> parallel subagents -> sequential),
selected by what your host actually supports, the same way team-review did.
A running standing pool (start it with /synthex:start-review-team) gives you
the cross-domain-alert behavior team-review had.

Full migration guide: https://github.com/bluminal/lumenai/blob/main/docs/migrations/synthex-plus.md
```

## See also

- [`docs/migrations/synthex-plus.md`](../../../docs/migrations/synthex-plus.md) — the `team-*` → `synthex` command mapping table (Step 3).

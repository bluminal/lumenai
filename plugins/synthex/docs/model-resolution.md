# Model Resolution (FR-HM15, D29)

Cold-path detail for the "Model Resolution" gate in `review-code.md`, `performance-audit.md`, and `write-implementation-plan.md` — the three commands whose Task 13/14 D17 size budgets leave no headroom to inline this paragraph directly. `refine-requirements.md`, `next-priority.md`, and `write-rfc.md` carry the identical paragraph inline instead, since they have no such budget. This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

### Model Resolution

Each spawned agent's model and effort resolve in this order: `--profile` flag > `models.agents.<name>` > `models.profile` delta > the agent's own frontmatter (FR-HM15, D29). On Claude Code, the resolved values are applied via the Agent tool's per-call `model` override; on every other host, `models`/`hosts.<harness>.models` are advisory only — applied where the host supports per-subagent model selection, otherwise ignored. Standing-pool routing is unaffected: pools never re-spawn, so a profile change reaches only newly spawned agents.

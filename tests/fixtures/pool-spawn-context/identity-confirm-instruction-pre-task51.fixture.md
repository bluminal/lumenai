#### Identity Confirm Step (FR-MMT5b)

Include the following instruction verbatim in each pool teammate's per-task workflow when standing=true:

Read-on-spawn (preserved per §8 Assumptions) means a pool teammate adopts its full Synthex agent
identity once at pool spawn and holds it for the pool's entire lifetime. For pools that idle for
hours (default `ttl_minutes: 60`; user-configurable up to `0` for indefinite), Claude Code
auto-compaction may evict portions of the teammate's context, including the agent definition itself.
To detect this without complicating the spawn path:

- Each pool teammate **unconditionally re-reads** its own agent file (e.g., `plugins/synthex/agents/code-reviewer.md`) before beginning review work on each newly-claimed task (transition from `idle` → `active`). No comparison is performed against the teammate's "current" understanding of its identity — post-compaction the teammate may not even retain a stable reference to compare against. The re-read itself is the fix: after compaction-evicted context is reloaded by the Read call, the teammate's effective agent definition is current. This is a single Read call; cost is negligible vs. a code review's typical token spend.
- The identity confirm step (the unconditional re-read) is part of the standing-pool variant of the review template (added to `templates/review.md` under a `{{#if standing}}…{{/if}}` block).

**Concrete instruction for teammates:** Before claiming and beginning work on each task from the
pool's task list, unconditionally re-read your own agent file at
`plugins/synthex/agents/<your-agent-name>.md` using the Read tool. Do this on every task claim,
not just the first one. Do not skip this step even if you believe your identity context is intact —
post-compaction state is not reliably introspectable.

**Cost rationale (FR-MMT5b verbatim):** This is a single Read call; cost is negligible vs. a code
review's typical token spend.

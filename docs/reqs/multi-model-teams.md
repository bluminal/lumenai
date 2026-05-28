# Product Requirements Document: Multi-Model Review on Synthex+ Teams + Standing Review Pools

## 1. Vision & Purpose

**Why this exists:** Two real costs constrain Synthex+ review workflows today.

1. **Same-family blind spots in team reviews.** `team-review` runs Code Reviewer + Security Reviewer (and optionally Performance + Design) as Synthex+ teammates, but every reviewer is hosted in the same Claude session. The `multi-model-review.md` PRD addresses this for standard Synthex commands by adding non-Anthropic CLI reviewers in parallel with the Anthropic-family natives. The team world has the same correlated-errors problem ([arXiv:2506.07962](https://arxiv.org/html/2506.07962v1)) and currently has no solution — using `/team-review` means accepting a single-family ensemble.
2. **Per-invocation team spin-up overhead.** Standard Synthex commands like `/synthex:review-code`, `/synthex:next-priority`, and `/synthex:write-implementation-plan` spawn fresh sub-agents on every invocation. For developers running these commands repeatedly across a session — a typical iterative loop (e.g. `/synthex:next-priority --loop`), a series of code reviews on a stack of PRs, an iterative refinement session — the spawn-and-context-load cost is paid every time. Synthex+ already has the persistent-team primitive that solves this; it just isn't accessible to standard Synthex commands.

This PRD bundles two features that share architecture, configuration surface, and implementation timeline:

- **Feature A — Multi-model review on Synthex+ teams.** Extends `multi-model-review.md` from standard Synthex commands to `/synthex-plus:team-review`. The native review team runs unchanged (preserving today's Synthex+ behavior); the multi-model orchestrator runs **alongside** the team in the host session, fans out to external CLIs, pulls native findings out of the team's mailbox/task list, normalizes everything to the canonical schema, and produces a single unified report.
- **Feature B — Standing review pools.** A new `standing: true` team mode that lets a Synthex+ review team idle indefinitely (until TTL or manual stop) so standard Synthex commands route their review work to the standing pool instead of spawning fresh sub-agents. This amortizes spawn/context cost across many invocations without changing the per-command UX.

**Why bundle them:** Feature A defines how the multi-model orchestrator interacts with a team-shaped review world; Feature B is the team-shaped review world that benefits most from feature A. A standing review pool with Feature A enabled becomes the single most valuable review surface in Synthex+ — it amortizes spawn cost AND breaks the same-family ceiling. Shipping them together avoids two close-in-time architectural changes to the same code paths (`team-review`, the orchestrator, the team task-list contract) and lets us validate one cohesive UX with users.

**Design commitments:**
- Both features are **off by default**. Zero-config Synthex+ behavior is unchanged.
- Feature A inherits Feature A's architectural commitments from `multi-model-review.md`: CLI-only provider integration, no credential handling, graceful degradation, audit artifact.
- Feature B preserves the **read-on-spawn** identity pattern (Synthex+'s "no behavioral drift from standard Synthex" property is load-bearing — see Assumptions).
- Standing pools are review-only in v1. Implementation pools, planning pools, and refinement pools are explicitly future work.

---

## 2. Target Users / Personas

Extends the persona set in `multi-model-review.md` §2.

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Quality-Conscious Team Reviewer** (extends Quality-Conscious Developer) | Already uses `/team-review` for cross-domain discussions but accepts the single-family ceiling | Multi-model review inside the team, without losing the cross-domain mailbox-driven enrichment |
| **Iterative Loop Developer** | Runs `/synthex:next-priority` repeatedly across a session via native `--loop` or by hand; each invocation pays full sub-agent spawn cost. May also run a long-lived "pool host" Claude Code session in one terminal and one or more "work" Claude Code sessions in others, with the work sessions discovering and routing to the pool spawned by the host. | Amortize the review portion of spawn cost across the session — pay once, route many. Pool must remain alive when the original spawning session ends so that newly-launched work sessions can still discover and route to it (see "Pool lifetime" in §3 Terminology and FR-MMT5). |
| **Stack-of-PRs Reviewer** | Reviews 10+ PRs in a sitting using `/synthex:review-code`, often touching the same code paths | Persistent reviewers that retain familiarity across sequential reviews; faster turnaround per PR |
| **Hands-Off Automation Operator** (extends from `multi-model-review.md`) | Runs Synthex commands in CI or scheduled loops | Standing pool that survives across CI steps within one runner session; predictable failure behavior on pool unavailability |
| **Regulated-Industry Lead** (extends from `multi-model-review.md`) | Compliance-driven review rigor | Unified audit trail across team-mode and pool-routed reviews; multi-model attribution preserved end-to-end |

---

## 3. Terminology

This PRD inherits all terminology from `multi-model-review.md` §3 (proposer, native reviewer, external reviewer, aggregator, adapter agent, orchestrator agent, canonical finding, consensus badge, strict mode, capability tier, context bundle). New terms specific to this PRD:

| Term | Definition |
|------|------------|
| **Standing pool** | A Synthex+ review team created with `standing: true` that idles indefinitely after spawning, claiming work from its task list as it arrives. Survives across multiple host sessions submitting tasks — including across the original spawning session ending — until TTL fires or it is manually stopped (see "Pool lifetime" below). Distinct from a non-standing team, which is created per-invocation and shuts down when its task list empties. |
| **Pool lifetime** | Pools are **host-machine-bound, not spawning-session-bound**. A pool spawned by session A continues running after session A exits, and is discoverable and routable by session B in the same Claude Code workspace on the same host. Pools die only on TTL expiry (lazy, see below), explicit `/stop-review-team`, or host-level events that take their teammate processes down (host reboot, OS-level kill of the Claude Code process tree). |
| **Pool roster** | The set of Synthex teammates spawned into a standing pool when it was created (e.g., `code-reviewer + security-reviewer`). Fixed at spawn time; cannot be expanded after the pool is running (changing roster = stop and recreate). |
| **Pool Lead** | The team Lead instance running inside a standing pool. Functionally identical to the Lead of any Synthex+ review team (`team-review.md` Lead role), but its lifecycle is bound to the pool, not to a single invocation. When multi-model mode is active on the pool, the Pool Lead's natural consolidation responsibility is suppressed (see FR-MMT4 "Lead role under multi-model"). |
| **Pool TTL** | The configurable idle-time threshold after which a standing pool becomes eligible for shutdown. "Idle" = task list has been continuously empty (no `pending` or `in_progress` tasks) for the threshold duration. Default: 60 minutes. Resets every time the pool claims a new task. **TTL enforcement is lazy** — see below. |
| **Lazy TTL** | TTL expiration does NOT trigger an automatic wall-clock shutdown. Instead, eligibility for shutdown is checked only when a discovery-bearing operation runs (`/list-teams`, any standard Synthex command performing pool routing per FR-MMT15). This means a pool whose nominal TTL has elapsed continues to run — and remains routable — until the next discovery event observes it. Users should treat the TTL as "earliest time the pool may be reaped on next discovery," not as a guaranteed shutdown deadline. The lazy choice is documented in FR-MMT13. |
| **Pool state** | A coarse runtime classification of a pool's behavior, recorded in `config.json` and surfaced in `/list-teams`. Values: `idle` (no tasks pending or in-progress), `active` (tasks pending or in-progress), `draining` (TTL fired or shutdown requested while in-flight tasks remain; rejecting new submissions), `stopping` (shutdown signal sent, awaiting confirmation). Required field on every standing pool's `config.json` (see FR-MMT7, FR-MMT14a). |
| **Pool routing** | The discovery-and-dispatch convention by which standard Synthex commands locate a matching standing pool and submit work to it instead of spawning fresh sub-agents. |
| **Prefer-with-fallback** | The default routing semantics: use a matching standing pool when one exists; spawn fresh sub-agents silently when none exists or the pool's roster doesn't cover the command's required reviewers. Never an error. |
| **Native team** | A full Synthex+ review team running inside `/synthex-plus:team-review` — a Lead plus the configured reviewer teammates, all spawned via the `Teammate` API in the host session. Distinct from "native reviewer," which refers to a single Synthex sub-agent. The "native team" is the entity Feature A's orchestrator runs *alongside*. |
| **Native reviewer** | A single Synthex sub-agent (e.g., `code-reviewer`, `security-reviewer`) — either spawned ephemerally by a standard Synthex command or running as a teammate inside a native team. Inherited from `multi-model-review.md` §3. |
| **Orchestrator (in this PRD)** | Always refers to `multi-model-review-orchestrator` from `multi-model-review.md`. The team Lead's coordination role (task decomposition, mailbox shepherding, FAIL-loop driving) is referred to as "Lead" or "Pool Lead" — never "orchestrator" — to keep the two roles distinguishable. |
| **Two-consolidation-surfaces resolution** | The rule that when multi-model is active in `/team-review`, the orchestrator's pipeline produces the single canonical unified report; the team's natural mailbox-driven enrichment continues but does not produce a competing consolidated output. (Full rationale in FR-MMT4.) |
| **Native enrichment** | The cross-domain mailbox messages already produced by `/team-review` reviewers today (e.g., Code Reviewer flags a SQL injection to Security Reviewer). These add per-finding context. They are preserved and incorporated into the canonical schema by the orchestrator but do not replace the consolidation pipeline. |
| **Canonical consolidation** | The four-stage dedup + severity-reconciliation + CoVe pipeline defined in `multi-model-review.md` FR-MR14 (canonical consolidation pipeline). Owned by the multi-model-review-orchestrator. Always the single source of truth for the unified review report when multi-model mode is active. |

---

## 4. Functional Requirements

### 4.1 Core Architecture

**FR-MMT1: Two-feature scope, one PRD**

This PRD defines two features (multi-model team review, standing review pools) that share architectural surface, configuration namespace, and the team-side contracts both features depend on. Neither feature requires the other in v1, but both enabled together is the highest-leverage configuration and is treated as the recommended setup for power users.

**Acceptance Criteria:**
- Feature A works without Feature B (multi-model on a fresh per-invocation team — same as `/team-review` semantics today plus externals)
- Feature B works without Feature A (standing pool of native-only reviewers servicing standard commands)
- Feature A + Feature B works (standing pool advertises multi-model, standard commands routed to it get the multi-model lift automatically)

**FR-MMT2: Dependency on `multi-model-review.md` shipping first**

This PRD assumes the orchestrator agent (`multi-model-review-orchestrator`), the canonical finding schema (FR-MR13), the consolidation pipeline (FR-MR14), and the first-class adapter set (FR-MR10) from `multi-model-review.md` are in place. Feature A reuses them verbatim; Feature B does not depend on them but is implemented in the same release window for thematic coherence.

**Acceptance Criteria:**
- The implementation plan derived from this PRD sequences `multi-model-review.md` work as a prerequisite milestone
- If `multi-model-review.md` is descoped or delayed, Feature B can ship independently as a smaller release; Feature A blocks on it

**FR-MMT3: Multi-model in `/team-review` — orchestrator-beside-the-team (Option B)**

When `/team-review` is invoked with multi-model enabled (master switch on, per-command override on, or `--multi-model` flag), the command:

1. Creates the standard native review team **as today** — no changes to teammate roles, the read-on-spawn pattern, the cross-domain mailbox conventions, or the team's natural consolidation flow.
2. **In addition**, instantiates the `multi-model-review-orchestrator` (from `multi-model-review.md`) in the host session, alongside the team. The orchestrator does not become a teammate; it runs as an agent in the host context with access to the team's filesystem-based state (task list, mailboxes).
3. The orchestrator does its standard external-CLI fan-out (FR-MR12) — invokes each enabled adapter agent via the Task tool, which shells out to the external CLI via Bash from the host session.
4. **In parallel**, the team executes its review tasks normally — reviewers claim tasks, produce findings in their standard Synthex output formats, send them to the team Lead via mailbox, and send cross-domain alerts to each other via mailbox.
5. The orchestrator pulls native teammate findings out of the team's task list (completion notes) and mailbox (lead-bound finding messages), normalizes them to the canonical finding schema (FR-MR13), and combines them with the externals' findings.
6. The orchestrator runs its standard consolidation pipeline (FR-MR14 stages 1, 2, 4, 5, 6 — Stage 3 semantic dedup is included if an embedding source is available, same as `multi-model-review.md`). Severity reconciliation and CoVe verification operate over the combined finding set.
7. The orchestrator produces the **canonical unified report** (matching the `## Code Review Report` format documented in `multi-model-review.md` FR-MR21) and posts it back to the team Lead's mailbox.
8. The team Lead surfaces the canonical report as the team's review output — replacing what would otherwise be the team's natural consolidation output. The team Lead's role becomes: receive consolidated report, present to caller, drive the FAIL re-review loop.
9. An audit artifact is written to `docs/reviews/` (configurable via `multi_model_review.audit.output_path`) per FR-MR24, with team-specific extensions documented in FR-MMT22.

**Why Option B over Options A and C:**

- **Option A — adapter agents become teammates.** Rejected. Adapters are one-shot Haiku wrappers in `multi-model-review.md`; making them long-lived teammates would force them to learn the Synthex+ team contract (mailbox conventions, task-list semantics, lifecycle hooks). That doubles their complexity for no gain — they still call CLIs, they still parse output, they still return one finding set per invocation. Keeping them one-shot preserves their architectural simplicity.
- **Option C — orchestrator becomes the team Lead.** Rejected. The orchestrator's job is consolidation — running the pipeline, performing severity reconciliation, doing CoVe verification on contradictions. The team Lead's job is workflow orchestration — task decomposition, progress monitoring, FAIL-loop management. Conflating the two creates a single-purpose Lead that loses the workflow-management capabilities of today's review Lead, AND would force every consolidation invocation to be wrapped in the spawn/teardown costs of a team Lead. Cleaner separation: Lead orchestrates the team, orchestrator orchestrates the multi-model pipeline.
- **Option B chosen.** Risk-isolated (the multi-model architecture from `multi-model-review.md` stays intact); adapters stay one-shot (no new contract surface for them); unambiguous ownership of the consolidation pipeline; predictable cost (one orchestrator invocation per `/team-review` call, identical to standard Synthex review); easiest migration path (Synthex+ teams unchanged, orchestrator unchanged, the new code is the bridge between them).

**Acceptance Criteria:**
- Native team is created identically to today's `/team-review` invocation, regardless of multi-model state
- The orchestrator runs in the host session, not as a teammate (no `Teammate` API spawn for the orchestrator)
- Adapter agents are unchanged from `multi-model-review.md` — invoked via Task tool, one-shot, never spawned into the team
- Native findings are read from the team's task list completion notes and mailbox messages — the team is not asked to alter how it produces findings
- The orchestrator's consolidation pipeline runs exactly once per `/team-review` invocation (or once per FAIL re-review cycle, same as today)
- The unified report posted to the team Lead's mailbox follows the canonical `## Code Review Report` shape from `multi-model-review.md` FR-MR21
- When multi-model is disabled, `/team-review` produces a report matching the same schema as today's `/team-review` (same section headings per `templates/review.md`), written to the same default path, with the same set of native team artifacts created on disk (mailboxes, task list, audit artifact under `docs/reviews/` if previously enabled), and **no orchestrator agent spawned in the host session** (verified by a regression fixture asserting absence of any `multi-model-review-orchestrator` Task invocation in the trace)

**FR-MMT4: Two-consolidation-surfaces contract**

When multi-model mode is active inside `/team-review`, two consolidation-shaped activities happen, and the contract between them must be explicit:

1. **Native enrichment** — the team's existing cross-domain mailbox traffic. Code Reviewer flags an SQL injection to Security Reviewer; Security incorporates the tip; Design flags a hardcoded color to Code Reviewer who references it as a code-quality concern. This is the value-add of `/team-review` over `/review-code` and it continues to operate.
2. **Canonical consolidation** — the orchestrator's four-stage pipeline plus severity reconciliation and CoVe. This is the source of truth for the unified review report.

**The contract:**
- Native enrichment runs **first** (during the team's normal review execution).
- The orchestrator collects findings **after** native enrichment has produced its enriched per-reviewer findings (i.e., after each native reviewer has marked its task complete and sent its findings to the Lead).
- The orchestrator's input findings therefore carry the cross-domain context already embedded in their `description` and `evidence` fields — Security's finding now includes "Code Reviewer flagged this; verified" if applicable. The orchestrator does not need to know about cross-domain messaging as a first-class concept; the messages have already done their work.
- The orchestrator's output is the unified report. The team's natural consolidation (the Lead writing its own consolidated report) is **suppressed** when multi-model is active — there is exactly one consolidated report, and it comes from the orchestrator. The Lead's role shifts to "publish the orchestrator's report" rather than "produce a consolidated report."

**Why this matters:** Without an explicit contract, two failure modes appear: (a) two competing consolidated reports surface to the user (one from the team Lead, one from the orchestrator), creating confusion about which is authoritative; (b) the orchestrator over-counts findings because it consumes the Lead's already-consolidated report alongside per-reviewer findings, double-counting issues that were merged at the team level. The contract eliminates both by giving the orchestrator a clean read of per-reviewer findings (post-enrichment, pre-Lead-consolidation) and a single output destination.

**Suppression mechanism (spawn-time, not runtime):**

Suppression is implemented at team spawn, not detected at runtime by the Lead. When `multi_model: true` for a team (per-invocation flag, per-team `multi_model` config in a standing pool's `config.json`, or `multi_model_review.per_command.team_review.enabled: true`):

1. The `team-review` command (or `start-review-team` for a multi-model standing pool) augments the team Lead's spawn prompt with an explicit conditional block that **replaces** the natural consolidation step. The replacement instruction is, verbatim:

   > "Multi-model mode is active for this team. Do NOT produce your own consolidated review report. After all native reviewers' tasks reach `completed` status, wait for a message of type `orchestrator-report` in your mailbox at `~/.claude/teams/<team-name>/inboxes/lead/orchestrator-report-*.json`. When it arrives, surface its `report` field as the team's review output to the calling caller (and, in standing-pool mode, write the report to the requesting command's `report-to` path). Do not edit, summarize, or re-rank the orchestrator's report content."

2. This is a single conditional in the spawn prompt template (`templates/review.md` and `team-review.md`'s spawn block), inserted only when `multi_model` is truthy. Implementation pattern: a templated `{{#if multi_model}}…{{/if}}` block in the Lead's spawn prompt, similar to how `team-review.md` already conditionally includes review-template guidance.

3. **Race-free guarantee:** Because suppression is in the spawn prompt, the Lead never executes the natural consolidation code path under multi-model mode — there is no race between Lead consolidation and orchestrator report arrival. The Lead simply waits.

4. **Verifiability:** The chosen mechanism is testable by inspecting the spawn prompt at team-creation time (Layer 1 schema test) and by asserting in a behavioral fixture (Layer 2) that the Lead's mailbox contains exactly one consolidated report (the orchestrator's), not two.

**Lead role under multi-model:**

When multi-model is active, the team Lead's responsibilities split into three categories:

| Responsibility | Status under multi-model | Notes |
|----------------|--------------------------|-------|
| Task decomposition | **Kept** | Lead still partitions the review into per-reviewer tasks at team start |
| Native enrichment shepherding (mailbox traffic between reviewers) | **Kept** | Cross-domain messages between reviewers continue; Lead routes them as today |
| Progress monitoring (track `pending` → `in_progress` → `completed`) | **Kept** | Lead still drives task list state machine |
| Stuck-task detection and re-assignment | **Kept** | `lifecycle.stuck_task_timeout_minutes` still applies |
| FAIL re-review loop (orchestrating fix-and-re-review cycles) | **Kept** | Lead drives the cycle; each cycle re-invokes the orchestrator (FR-MMT21 step 9) |
| Producing own consolidated review report | **Suppressed** | Replaced by waiting for orchestrator-report message |
| Final-output role to caller | **Changed: pass-through** | Lead surfaces orchestrator's report verbatim; no editing or re-ranking |

This table is normative — implementations must preserve "Kept" responsibilities and must not have the Lead execute "Suppressed" code paths under multi-model mode.

**Acceptance Criteria:**
- The team Lead does NOT produce its own consolidated report when multi-model is active — it consumes the orchestrator's output
- The Lead's spawn prompt is augmented with the multi-model suppression block when (and only when) `multi_model: true`; verifiable by inspecting the prompt
- The orchestrator reads per-reviewer findings from each reviewer's mailbox-bound message to Lead, not from any Lead-side aggregation
- Cross-domain mailbox messages between reviewers are part of native enrichment and influence the per-reviewer findings the orchestrator consumes; the orchestrator does not separately consume the cross-domain messages
- A documented sequencing check ensures the orchestrator does not begin consolidation until all native review tasks have reached `completed` status (mirrors today's team consolidation gate)
- The unified report visibly attributes each finding to its source reviewer (e.g., "Security Reviewer (native team) + GPT-5 (Codex)")
- All "Kept" Lead responsibilities continue to function under multi-model mode (verified by behavioral fixture asserting cross-domain enrichment messages still flow)

**FR-MMT5: Standing pool lifecycle model**

A standing pool is a Synthex+ team created with `standing: true`. Its lifecycle differs from a non-standing team in three places:

1. **Spawn.** Created explicitly by the user via `/synthex-plus:start-review-team` (FR-MMT9). User specifies a name (default `review-pool`), reviewer roster (default `code-reviewer, security-reviewer` matching `code_review.reviewers` from standard Synthex defaults), and optionally `--multi-model` to enable Feature A semantics on the pool.
2. **Idle.** When the pool's task list empties, the TeammateIdle hook reports "no work" and the Pool Lead does NOT initiate shutdown. Teammates idle indefinitely. The TTL clock starts ticking from the moment the task list empties (the `pool_state` transitions to `idle`).
3. **Shutdown.** Triggered by: (a) **Lazy TTL expiration** observed by a discovery operation (default: 60 idle minutes; see FR-MMT13 — TTL is NOT a wall-clock auto-shutdown), (b) explicit `/synthex-plus:stop-review-team` invocation, (c) host-level events that take the pool's teammate processes down (host reboot, OS-level kill of the Claude Code process tree, manual `kill` of the relevant teammate processes). The pool is NOT shut down by transient task-list-empty events between work submissions, AND the pool is NOT shut down merely because the host Claude Code session that originally spawned it has exited.

**Pool lifetime — cross-session semantics (FR-MMT5a):**

Standing pools are **host-machine-bound, not spawning-session-bound**. Concretely:

- A pool spawned by Claude Code session A continues running after session A exits.
- A new Claude Code session B started later on the same host, in the same workspace, discovers the pool via `~/.claude/teams/standing/index.json` and routes to it normally (FR-MMT15, FR-MMT16).
- The pool's teammate processes are owned by the spawning session's Claude Code process tree at OS level. If the host OS terminates that process tree (host reboot, user kills the original `claude-code` parent process), the pool dies and is reaped on next discovery (FR-MMT22 stale-pool path).
- This is the explicit choice: "host-machine-bound" lifetime is what makes the Iterative Loop Developer use case (pool host session + work session in parallel) and the cross-session iterative-loop persona work.

**Acceptance criteria for cross-session lifetime (FR-MMT5a):**
- A pool spawned by session A is discoverable via `/list-teams` in session B started after session A exits, provided session A's teammate processes have not been killed at OS level
- A pool spawned by session A is routable from session B (standard Synthex commands in session B see it via FR-MMT15 discovery and submit to it via FR-MMT16)
- When session A's teammate processes ARE killed at OS level (e.g., host reboot), the pool's index entry is reaped on next discovery via the FR-MMT22 stale-pool path, not flagged as a normal-shutdown event
- Session B can spawn a non-standing team (e.g., via `/team-review`) while a standing pool spawned by exited session A continues running, per the FR-MMT26 exemption (standing pools do not count toward the one-non-standing-team-per-session rule)

**Idle-hour identity drift mitigation (FR-MMT5b):**

Read-on-spawn (preserved per §8 Assumptions) means a pool teammate adopts its full Synthex agent identity once at pool spawn and holds it for the pool's entire lifetime. For pools that idle for hours (default `ttl_minutes: 60`; user-configurable up to `0` for indefinite), Claude Code auto-compaction may evict portions of the teammate's context, including the agent definition itself. To detect this without complicating the spawn path:

- Each pool teammate **unconditionally re-reads** its own agent file (e.g., `plugins/synthex/agents/code-reviewer.md`) before beginning review work on each newly-claimed task (transition from `idle` → `active`). No comparison is performed against the teammate's "current" understanding of its identity — post-compaction the teammate may not even retain a stable reference to compare against. The re-read itself is the fix: after compaction-evicted context is reloaded by the Read call, the teammate's effective agent definition is current. This is a single Read call; cost is negligible vs. a code review's typical token spend.
- The identity confirm step (the unconditional re-read) is part of the standing-pool variant of the review template (added to `templates/review.md` under a `{{#if standing}}…{{/if}}` block).

**Acceptance Criteria:**
- A pool created with `/synthex-plus:start-review-team` survives at least one full task cycle (task submitted, claimed, completed, task list empties) without shutting down
- TTL countdown begins when the task list transitions from non-empty to empty (and `pool_state` transitions to `idle`); it resets when a new task is added
- Pool teammates remain responsive (claim new tasks within their stuck-task timeout) for the entire pool lifetime
- The Pool Lead's shutdown logic distinguishes standing vs. non-standing teams via the `standing` flag in team config and skips the natural "shutdown when task list empties" path for standing pools
- A pool can be inspected at any time via `/synthex-plus:list-teams` (FR-MMT11)
- Pool teammates execute the identity-confirm step before beginning review work on each newly-claimed task (FR-MMT5b)

---

### 4.2 Configuration

**FR-MMT6: Configuration schema additions**

A new top-level section in `.synthex-plus/config.yaml` controls Feature B (standing pools). Feature A reuses the existing `multi_model_review` section from `.synthex/config.yaml` (per `multi-model-review.md` FR-MR5), with one team-specific extension: a per-command override key for `team_review`.

```yaml
# .synthex-plus/config.yaml — additions

standing_pools:
  # Master switch for standing pool functionality. When false, /start-review-team
  # and /stop-review-team and /list-teams are still available but pool routing
  # by standard Synthex commands does not occur. Default: false.
  enabled: false

  # TTL: minimum idle time before a standing pool becomes eligible for
  # shutdown via lazy enforcement. "Idle" = task list has been continuously
  # empty (no in_progress or pending tasks).
  #
  # Lazy enforcement: TTL expiry does NOT trigger an automatic shutdown.
  # Pools may live past their nominal TTL until the next discovery event
  # (a /list-teams call or any standard Synthex command performing pool
  # routing) observes the expiry and reaps the pool. See FR-MMT13 for the
  # full discovery-time cleanup contract.
  #
  # Default: 60 minutes. Set to 0 to disable TTL-based reaping entirely
  # (pool only stops via /stop-review-team or by host-level process death,
  # which is then reaped by stale-pool cleanup at next discovery).
  ttl_minutes: 60

  # Default name for /start-review-team when --name is not provided.
  default_name: review-pool

  # Default reviewer roster for /start-review-team when --reviewers is not
  # provided. Must be a list of Synthex agent names that match standard
  # Synthex's code_review.reviewers default to maximize routing matches.
  default_reviewers:
    - code-reviewer
    - security-reviewer

  # Default for whether to enable Feature A (multi-model) when starting a pool.
  # When true, /start-review-team without --multi-model still spawns with
  # multi-model enabled. When false, must pass --multi-model explicitly.
  default_multi_model: false

  # Storage namespace. Standing pools live under teams/standing/ to keep them
  # separate from per-invocation teams. Tasks live in tasks/standing/. Mailboxes
  # at teams/standing/<name>/inboxes/. These paths are NOT user-configurable
  # in v1 — they are part of the discovery convention.
  storage_root: ~/.claude/teams/standing
  tasks_root: ~/.claude/tasks/standing

  # Routing semantics:
  # - "prefer-with-fallback": when a matching pool exists, route to it; otherwise
  #   spawn fresh sub-agents (today's behavior). Silent fallback. Default.
  # - "explicit-pool-required": when a matching pool exists, route to it; when
  #   no matching pool exists, command aborts with a "no matching pool" error
  #   and a hint to run /start-review-team. For users who want to enforce
  #   pool usage and catch misconfigurations.
  routing_mode: prefer-with-fallback

  # Roster matching: when standard Synthex commands look for a pool, which
  # reviewers must be present in the pool roster for it to be considered a
  # match for the command's needs. "covers" = pool roster is a superset of
  # the command's required reviewers. "exact" = sets are equal. Default: covers.
  matching_mode: covers

# Per-command override added to multi_model_review section (in .synthex/config.yaml):
#
# multi_model_review:
#   per_command:
#     team_review:
#       enabled: true
#       strict_mode: false
#       # No complexity gate for /team-review — team invocations are already
#       # high-cost decisions, so users opt into the team explicitly. Adding
#       # multi-model on top is a binary opt-in.
#   audit:
#     # Per-finding attribution telemetry in the audit artifact (which reviewers
#     # raised which finding pre-consolidation). Default: true. Set to false to
#     # omit the `finding_attribution_telemetry` block (privacy-sensitive
#     # deployments). See FR-MMT30a for the full block schema.
#     record_finding_attribution_telemetry: true
```

**Cross-file config resolution mechanism:**

Two separate configuration files are involved, with two separate namespaces. The synthex-plus commands resolve them as follows:

1. For any key under `standing_pools.*`: read from `.synthex-plus/config.yaml` only. (Standing pools are a synthex-plus feature; this namespace does not appear in standard Synthex's config.)
2. For any key under `multi_model_review.*` (including `multi_model_review.per_command.team_review.*`): read from `.synthex/config.yaml` only. (Multi-model review is a standard Synthex feature; synthex-plus commands re-use the same resolution chain — they do NOT define their own copy of these keys.)
3. **No merge** between the two files. The two namespaces are disjoint by design. A synthex-plus command needing both reads each from its respective file independently.
4. **File-not-found handling:** If `.synthex/config.yaml` is missing entirely (project has not initialized standard Synthex), all `multi_model_review.*` lookups fall through to hardcoded defaults — i.e., multi-model is `enabled: false` and `/team-review` runs in native-only mode regardless of synthex-plus config. This is documented as a "synthex-plus assumes standard Synthex is also initialized for multi-model team review" precondition.

**Resolution order (within each namespace):** invocation flag (e.g., `--multi-model`) > `multi_model_review.per_command.team_review.<setting>` > `multi_model_review.<setting>` > hardcoded default. Identical chain to `multi-model-review.md` FR-MR5.

**Acceptance Criteria:**
- The `standing_pools` section is added to `plugins/synthex-plus/config/defaults.yaml` with all keys above and inline documentation
- The `team_review` per-command override is documented in `multi-model-review.md`'s config reference (or as part of this PRD's implementation, in the same defaults file)
- Resolution order is identical to `multi-model-review.md` and is documented at the section header
- Adding only `standing_pools.enabled: true` with no other changes spawns a usable default pool when `/synthex-plus:start-review-team` is invoked

**FR-MMT7: Per-pool configuration at spawn time**

Most pool configuration is set at spawn time via `/synthex-plus:start-review-team` flags rather than persisted in `config.yaml`. Reasons: pool roster is fixed for a pool's lifetime (changing it = stop and recreate); TTL may want to differ between sessions; multi-model enablement is a per-pool decision.

Flags that override `standing_pools` defaults at spawn time:
- `--name <name>` — overrides `default_name`
- `--reviewers <comma-separated list>` — overrides `default_reviewers`
- `--multi-model` / `--no-multi-model` — overrides `default_multi_model`
- `--ttl <minutes>` — overrides `ttl_minutes` for this pool

Once a pool is spawned, its configuration is recorded in its `~/.claude/teams/standing/<name>/config.json` and not re-read from `config.yaml` for the rest of the pool's lifetime. This prevents config drift mid-lifetime.

**Pool `config.json` schema (normative):**

```json
{
  "name": "review-pool",
  "standing": true,
  "reviewers": ["code-reviewer", "security-reviewer"],
  "multi_model": false,
  "ttl_minutes": 60,
  "spawn_timestamp": "2026-04-25T14:32:11Z",
  "host_pid": 12345,
  "host_session_id": "<opaque>",
  "last_active_at": "2026-04-25T14:32:11Z",
  "pool_state": "idle"
}
```

Field semantics:
- `pool_state` — one of `idle`, `active`, `draining`, `stopping` (per §3 Terminology). Required field on every pool. Updated by Pool Lead on state transitions; surfaced in `/list-teams` (FR-MMT11).
- `last_active_at` — ISO-8601 UTC timestamp of the most recent task claim or task list state change. Used by lazy TTL discovery (FR-MMT13) to compute idle minutes and by stale-pool detection (FR-MMT22) to identify pools whose host process is likely dead.

**Acceptance Criteria:**
- All four flags work and override the corresponding `standing_pools.*` setting for that invocation
- The pool's `config.json` records its effective configuration (resolved at spawn) for inspection by `/list-teams` and routing-discovery checks
- The pool's `config.json` includes a `pool_state` field, initialized to `idle` at spawn time, updated on state transitions
- The pool's `config.json` includes a `last_active_at` field, updated atomically on each task claim and on each transition to `idle`
- Editing `config.yaml` after a pool is running has no effect on the running pool — only on subsequently-spawned pools

---

### 4.3 Standing Pool Commands

**FR-MMT8: Three new commands in synthex-plus**

Three new commands are added to `plugins/synthex-plus/.claude-plugin/plugin.json`:

| Command | Purpose |
|---------|---------|
| `start-review-team` | Spawn a new standing review pool |
| `stop-review-team` | Gracefully shut down one or all standing pools |
| `list-teams` | List active teams (standing and non-standing) with status, TTL, roster |

Each is a markdown command file in `plugins/synthex-plus/commands/`, following the patterns established by `team-init.md` and `team-review.md`.

**FR-MMT9: `/synthex-plus:start-review-team`**

Spawns a standing review pool. Patterns mirror `team-init.md` for setup checks and `team-review.md` for team creation.

**Parameters:**

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `name` | Unique pool name | `standing_pools.default_name` (default `review-pool`) | No |
| `reviewers` | Comma-separated list of Synthex reviewer agent names | `standing_pools.default_reviewers` (default `code-reviewer,security-reviewer`) | No |
| `multi_model` | Enable Feature A on this pool | `standing_pools.default_multi_model` (default `false`) | No |
| `ttl_minutes` | TTL override for this pool | `standing_pools.ttl_minutes` (default 60) | No |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` | No |

**Workflow:**

1. **Pre-flight checks** — same as `team-init` Step 2-4 (Synthex dependency, experimental flag, orphan detection). Additionally, check that no standing pool with the requested name already exists at `~/.claude/teams/standing/<name>/`.
2. **Parameter resolution and defaults** — for any omitted parameter, fall back to the corresponding `standing_pools.*` config default silently (no prompt). Specifically: `--reviewers` omitted → `standing_pools.default_reviewers` (default `code-reviewer,security-reviewer`); `--name` omitted → `standing_pools.default_name`; `--ttl` omitted → `standing_pools.ttl_minutes`; `--multi-model` omitted → `standing_pools.default_multi_model`. The user-visible spawn confirmation (step 9) makes the resolved values explicit so silent-defaults are not invisible.
3. **Pool name validation.** The resolved `--name` value must match the regex `^[a-z0-9][a-z0-9-]{0,47}$` — i.e., 1–48 characters, lowercase ASCII alphanumeric and hyphens only, must start with a letter or digit. Matching is case-insensitive (`Review-Pool` and `review-pool` are the same name; the canonical form is lowercase). Reserved names that are rejected: `index`, `standing`, and any name beginning with `.` (these would collide with index/marker files in `~/.claude/teams/standing/`). Validation runs before any filesystem writes. On rejection, abort with: `"Pool name '<input>' is invalid. Names must be 1–48 lowercase alphanumeric characters and hyphens, starting with a letter or digit. Reserved: 'index', 'standing', and names beginning with '.'."`
4. **Roster validation** — verify each named reviewer corresponds to an existing Synthex agent file (e.g., `plugins/synthex/agents/code-reviewer.md`). Missing agents abort with a clear error.
5. **Multi-model preflight** — if `multi_model: true`, run the multi-model-review preflight (`multi-model-review.md` FR-MR20). Three outcomes:
   - **Pass cleanly:** continue to step 6.
   - **Hard error:** abort with the preflight's error message and exit code; no filesystem writes.
   - **Warning-level issue (e.g., only one external CLI configured, missing optional adapter):** display the warning text, then prompt: `"Multi-model preflight surfaced warnings. Continue spawning pool? [Y/n]"` (default `Y`). On `n`, abort cleanly without filesystem writes. On `Y` or empty, continue to step 6.
6. **Cross-session lock acquisition** — acquire `~/.claude/teams/standing/.index.lock` before any writes to `~/.claude/teams/standing/`. Lock semantics (FR-MMT9a): acquire via Bash atomic directory creation: `mkdir ~/.claude/teams/standing/.index.lock` (`mkdir` is atomic in POSIX; a non-zero exit when the directory already exists indicates contention — this is the agent-accessible primitive available through Claude Code's Bash tool). Release via `rmdir ~/.claude/teams/standing/.index.lock`. If acquisition fails (directory exists), wait up to 10 seconds with 100 ms polling between retries. If still held after 10 seconds, abort with `"Standing pool index is locked by another process. Wait a moment and retry, or — if a previous command crashed — remove the stale lock: rmdir ~/.claude/teams/standing/.index.lock"`. On acquisition, the spawn process holds the lock through steps 7–8 and releases on success or failure.
7. **Spawn the team** — use the `Teammate` API's `spawnTeam` operation, with team name `standing/<name>` (the `standing/` prefix is part of the team-name namespace, distinguishing it from per-invocation teams).
8. **Write pool metadata and update index atomically** — create `~/.claude/teams/standing/<name>/config.json` per the FR-MMT7 schema (initial `pool_state: idle`, `last_active_at` = spawn timestamp). Then update `~/.claude/teams/standing/index.json` to include the new pool's entry (write to `.index.json.tmp`, then `rename`). Release the lock from step 6.
9. **Idle the pool** — pool teammates spawn, perform read-on-spawn identity initialization, then sit idle waiting for tasks. The Pool Lead emits a "pool ready" message to the host session.
10. **Confirm to user** — display pool details (name, roster, multi-model status, TTL, storage paths) and the routing convention (which standard Synthex commands will now use this pool). Cost-warning trigger (per NFR-MMT2): if the spawning roster has 4 or more reviewers OR (2-3 reviewers AND `ttl_minutes > 240`), display a one-line cost advisory before the confirmation prompt.

**Pool roster scope (cross-reference to §6 Out of Scope):**

`/start-review-team` accepts any Synthex agent name as a roster member at spawn time — there is no agent allowlist at spawn. However, only review-shaped commands (FR-MMT15) check for matching pools. A pool spawned with a planning roster (e.g., `--reviewers tech-lead,architect,designer`) will run, but no standard Synthex command will route to it in v1; standing pools for non-review work are explicitly out of scope (§6). The pool will simply sit idle, then expire on TTL. This is documented but not enforced — users who want to experiment with planning-shaped pools may do so at their own risk.

**Acceptance Criteria:**
- A new pool is spawned and visible at `~/.claude/teams/standing/<name>/`
- The pool's teammates idle without consuming task-list resources (TaskList shows zero tasks; teammates respond to TeammateIdle hooks but do not initiate shutdown)
- The pool's `config.json` records all spawn-time configuration including `pool_state: idle` and `last_active_at`
- The standing-pool index file is updated atomically (write-to-tmp, rename) under the cross-session lock
- Pool name validation per the regex rejects invalid inputs before any filesystem writes
- Spawning a pool with a duplicate name aborts with a clear error and a hint to use `/list-teams` or `/stop-review-team`
- Spawning a pool with an invalid reviewer agent name aborts with a clear error
- When `multi_model: true`, multi-model preflight runs at spawn time so users see CLI/auth issues immediately, not on first task; warning-level results trigger a Continue prompt rather than silently proceeding
- Concurrent `/start-review-team` invocations from two sessions serialize via `.index.lock` and both succeed (sequential), or one aborts cleanly on lock-timeout

**FR-MMT9b: Standing-pool index entry schema**

`~/.claude/teams/standing/index.json` is the discovery source of truth for FR-MMT15 routing and FR-MMT22 stale-pool detection. Its entry schema is normative.

**Schema (normative):**

```json
{
  "pools": [
    {
      "name": "review-pool",
      "pool_state": "idle",
      "last_active_at": "2026-04-25T14:32:11Z",
      "metadata_dir": "~/.claude/teams/standing/review-pool"
    }
  ]
}
```

Field semantics:
- `name` — the pool name (matches the `name` field in the pool's `config.json`).
- `pool_state` — denormalized from the pool's `config.json.pool_state`. One of `idle`, `active`, `draining`, `stopping`. Required.
- `last_active_at` — denormalized from the pool's `config.json.last_active_at`. ISO-8601 UTC.
- `metadata_dir` — absolute path to the pool's metadata directory.

**Why `pool_state` and `last_active_at` are denormalized into the index:**

FR-MMT15 discovery filters on `pool_state` (skip `draining` / `stopping`) and `last_active_at` (TTL check). FR-MMT22 stale-pool cleanup filters on the same two fields. Without denormalization, every discovery operation would have to read each pool's `config.json` in addition to `index.json` — an extra N filesystem reads per discovery, breaking NFR-MMT3's "discovery completes in < 100 ms for up to 10 pools" target on slow filesystems. Denormalization keeps discovery to a single read.

**Pool Lead's dual-write responsibility:**

On every state transition (`idle` ↔ `active`, `* → draining`, `* → stopping`) AND on every `last_active_at` update (per FR-MMT12 writer-ordering rules), the Pool Lead writes BOTH:
1. The pool's own `~/.claude/teams/standing/<name>/config.json` (atomic `.tmp` + rename).
2. The corresponding entry in `~/.claude/teams/standing/index.json` (acquire `.index.lock` per FR-MMT9a, atomic `.tmp` + rename).

The dual-write is sequenced config.json first, index.json second — if the writer crashes between them, the pool's own config has the truth and the next discovery operation will reconcile the index from the pool's config (or treat the index as the cache, with the pool's config as the source of truth for any disagreement).

**Acceptance Criteria:**
- `index.json` entries conform to the schema above; Layer 1 schema test validates each entry
- Pool Lead writes both `config.json` and `index.json` on every state transition and every `last_active_at` update
- Discovery operations (FR-MMT15, FR-MMT22) read only `index.json` for filtering — no per-pool `config.json` reads required for the filter step
- If `index.json` and a pool's `config.json` disagree on `pool_state` or `last_active_at`, the pool's `config.json` is treated as canonical and the index is updated to match on next discovery

**FR-MMT10: `/synthex-plus:stop-review-team`**

Gracefully shuts down standing pools.

**Parameters:**

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `name` | Pool name to stop | (interactive prompt if not provided) | No |
| `all` | Stop all standing pools | `false` | No |
| `force` | Skip in-flight task warning | `false` | No |

**Workflow:**

1. **Resolve target pools.** If `--all`, target all entries in `~/.claude/teams/standing/index.json`. If `--name`, target the specified pool (error if not found). If neither: display the standing-pools section of the `/list-teams` output (per FR-MMT11 table format — Name, Roster, Multi-Model, Tasks, Idle, TTL Remaining, State columns), then use `AskUserQuestion` with the verbatim prompt: `"Which pool would you like to stop? Enter pool name or 'cancel' to abort:"`. The user types the pool's name (case-insensitive match per FR-MMT9 step 3) or `cancel`. On `cancel` or empty input, abort cleanly with no changes. On unrecognized name, re-prompt up to 2 times before aborting with `"No pool by that name. Aborting."`.
2. **In-flight task check.** For each target pool, check whether any tasks are `in_progress`. If yes and `--force` not set, prompt the user: "Pool {name} has N in-progress tasks. Stop now will leave them in-progress; teammates won't get a chance to send results back to callers. Stop anyway? [y/N]"
3. **Send shutdown signal.** For each pool, send a `SendMessage` to the team Lead with type `shutdown` and reason "user requested via /stop-review-team". The Lead is responsible for orderly teammate dismissal and resource cleanup.
4. **Wait for shutdown confirmation.** Wait up to 30 seconds for the team's metadata directory at `~/.claude/teams/standing/<name>/` to be cleaned up. If the pool is still finishing in-flight tasks when the 30-second window elapses, emit (verbatim): `"Pool '{name}' is still finishing in-flight tasks. Run /list-teams to see remaining task count, or re-run /stop-review-team --name {name} --force to terminate immediately."` Then continue to step 5 (the index entry is removed regardless; the metadata directory will be cleaned up by the pool's draining process or by stale-pool cleanup at next discovery). If the timeout fires AND no in-flight tasks are visible (likely a crashed Pool Lead), force-cleanup: write a manual cleanup hint to the user with the directory paths.
5. **Update the index.** Remove the pool from `~/.claude/teams/standing/index.json`. Acquire `.index.lock` per FR-MMT9a, write `.index.json.tmp` with the pool entry removed, rename atomically, release the lock.
6. **Confirm to user.** Display per-pool status: stopped cleanly, force-stopped, or cleanup-needed.

**Acceptance Criteria:**
- `/stop-review-team` with no arguments lists active pools and prompts (does not silently stop anything)
- `/stop-review-team --all` stops every active standing pool
- `/stop-review-team --name <name>` stops only the named pool
- In-flight task warning is shown unless `--force` is set
- After successful shutdown, the pool is no longer findable via `/list-teams` or by routing-discovery
- Force-cleanup gives the user actionable manual-cleanup paths if automatic cleanup fails

**FR-MMT11: `/synthex-plus:list-teams`**

Lists all active teams (standing pools and non-standing per-invocation teams) with operational details.

**Parameters:** none.

**Workflow:**

1. **Enumerate non-standing teams** by scanning `~/.claude/teams/` for directories with `config.json` (excluding `standing/`).
2. **Enumerate standing pools** by reading `~/.claude/teams/standing/index.json` and verifying each entry's metadata directory exists.
3. **For each team, gather:** name, type (standing/non-standing), reviewer roster, multi-model status (yes/no, applicable for review teams), task-list summary (tasks pending/in_progress/completed), idle time (for standing pools: time since last claimed task), TTL countdown (for standing pools: ttl_minutes minus idle_minutes), `pool_state` (for standing pools: `idle`, `active`, `draining`, or `stopping` per §3 Terminology).
4. **Display** in a table sorted by type then name. Standing pools first.

```
Standing pools:
  Name           State     Roster                              Multi-Model  Tasks (pending/in-progress/completed)  Idle    TTL Remaining
  review-pool    idle      code-reviewer, security-reviewer    yes          0 / 0 / 47                              12 min  48 min
  bg-pool        draining  code-reviewer, security-reviewer    no           0 / 1 / 12                              0 min   0 min

Non-standing teams:
  Name              Roster                                                           Tasks                  Started
  review-a3f7b2c1   code-reviewer, security-reviewer, design-system-agent           1 / 0 / 0              2 min ago
```

The `State` column is the machine-readable representation of `pool_state`; `TTL Remaining` is always a number-of-minutes integer (or `0` when expired/draining/stopping). This split keeps the table parseable for CI usage — no overloading of the TTL column with strings.

**State value reference (table footnote, surfaced under the table in interactive output):**

- `idle` — no tasks pending or in-progress; available for routing.
- `active` — one or more tasks pending or in-progress; available for routing.
- `draining` — completing in-flight tasks before shutdown; not accepting new submissions. Clears within `lifecycle.stuck_task_timeout_minutes` (synthex-plus config; default ~10 minutes). Use `/stop-review-team --name {name} --force` to terminate immediately.
- `stopping` — shutdown signal sent, awaiting confirmation; will disappear from `/list-teams` shortly.

**Acceptance Criteria:**
- All active teams (standing and non-standing) are listed
- TTL countdown for standing pools is accurate within ±1 minute
- The `State` column appears for standing pools with one of the four documented values
- `TTL Remaining` is always an integer-of-minutes; never overloaded with state strings
- Output is parseable in CI (one row per team, consistent columns including `State`)
- An empty list (no active teams) displays a friendly message rather than an empty table

---

### 4.4 Pool Lifecycle and TTL

**FR-MMT12: Idle detection adapted for standing pools**

The `TeammateIdle` hook (described in `plugins/synthex-plus/hooks/teammate-idle-gate.md`) is updated to handle standing pools without modification to its interface. The hook checks whether the team is a standing pool (by reading `standing: true` from the team's `config.json`) and:

- If standing pool: report idle but do NOT trigger any dismissal logic. Update the pool's `last_active_at` timestamp in `config.json` (this is the basis for the TTL clock).
- If non-standing team: behavior unchanged from today (notify Lead, allow dismissal decisions).

**Writer-ordering for `last_active_at` (normative):**

Two writers update `last_active_at` on a standing pool:
- The Pool Lead, on every task claim (transition from `idle` → `active`).
- The TeammateIdle hook, on every idle event observed for a pool teammate.

To keep the timestamp monotonic and correct regardless of write interleaving, both writers use **`take max(existing, new)` semantics**: read the current `last_active_at` from `config.json`, compare against the writer's own proposed timestamp, and write the larger of the two. A Pool-Lead-observed task claim never gets clobbered by a slightly-earlier idle-hook timestamp landing later, and vice versa. The atomic write pattern is the same as elsewhere (`config.json.tmp` + `rename`).

**Acceptance Criteria:**
- The hook reads the `standing` flag from team config and branches behavior
- Standing pool teammates remain spawned even when their task list is empty for indefinite durations
- `last_active_at` is updated on each idle event, allowing the TTL watcher to compute idle time accurately
- Both Pool Lead writes and TeammateIdle hook writes use `max(existing, new)` semantics — `last_active_at` is monotonically non-decreasing under any write interleaving

**FR-MMT13: Lazy TTL enforcement**

V1 uses **lazy TTL**: there is no background daemon or wall-clock timer. A pool's nominal TTL elapsing does NOT itself trigger anything. Instead, every discovery-bearing operation (`/list-teams`, any standard Synthex command performing pool discovery per FR-MMT15) checks each indexed pool's `last_active_at` and, if `ttl_minutes > 0 AND idle_minutes > ttl_minutes`, performs a **two-step cleanup**. (The `ttl_minutes > 0` guard is essential: `ttl_minutes: 0` means "no TTL" and must never trigger reaping — otherwise an `idle_minutes > 0` pool would be reaped immediately on the first discovery after going idle.)

**Step 1 — classify the pool's process state by `last_active_at` staleness.**

- **"Probably alive"** — `last_active_at` is recent enough that the pool's idle hook has been running (specifically: `now - last_active_at < idle_hook_freshness_threshold`, where the threshold is **5 minutes, hardcoded in v1, irrespective of the underlying TeammateIdle hook polling interval**). Rationale: 5 minutes is roughly 2× the typical TeammateIdle hook polling cadence used by synthex-plus today (see `plugins/synthex-plus/hooks/teammate-idle-gate.md` — the hook is event-driven on Claude Code's TeammateIdle event rather than wall-clock-polled, so "polling interval" here is shorthand for the typical observed cadence between idle events for a teammate that has no work; 5 minutes provides a 2× safety factor against bursty idle-event arrival). Hardcoding the threshold keeps the staleness contract self-contained in this PRD and not coupled to future hook-implementation changes. The Pool Lead is reachable via mailbox.
- **"Probably dead"** — `last_active_at` is older than the freshness threshold. The teammate processes likely died (host process tree gone, OS killed, etc.) and no idle hook has run to update the timestamp.

**Step 2 — apply the matching cleanup path.**

- **Probably alive:** Discovery sends a `shutdown` message to the Pool Lead's mailbox at `~/.claude/teams/standing/<name>/inboxes/lead/shutdown-<timestamp>.json`. The Lead drains in-flight tasks per FR-MMT14 then exits. Discovery removes the pool from `~/.claude/teams/standing/index.json` (under `.index.lock` per FR-MMT9a).
- **Probably dead:** Discovery treats the pool as orphaned and applies the FR-MMT22 stale-pool cleanup path (remove the metadata directory and the index entry; emit one-line note per FR-MMT22). Do NOT attempt to send a shutdown message — the Lead's mailbox would only accumulate a message no one will read.

In both paths, discovery treats the pool as not-present for routing purposes (the routing decision falls back per `routing_mode`, FR-MMT17).

**Why lazy:** Simpler — no new daemon process, no scheduling primitive needed in Claude Code. Leverages the natural cadence of pool-using operations. The trade-off (a pool can outlive its nominal TTL until the next discovery event) is documented in §3 Terminology under "Lazy TTL" and surfaced to users in the `ttl_minutes` config comment.

**Acceptance Criteria:**
- TTL is configurable per pool via `--ttl` and globally via `standing_pools.ttl_minutes`
- A pool with `ttl_minutes: 0` is never reaped by the TTL path (only by `/stop-review-team` or by FR-MMT22 stale-pool cleanup)
- When a discovery operation observes an expired pool, it classifies the pool by `last_active_at` staleness and applies the corresponding cleanup path
- For a "probably alive" expired pool, discovery sends a shutdown message and the pool drains via FR-MMT14
- For a "probably dead" expired pool, discovery applies the FR-MMT22 stale-pool cleanup path; no shutdown message is sent
- In both paths, discovery silently does not route work to the expired pool (the routing decision treats it as not-present)
- The cleanup-on-discovery emits a one-line user-visible note: `"Pool {name} expired after {idle_minutes} min idle (TTL was {ttl_minutes}); cleaned up."` for the alive-path or `"Pool {name} appears stale (no activity for {idle_minutes} min); reaping orphan metadata."` for the dead-path

**FR-MMT14: TTL behavior with in-flight work**

If TTL fires (per FR-MMT13's discovery check) while a task is in-flight (`in_progress`), the pool is NOT immediately shut down. Instead:

1. The Pool Lead is notified of the TTL expiration with the in-flight task IDs (via shutdown message to its mailbox).
2. The Pool Lead transitions `pool_state` from `active` (or `idle`) to `draining` (per FR-MMT14a below) and waits for in-flight tasks to complete (subject to `lifecycle.stuck_task_timeout_minutes` from synthex-plus config).
3. After in-flight tasks complete (or time out and are force-stopped), the Pool Lead transitions `pool_state` to `stopping` and initiates orderly shutdown.

This protects against work loss when TTL happens to fire mid-task. The cost is that the pool can outlive its nominal TTL by up to `stuck_task_timeout_minutes` in the worst case. Acceptable trade-off for v1.

**Acceptance Criteria:**
- A pool with an in-flight task at TTL expiration completes the task before shutting down
- `pool_state` transitions to `draining` when shutdown begins with in-flight work, surfaced in `/list-teams` State column
- After drain completes, `pool_state` transitions to `stopping`, the pool shuts down, and is removed from the index

**FR-MMT14a: Pool draining state — submission semantics**

(Promoted from OQ-1 in cycle 1 review.) When `pool_state: draining`, the pool will not accept new tasks. The submission contract on the routing side (FR-MMT16) is:

1. **Submitter behavior:** Before writing a task to a pool's task list (FR-MMT16 step 1), the submitting command re-reads the pool's `~/.claude/teams/standing/<name>/config.json` and inspects `pool_state`. If `pool_state` is `draining` or `stopping`, the submitting command does NOT write to the pool's task list. Instead, it treats the pool as not-present for routing purposes and applies `routing_mode` per FR-MMT17 (silent fallback in `prefer-with-fallback`; abort in `explicit-pool-required`).
2. **Pool Lead behavior:** When the Lead transitions to `draining`, it updates `config.json.pool_state` atomically (write to `config.json.tmp`, rename) before processing any further mailbox messages. This ensures the visibility window between "I am draining" and "submitters know" is bounded by the time between submitter discovery checks (typically < 1 second).
3. **Race with discovery and the index:** Between a pool transitioning to `draining` and discovery removing it from the index, a submitter could see the index entry but read `pool_state: draining`. The check above handles this case explicitly — the submitter falls back, treating the pool as not-present.
4. **No "pool is draining" user message in submitting commands** in v1 — the silent fallback per `prefer-with-fallback` covers this case. Audit artifact (FR-MMT30) records the "would-have-routed-but-pool-was-draining" event for analytics.

**Acceptance Criteria:**
- A pool in `draining` state correctly rejects new submissions (the routing path falls back to fresh-spawn or aborts per `routing_mode`)
- The Pool Lead's transition to `draining` updates `config.json.pool_state` atomically before any further task processing
- Audit artifact records "pool-was-draining" as a routing-decision reason when applicable

---

### 4.5 Discovery and Routing

**FR-MMT15: Standard Synthex commands check for matching standing pools**

In v1, two standard Synthex commands gain a discovery step that checks for matching standing pools and routes review work to them when found:

- `/synthex:review-code` — routes the code review to a matching pool
- `/synthex:performance-audit` — routes the performance review to a matching pool

**v1 routing scope decision:** The original plan extended pool routing to seven commands. After cycle-1 review, v1 is scoped down to the two commands above — both of which use review-shaped reviewers (`code-reviewer`, `security-reviewer`, `performance-engineer`) that are the realistic standing-pool roster. The other five commands (`next-priority`, `write-implementation-plan`, `refine-requirements`, `write-rfc`, `reliability-review`) use planning-role reviewers (Architect, Designer, Tech Lead, SRE Agent, PM) that the default standing-pool roster (`code-reviewer, security-reviewer`) does not cover, so their pool-routing hit rate would be effectively zero. Adding routing logic to those four commands at v1 cost is unjustified given the actual hit-rate. They are listed below as **v2 extension points**:

| Command | v1/v2 | Required reviewer set (default) | Override sources |
|---------|-------|--------------------------------|------------------|
| `/synthex:review-code` | **v1** | `code-reviewer, security-reviewer` (from `code_review.reviewers` config in standard Synthex) | `--reviewers` flag at invocation; `code_review.reviewers` config |
| `/synthex:performance-audit` | **v1** | `performance-engineer` (static — see note below) | (none in v1 — set is hardcoded) |
| `/synthex:next-priority` | v2 extension | Varies by triggered work; review gate uses `code_review.reviewers` | n/a |
| `/synthex:write-implementation-plan` | v2 extension | `architect, designer, tech-lead` (planning roles) | `implementation_plan.reviewers` config |
| `/synthex:refine-requirements` | v2 extension | `product-manager, tech-lead, designer` | `refine_requirements.reviewers` config |
| `/synthex:write-rfc` | v2 extension | `architect, product-manager, tech-lead, security-reviewer` | n/a |
| `/synthex:reliability-review` | v2 extension | `sre-agent, terraform-plan-reviewer` (optional) | `reliability.reviewers` config |

**Required-reviewer-set computation (normative for v1):**

For each v1 command:
1. The required-reviewer-set is computed at invocation time per the resolution chain documented for that specific command:
   - **`/synthex:review-code`** — **dynamic per-invocation**: (a) the command's `--reviewers` flag if present, else (b) `code_review.reviewers` from `.synthex/config.yaml`, else (c) the command's hardcoded fallback set.
   - **`/synthex:performance-audit`** — **static**: hardcoded `[performance-engineer]`. As of v1, `/performance-audit` does not expose a configurable reviewer set (no `performance_audit.reviewers` config key in `plugins/synthex/config/defaults.yaml`; no `--reviewers` flag on the command — verified against `plugins/synthex/commands/performance-audit.md`). The discovery step uses the static set directly. If a future Synthex release introduces `performance_audit.reviewers` or a `--reviewers` flag, this PRD's resolution chain extends to mirror `/review-code`'s pattern; that is a v2 concern.
2. The discovery procedure (below) uses the resolved set as the "needs" side of the matching check against each pool's roster.

**Discovery procedure (executes once per command invocation):**

1. **Compute** the required-reviewer-set per the rule above.
2. **Read** `~/.claude/teams/standing/index.json` and filter to pools where `standing: true`, `pool_state` is not `draining` or `stopping`, and TTL has not expired (`now - last_active_at < ttl_minutes`). Pools failing the TTL check trigger the FR-MMT13 cleanup path inline.
3. **Apply matching mode** (from `standing_pools.matching_mode`):
   - `covers` (default) — pool's roster must be a superset of the required-reviewer-set
   - `exact` — pool's roster must equal the required-reviewer-set
4. **Among matching pools**, pick the first one (deterministic by name sort order). Multiple matching pools is unusual and not optimized for in v1.
5. **If a pool matches**, route to it (FR-MMT16). If no pool matches, apply routing mode (FR-MMT17).

**Acceptance Criteria:**
- Discovery runs at command-invocation time (not at session start) so newly-spawned pools become routable immediately
- The required-reviewer-set is computed per-invocation from the resolution chain above; verifiable by inspecting two invocations of `/review-code` with different `--reviewers` flags
- `covers` matching correctly identifies a pool with `code-reviewer + security-reviewer + design-system-agent` as a match for a command needing `code-reviewer + security-reviewer`
- Discovery is fast (< 100 ms for a project with up to ~10 standing pools, on local SSD) and does not require enumerating teammates
- Discovery does not modify any pool state — it only reads (the cleanup path it may trigger via FR-MMT13 is a separate write, gated by `.index.lock`)
- A pool whose TTL has expired is skipped in matching AND triggers cleanup (per FR-MMT13)
- A pool in `draining` or `stopping` state is skipped in matching (per FR-MMT14a)
- v1 routing is implemented for `/review-code` and `/performance-audit` only; the other five commands listed in the table are extension points and have no routing logic in v1

**FR-MMT16: Routing mechanism**

When a standard Synthex command routes work to a standing pool, it does so via the file-based mechanism that synthex-plus already uses for intra-team coordination:

1. **Submit task(s)** by writing to the pool's task list at `~/.claude/tasks/standing/<name>/`. Each task has the same shape as a non-standing review task: subject, description (with diff scope, files, specs, focus area per reviewer), no `blockedBy` (review tasks are independent). **Filename:** each submitted task uses a UUID-based filename `<uuid>.json` to guarantee uniqueness across concurrent submitters. **Atomicity:** write to `<uuid>.json.tmp`, then `rename` to `<uuid>.json` — a partial write is never visible to the Pool Lead.
2. **Send a notification** (optional, recommended) by writing to the Pool Lead's mailbox at `~/.claude/teams/standing/<name>/inboxes/lead/`. Filename `<uuid>.json` (same uuid as the task), atomic write per the same `.tmp` + rename pattern. The notification's payload: pool tasks just submitted, expected report destination.
3. **Specify report destination.** The submitting command writes a "report-to" path in the task description (recommended convention: `~/.claude/tasks/standing/<name>/reports/<uuid>.json` so the report-to path is also unique-per-submission). The Pool Lead, after consolidation (or — if the pool is multi-model-enabled — after the orchestrator finishes), writes the report envelope (below) to that path. The submitting command polls or watches the path for the report.
4. **Wait for completion.** The submitting command polls the task list (every 2 seconds, with backoff to a maximum of 10 seconds between polls) until all submitted tasks reach `completed` status (or `failed` per FR-MMT24, or the polling timeout fires per FR-MMT16a below). Then reads the report envelope from the report-to path.

**FR-MMT16a: Report envelope and polling timeout**

The report at the report-to path is **always a JSON envelope** with this top-level shape:

```json
{
  "status": "success" | "failed",
  "report": "<consolidated review report markdown>" | null,
  "error": {
    "code": "<one of: pool_lead_crashed, orchestrator_failed, drain_timed_out, ...>",
    "message": "<human-readable detail>"
  } | null,
  "metadata": {
    "pool_name": "<name>",
    "multi_model": true | false,
    "task_uuids": ["..."],
    "completed_at": "<ISO-8601 UTC>"
  }
}
```

- `status: "success"` ⇒ `report` is a non-null string, `error` is `null`. The submitting command surfaces `report` as it would surface a fresh-spawn review's output.
- `status: "failed"` ⇒ `report` is `null`, `error` is non-null. The submitting command treats this as a pool-routing failure and applies FR-MMT24 per-task fallback (re-spawn the failed reviewer's equivalent native sub-agent).

**Atomicity:** The Pool Lead writes the envelope to `<report-to>.tmp` then `rename`s — partial writes are never visible to the polling submitter.

**Polling timeout:** The submitting command polls for at most `lifecycle.submission_timeout_seconds` (default `300` = 5 minutes; settable in `.synthex-plus/config.yaml` under `lifecycle.submission_timeout_seconds`). If the timeout fires before all submitted tasks reach `completed` or before the report envelope appears, the submitting command:
1. Marks the pool task(s) as `abandoned` (a new task status) so the Pool Lead can detect and stop work on them.
2. Treats the routing as a pool failure and applies the FR-MMT24 per-task fallback path.
3. Emits a one-line user-visible note: `"Pool '{name}' did not return a report within {timeout}s; falling back to fresh-spawn review."`

**Why explicit timeout:** Without it, three failure modes produce indefinite hangs: (a) Pool Lead crashes after marking tasks `completed` but before writing the report; (b) orchestrator fails inside a multi-model pool; (c) the host process tree owning the pool dies between submission and completion, leaving tasks `in_progress` forever.

**Acceptance Criteria:**
- Tasks submitted to a standing pool are picked up within the standard idle-poll interval (verified via fixture)
- Tasks and mailbox messages use UUID filenames written with the `.tmp` + rename atomic pattern
- The report-to path mechanism allows multiple sessions to submit concurrent work to the same pool without report collision (each session's submission uses a unique uuid-based report-to path per FR-MMT16 step 3)
- The submitting command waits gracefully — does not race past task submission to read a report that doesn't exist yet
- The submitting command times out after `lifecycle.submission_timeout_seconds` and falls back per FR-MMT24
- The report envelope shape is enforced (Layer 1 schema test) and the submitter handles both `status: success` and `status: failed`
- The route-to-pool path is functionally equivalent to the spawn-fresh-sub-agents path: same report shape, same FAIL semantics, same caller experience modulo timing

**FR-MMT17: Prefer-with-fallback semantics**

When `standing_pools.routing_mode: prefer-with-fallback` (default):

- **Pool exists and matches** → route to pool (per FR-MMT16). User-visible note (verbatim): `"Routing to standing pool '{name}' (multi-model: {yes|no})."` The `(multi-model: yes|no)` suffix surfaces the pool's effective multi-model status to users who specifically configured the pool for multi-model lift; it answers "am I getting the multi-model review I think I'm getting?" without requiring a separate `/list-teams`.
- **No pool exists OR no matching pool exists** → spawn fresh sub-agents (today's behavior — same artifacts, same path, same report shape). No user-visible note (silent fallback per persona expectation; audit artifact records the decision per FR-MMT30).

When `standing_pools.routing_mode: explicit-pool-required`:

- **Pool exists and matches** → route to pool. Same notification as above.
- **No pool exists OR no matching pool exists** → abort with this verbatim error message (substituting concrete reviewer list):

  ```
  No standing pool matches the required reviewers (code-reviewer, security-reviewer).
  Routing mode is 'explicit-pool-required', so this command will not fall back to
  fresh-spawn reviewers. To proceed, either:
    1. Start a matching pool:
         /synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer
    2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
  ```

  The example uses the actual `--reviewers` flag (not `{reviewer_list}` placeholder) and shows the value comma-joined to match the `/start-review-team` flag format.

**Per-invocation routing flags during the wait for ad-hoc routing controls:**

In v1, no `--use-pool` / `--no-use-pool` flags are added to standard Synthex commands (per OQ-2's recommendation: revisit only if users complain). Routing mode is set via config only.

**Why the choice:** `prefer-with-fallback` is the default because it's the friendliest for users who haven't fully adopted standing pools — they get the speedup when a pool happens to be running and seamless behavior when it isn't. `explicit-pool-required` is for users who want pools to be load-bearing (e.g., they've configured pools to use multi-model and don't want the silent fallback to mask that they're getting native-only review).

**Acceptance Criteria:**
- Default mode silently falls back when no pool matches — no error, no spawn-blocking
- The pool-routing notification includes the `(multi-model: yes|no)` suffix verbatim
- `explicit-pool-required` mode aborts with the verbatim error message above (substituting the actual required reviewer list), and the message includes a runnable `start-review-team` command
- The `--use-pool` and `--no-use-pool` invocation flags are NOT added in v1 (per OQ-2)

**FR-MMT18: Race conditions are acceptable**

When two standard Synthex commands in different sessions submit tasks to the same standing pool concurrently, the file-based task list serializes the work naturally — the pool's reviewers process tasks in arrival order, one at a time per reviewer (or in parallel across reviewers as today's review teams do). The two sessions get their results back in non-deterministic order based on which finishes first.

**This is documented behavior, not a bug.** Users who want guaranteed parallelism across sessions should run multiple pools (e.g., `review-pool-a`, `review-pool-b`) and route to them differently. The pool primitive optimizes for amortized cost, not concurrent throughput.

**Acceptance Criteria:**
- Concurrent submissions to the same pool both complete successfully without lost work
- Each session receives the correct report for its own submission (report-to path isolation per FR-MMT16)
- Documentation in `start-review-team.md` and the new docs/standing-pools.md design doc calls out the race-condition semantics explicitly

---

### 4.6 Multi-Model Integration with `/team-review`

**FR-MMT19: `/team-review --multi-model` and `multi_model` parameter**

`/team-review` accepts a multi-model flag/parameter, mirroring the standard-Synthex `--multi-model` invocation override.

**Parameter shape:**

- Command parameter: `multi_model` (boolean) — overrides the master switch
- Resolution: `multi_model` parameter > `multi_model_review.per_command.team_review.enabled` > `multi_model_review.enabled` > `false`

When resolved to `true`, `/team-review` follows FR-MMT3 (orchestrator-beside-the-team). When resolved to `false`, behavior is byte-identical to today's `/team-review`.

**Acceptance Criteria:**
- `/team-review multi_model=true` enables multi-model for the invocation even if disabled in config
- `/team-review multi_model=false` disables multi-model for the invocation even if enabled
- Without the parameter, the resolved config value is used
- The team's behavior visible to teammates (read-on-spawn identity, mailbox conventions, task list usage) is identical regardless of multi-model state

**FR-MMT20: Native-reviewer structured-output contract for multi-model teams**

For the orchestrator to consume native team findings without per-reviewer ad-hoc parsing, native reviewers running inside a multi-model-enabled team produce a **structured JSON envelope alongside their existing markdown report** when they hand findings to the Pool Lead via mailbox. This is the chosen resolution to "how does the orchestrator turn natural-language reviewer markdown into canonical-schema findings": rather than maintain a Haiku normalizer per native reviewer (with associated drift, cost, and lossy extraction), we extend the native reviewers' output contract.

**Structured-output requirement:**

When a native reviewer (e.g., `code-reviewer`, `security-reviewer`, `design-system-agent`, `performance-engineer`) runs inside a team where `multi_model: true`, the team-side spawn prompt for the reviewer is augmented with this conditional clause (verbatim):

> "This team is running in multi-model mode. When you send your findings to Lead, your mailbox message must include BOTH (a) your normal markdown review report AND (b) a JSON envelope conforming to the canonical finding schema (`multi-model-review.md` FR-MR13). The JSON goes in the message's `findings_json` field; the markdown goes in the message's `report_markdown` field. The JSON must include every finding from your markdown report — no summary, no truncation. If you would mark this review PASS, send an empty `findings` array."

The conditional clause is added to `templates/review.md` under a `{{#if multi_model}}…{{/if}}` block (a single change to one template file).

**Agent-side change scope (normative):**

To minimize blast radius and preserve the byte-identical-when-disabled property of standard `/synthex:review-code`, the structured-output contract is implemented as a **template-only change**, NOT as edits to the underlying agent definition files.

(a) **Files changed.** Only `plugins/synthex-plus/templates/review.md` is modified — the conditional clause above is added under a `{{#if multi_model}}…{{/if}}` block. The four v1-supported reviewer agent files (`plugins/synthex/agents/code-reviewer.md`, `security-reviewer.md`, `design-system-agent.md`, `performance-engineer.md`) are **NOT modified by this PRD.** The template overlay is sufficient because synthex-plus already injects template-level instructions into a teammate's spawn prompt; the JSON envelope clause uses the same injection mechanism.

(b) **Conditional emission.** The JSON envelope is emitted **only** when `multi_model: true` is resolved for the team in which the reviewer is running (per FR-MMT4 / FR-MMT19 resolution chain). When a reviewer is invoked outside a multi-model team — including standalone `/synthex:review-code` invocations and any `/team-review` invocation with multi-model disabled — the template's conditional block is not rendered, and the reviewer produces its standard markdown report only. This preserves byte-identical behavior of standard Synthex review commands as they exist today.

(c) **Cross-reference.** The `findings_json` envelope IS the canonical finding schema defined in `multi-model-review.md` FR-MR13 — this PRD does not introduce a new shape. The orchestrator-side bridge (rules below) is the same canonical-schema consumer that `multi-model-review.md` FR-MR16 already specifies for external adapters; the only difference is the source (`source_type: "native-team"` vs. `"external"`).

(d) **Schema-test acceptance scope.** Layer 1 schema tests for the structured-output contract validate the **rendered spawn prompt** of a multi-model-team reviewer (assert presence of the JSON envelope clause) and the **mailbox message shape** of a reviewer's output under multi-model mode (assert `findings_json` parses and conforms to the canonical schema). Tests do NOT assert anything about the agent definition files in isolation, since those are unchanged by this PRD.

**Mailbox message shape under multi-model:**

```json
{
  "from": "code-reviewer",
  "to": "lead",
  "type": "review_findings",
  "report_markdown": "<full normal markdown report>",
  "findings_json": {
    "verdict": "PASS" | "WARN" | "FAIL",
    "findings": [
      {
        "finding_id": "<reviewer-assigned uuid or sequential id>",
        "severity": "critical" | "high" | "medium" | "low",
        "category": "<reviewer-specific category, e.g., 'security/sql-injection'>",
        "title": "<short title>",
        "description": "<full description>",
        "evidence": { "file": "<path>", "line_range": [start, end], "symbol": "<optional>", "snippet": "<optional>" },
        "source": { "reviewer_id": "code-reviewer", "family": "anthropic", "source_type": "native-team" }
      }
    ]
  }
}
```

The `findings` array conforms exactly to the canonical finding schema in `multi-model-review.md` FR-MR13 (canonical finding schema). The `source` field is populated by the reviewer itself; no orchestrator-side normalization is required for a well-formed message.

**Bridge rules (orchestrator side):**

1. **Source identification.** For each native reviewer in the team, the orchestrator reads the reviewer's mailbox message at `~/.claude/teams/<team-name>/inboxes/lead/<reviewer>-<timestamp>.json` and parses `findings_json.findings` directly. The reviewer's `report_markdown` is preserved separately for the audit artifact but is not parsed for findings.
2. **Validation.** The orchestrator validates each finding against the canonical schema. Findings missing required fields (`severity`, `title`, `description`) are flagged as malformed.
3. **Malformed-output handling.** If a reviewer's mailbox message is missing `findings_json` entirely, or if `findings_json` is not parseable JSON, the orchestrator follows the same one-retry-then-`parse_failed` pattern as external adapters per `multi-model-review.md` FR-MR16: send a clarification SendMessage to the reviewer asking for a re-send with the structured envelope; if the second attempt also fails, mark that reviewer's contribution as `parse_failed` and proceed with the consolidation pipeline using only the well-formed findings (audit artifact records the failure).
4. **Attribution preservation.** Each canonical finding's `source` field is preserved verbatim from the reviewer's output. Source-type is `native-team` (vs. `external` for external adapters).
5. **No information loss.** The bridge does not summarize, truncate, or filter findings; it only validates and forwards them into the consolidation pipeline.

**v1-supported reviewers (multi-model-team scope):**

The structured-output contract is added to these four reviewer agents in v1: `code-reviewer`, `security-reviewer`, `design-system-agent`, `performance-engineer`. Other Synthex reviewer agents do NOT yet have the structured-output contract.

**Pool-spawn-time validation:** When `/start-review-team --multi-model` is invoked, the roster is validated against the v1-supported set. If the roster includes any reviewer NOT in the supported set (e.g., `quality-engineer`, `sre-agent`), spawn aborts with: `"Multi-model mode is not supported for reviewer '<name>' in v1. Supported reviewers for multi-model pools: code-reviewer, security-reviewer, design-system-agent, performance-engineer. Either remove this reviewer from the roster, or omit --multi-model."` Same validation runs for `/team-review --multi-model`.

**Why structured contract over Haiku normalizer:** A normalizer per native reviewer would (a) require per-reviewer maintenance and risk drift as reviewer outputs evolve, (b) add Haiku-call latency to every multi-model team review, (c) introduce parsing failures as a class. Modifying the four supported reviewers' output to include a JSON envelope is a one-time template change with no recurring cost. The trade-off is that adding multi-model support to a new reviewer agent requires updating that agent's template — but this is a v2 concern and is documented as a future-work item.

**Acceptance Criteria:**
- Each of the four v1-supported reviewers produces a mailbox message with both `report_markdown` and `findings_json` when running in a multi-model team
- The orchestrator parses `findings_json` directly without per-reviewer normalization
- Every native reviewer's findings appear in the canonical-schema output, with attribution
- Findings from external reviewers and findings from native team reviewers are distinguishable by `source.source_type` (`external` vs `native-team`)
- Spawning a multi-model pool or running `/team-review --multi-model` with a roster outside the v1-supported set aborts with the documented error
- The bridge handles malformed/missing `findings_json` per the one-retry-then-`parse_failed` pattern
- A unit test verifies that each of the four v1-supported reviewers, given a sample input, produces a well-formed mailbox message with valid `findings_json`

**FR-MMT21: Consolidation flow inside `/team-review`**

Sequencing (after the team has been created and tasks have been submitted):

1. **Native reviewers run** — claim review tasks, perform review (with cross-domain mailbox enrichment per today's `/team-review` flow), produce findings in their standard output formats, send to Lead via mailbox, mark tasks complete.
2. **External reviewers run in parallel** — orchestrator invokes adapter agents in the host session (per FR-MR12). External adapters do their work without any visibility into the team — they receive the same context bundle (FR-MR28) as in standard Synthex multi-model review, just executed in parallel with the team's review work.
3. **Orchestrator waits** — for both (a) all native review tasks to reach `completed` status AND (b) all external adapter invocations to return (success, error, or timeout per their per-reviewer timeout).
4. **Orchestrator gathers** — pulls native findings via the bridge (FR-MMT20), gathers external findings from adapter return values, combines into one finding set.
5. **Orchestrator runs canonical consolidation** — Stages 1, 2, 4, 5, 6 from FR-MR14 (Stage 3 included if embedding source available), severity reconciliation per FR-MR14a, CoVe verification per FR-MR14 Stage 6, minority-of-one demotion per FR-MR14b. Same pipeline as `multi-model-review.md` — no team-specific divergence.
6. **Orchestrator emits unified report** — same `## Code Review Report` format as `multi-model-review.md` FR-MR21, with team-specific header indicating the team name and multi-model status:
   - `Review path: team + external multi-model (team: review-a3f7b2c1; reviewers: 2 native team + 2 external)`
7. **Orchestrator posts report** — writes the report to the team Lead's mailbox at `~/.claude/teams/<team-name>/inboxes/lead/orchestrator-report-<timestamp>.json`. Also writes audit artifact to `docs/reviews/` per FR-MR24 + FR-MMT22.
8. **Lead surfaces report to caller** — Lead's role becomes "publish the orchestrator's report" (per FR-MMT4 contract). No Lead-side consolidation.
9. **FAIL re-review loop** — same as today's `/team-review` FAIL loop (max cycles, fix-and-re-review, etc.) but each cycle re-runs both the native team review AND the orchestrator (external adapters + consolidation pipeline). **Quantified cost guidance:** each FAIL cycle invokes N adapter agents + 1 orchestrator consolidation pass, plus the native team's re-review. Expect roughly **2–3× the per-cycle token cost** of native-only `/team-review` FAIL cycles, depending on the number of configured external reviewers. With `review_loops.max_cycles: 3` (default), worst-case multi-model FAIL spend is ~6–9× a single multi-model team review's spend. Documented in `team-init` cost-guidance and `plugins/synthex-plus/docs/standing-pools.md`.

**Acceptance Criteria:**
- Native and external reviewers run in parallel — wall-clock time is `max(slowest native, slowest external)` not the sum
- The orchestrator does not begin consolidation until both native and external pools have completed
- The unified report is the only consolidated output — the team Lead does not produce a competing one
- FAIL re-review cycles re-run the orchestrator (consolidation is re-done on the new findings); this is documented
- An audit artifact is produced for every multi-model `/team-review` invocation, including failed-FAIL-loop completions

---

### 4.7 Failure Handling

**FR-MMT22: Pool unreachable / stale-pool cleanup**

A pool is detected as "stale" by either of two conditions during discovery:

1. **Metadata directory missing.** The index entry exists but `~/.claude/teams/standing/<name>/` is gone (e.g., user manually deleted it).
2. **Process likely dead.** The metadata directory exists but `last_active_at` has not been updated for longer than `max(ttl_minutes, 24h)` — the pool's idle hook has not run, suggesting the host process tree owning the teammate processes has died (host reboot, OS-level kill, parent Claude Code process exit).

**Cleanup procedure (single path for both detection conditions):**

1. Acquire `.index.lock` per FR-MMT9a.
2. Remove the index entry (atomic `.tmp` + rename on `index.json`).
3. If the metadata directory still exists, remove it (`rm -rf ~/.claude/teams/standing/<name>/`).
4. Release the lock.
5. **Emit a one-time-per-session user-visible warning** (not on every discovery): `"Standing pool '{name}' appears to have died unexpectedly (no activity for {idle_minutes} min). Cleaned up its metadata. If this happens repeatedly, check host process state or use /list-teams to inspect remaining pools."` Tracking the "one-time-per-session" guarantee is implementation-detail (e.g., a transient marker in the calling session's state); the goal is to avoid spamming the warning on repeated commands within the same session.
6. Continue with the routing decision per `routing_mode` (silent fallback in `prefer-with-fallback`; abort in `explicit-pool-required`).

**Resolution of "warn vs silent" question:** The warning is shown because pool disappearance under the user's feet is rare and surprising — silent cleanup would mask a real problem (e.g., the user accidentally killed their Claude Code process tree). The "once-per-session" suppression keeps the warning from becoming noise in CI loops. This is **not** the silent-fallback path used when no pool matches (which remains silent per FR-MMT17); this is the more-serious case where a pool *was* indexed but is now gone.

**Acceptance Criteria:**
- Stale index entries are detected and cleaned automatically when the metadata directory is missing OR `last_active_at` is older than `max(ttl_minutes, 24h)`
- Cleanup is atomic: index entry removed and (if present) metadata directory removed under the cross-session lock
- The user-visible warning fires at most once per session per stale pool detection
- The command continues without erroring (in `prefer-with-fallback` mode); aborts in `explicit-pool-required` mode if the cleanup leaves no matching pool

**FR-MMT23: Pool roster mismatch**

When a standard Synthex command needs a reviewer not in any standing pool's roster (e.g., needs `performance-engineer` but no pool includes it), the command treats this as no-matching-pool and applies routing_mode behavior. No partial routing — the command does NOT submit some tasks to the pool and spawn others fresh.

**Why no partial routing:** Splitting a single review across two execution surfaces (pool for some reviewers, fresh sub-agents for others) creates two consolidation surfaces, breaking the `/review-code` output contract. Acceptable as future work but not in v1.

**Acceptance Criteria:**
- A command with reviewer needs not covered by any pool either spawns all-fresh (prefer-with-fallback) or aborts (explicit-pool-required) — never partial-routes

**FR-MMT24: Pool crashed mid-task — per-task fallback recovery**

When a pool teammate fails mid-task (process death, context-window exhaustion, etc.), the Pool Lead detects the failure via the standard stuck-task timeout (`lifecycle.stuck_task_timeout_minutes`) and:

1. Marks the affected task as `failed` in the pool's task list with an error note.
2. Writes a `status: "failed"` report envelope (per FR-MMT16a) to the submitting command's report-to path, with `error.code: "reviewer_crashed"` and `error.message` naming the failed reviewer.
3. The remaining reviewers in the pool (if any) finish their tasks normally; their findings are preserved in the pool's task-list completion notes for the submitting command to pick up.

**Submitting command's recovery procedure:**

1. **Identify the failed reviewer.** From the report envelope's `error.message`, extract the reviewer agent name (e.g., `code-reviewer`).
2. **Spawn a fresh native sub-agent for that reviewer only** via the Task tool, exactly the same way the command would spawn the reviewer in non-pool mode (no pool routing path; this is a direct Task-tool invocation in the submitting command's host session). The sub-agent receives the same inputs (diff, files, focus area) the failed pool teammate had.
3. **Wait for the fresh sub-agent's findings.** The sub-agent returns its findings in its standard output format (markdown report). For multi-model-enabled flows, the sub-agent ALSO produces the structured `findings_json` envelope per FR-MMT20.
4. **Lightweight merge (NOT full re-consolidation).** The submitting command takes the pool's already-completed findings (from the other reviewers in the pool) and appends the fresh sub-agent's findings to that set. No re-running of the full consolidation pipeline (no re-dedup across native+external, no re-CoVe). The merge is a simple "extend the findings list" — the pool's other reviewers were already consolidated before the crash, so their consolidated state is preserved; only the failed reviewer's contribution is added fresh.
5. **Emit the unified report** with a clear indication of recovery:
   - In the report header: `"Review path: standing pool '{name}' (recovered: {failed-reviewer} fresh-spawned after crash)"`.
   - Per-finding `source` field for the recovered reviewer's findings: `source.source_type: "native-recovery"` (distinct from `native-team` and `external`) so the audit artifact distinguishes the recovery path.

**Scope clarification:** "Re-consolidate" in this context means the lightweight merge above — NOT a re-run of the full multi-model consolidation pipeline (FR-MR14). For multi-model pools, the original consolidation already ran on the pool's surviving reviewers + externals; only the failed reviewer's contribution is appended after recovery. This is acceptable because the failed reviewer's contribution would not have changed the dedup or severity-reconciliation outcomes for the rest of the findings (those are already final).

**Multi-model pool recovery — appended-finding dedup (normative):**

When the recovery path fires inside a multi-model pool, naively appending the recovery reviewer's findings to the already-consolidated output would re-introduce findings that were deduplicated against external reviewer findings in the original consolidation pass. To avoid duplicates while preserving the cost guarantee:

1. **Stage 1 (fingerprint dedup) and Stage 2 (lexical dedup within `(file, symbol)` buckets) of FR-MR14 are re-run** on the recovery reviewer's appended findings against the already-consolidated pool output. Findings from the recovery reviewer that match an existing consolidated finding (by fingerprint or lexical bucket) are merged into that finding's `source` array (gaining a `native-recovery` attribution alongside the existing `external` / `native-team` attributions) rather than emitted as a new entry.
2. **Stages 3–6 (semantic dedup, severity reconciliation, CoVe verification, minority-of-one demotion) are NOT re-run.** Those stages are scoped to the original consolidation pass and re-running them on a partial finding set would change outcomes for findings that are already finalized.
3. **Documented cost.** The Stage 1 + Stage 2 partial pass over the recovery reviewer's appended findings is roughly **5% of a full re-consolidation** (typical recovery contributes ~10–20 findings vs. the full set's ~100+; only fingerprint and lexical-bucket comparisons run; no LLM-call CoVe or severity reconciliation). This preserves the cost guarantee of FR-MMT24's "lightweight merge" framing.
4. **Native-only pools unaffected.** When a native-only pool (no multi-model) hits the recovery path, no external findings exist to dedup against, so the simple append from steps 1–5 above is sufficient. The Stage 1 + Stage 2 partial pass is only required for multi-model pools.

**Acceptance Criteria:**
- A teammate crashing mid-task does not cause the entire review to fail
- The fallback re-spawn happens only for the affected reviewer's task, via a direct Task-tool invocation in the submitting command's host session (not via pool routing)
- The fresh sub-agent's findings are merged into the pool's surviving findings using a simple append (no full re-consolidation)
- The user-visible report indicates which findings came from the pool, from externals (if multi-model), and from the recovery spawn (via `source.source_type` = `native-team` / `external` / `native-recovery`)
- Audit artifact (FR-MMT30) records the recovery event

**FR-MMT25: TTL fires while task in flight**

Already covered by FR-MMT14: in-flight tasks complete before shutdown.

**FR-MMT26: Conflict between standing pool and one-team-per-session rule**

Synthex+'s `/team-review`, `/team-implement`, `/team-plan`, and `/team-refine` all enforce a "one team per session" rule (per `team-implement.md:77-82` and the equivalent in other team commands). Standing pools must not break this rule — but they also can't be subject to it, or no Synthex+ session could simultaneously have a standing pool AND run a standard team command.

**Resolution:** the one-team-per-session check is updated to count only **non-standing** teams. Standing pools (under `~/.claude/teams/standing/`) are exempt. A user can have N standing pools and still spawn one non-standing team per session.

**Acceptance Criteria:**
- The one-team-per-session check explicitly excludes paths under `~/.claude/teams/standing/`
- A user with one standing pool and zero non-standing teams can run `/team-review` (which spawns a non-standing team)
- A user with one standing pool and one active non-standing team is blocked from spawning another non-standing team (the existing rule still applies for non-standing teams)
- The error message is unchanged from today (no need to mention standing pools — the user is being told about the non-standing team conflict)

---

### 4.8 Discoverability

**FR-MMT27: `team-init` updates**

`team-init` is updated to introduce standing pools and Feature A during project setup, similar to how `multi-model-review.md` FR-MR19 updated `init`.

**Insertion point:** Both new sections are inserted **after Step 5 (config file written)** and **before Step 7 (guidance output)** of the existing `team-init` workflow. This keeps the standing-pool and multi-model questions adjacent to the config write, so the user's answers can be persisted in the same write operation rather than re-opening the file.

**Changes:**

1. After existing setup steps (after Step 5: config written), add a section: **"Standing review pools (optional)"**.
2. Briefly describe: "Synthex+ can run a 'standing review pool' that survives across multiple invocations, so standard Synthex review commands route to it instead of spawning fresh reviewers. Off by default."
3. Use `AskUserQuestion` to ask whether to enable standing pool functionality. Options: "Enable", "Skip" (no changes).
4. If enabled, write `standing_pools.enabled: true` to `.synthex-plus/config.yaml` (extending the just-written config from Step 5) and add a follow-up note: "Run /synthex-plus:start-review-team to spawn your first pool, or /synthex-plus:list-teams to see active pools."
5. Add a related section: **"Multi-model in `/team-review` (optional)"** — describe Feature A; defer to `multi-model-review.md`'s init prompt for the underlying multi-model setup; offer to enable `multi_model_review.per_command.team_review.enabled: true` if the user has already enabled multi-model review more broadly.
6. **Update Step 7 guidance output template** to add `start-review-team`, `stop-review-team`, and `list-teams` to the "Available commands" block when `standing_pools.enabled: true` was set in step 4.

**Acceptance Criteria:**
- `team-init` mentions both Feature A and Feature B
- Skipping leaves config unchanged
- Enabling Feature B just sets the master switch; no pool is auto-spawned (pool spawning is always explicit)
- Step 7 guidance output lists the three new commands when standing pools are enabled

**FR-MMT28: Orphan detection updates**

The existing orphan-detection logic in `team-init` (Step 4, also documented in `team-implement.md:99-115`) is extended to handle standing pools without false-positive-flagging every running pool as an orphan.

**Standing-pool orphan classification rule (normative):**

A standing pool listed in `~/.claude/teams/standing/index.json` is **probably orphaned** (and warned about) if BOTH of the following are true:

1. **TTL elapsed:** `now - last_active_at > ttl_minutes` from the pool's `config.json`.
2. **Stale beyond reasonable cleanup window:** `now - last_active_at > 24 hours`.

A pool meeting both conditions has both fired its TTL AND not been cleaned up by any subsequent discovery operation — strongly suggesting the host process tree is dead and the lazy cleanup path will not run.

A pool meeting only one condition is NOT flagged:
- TTL elapsed but `last_active_at < 24h` ago: probably alive but idle; lazy TTL will reap it on next discovery (FR-MMT13).
- TTL not elapsed but `last_active_at` more than 24h ago: only possible with `ttl_minutes: 0` (infinite TTL); user explicitly opted into "indefinite pool" so we don't second-guess.

This rule is deterministic and documentable in `team-init`'s warning message: `"Standing pool '{name}' has been inactive for {idle_hours} hours (TTL was {ttl_minutes}). Probably orphaned. Cleanup hint: /synthex-plus:stop-review-team --name {name} --force, or rm -rf ~/.claude/teams/standing/{name} && remove from ~/.claude/teams/standing/index.json"`.

The orphan-detection scanner (which broadly enumerates `~/.claude/teams/`) is updated to:
1. **Excludes `~/.claude/teams/standing/`** from the existing one-team-per-session orphan check (per FR-MMT26).
2. **Adds a separate scan** of `~/.claude/teams/standing/` that applies the standing-pool orphan classification rule above.

**Acceptance Criteria:**
- Orphaned standing pools are detected per the two-condition rule and warned about during `team-init`
- A running standing pool (recent `last_active_at`) is NOT flagged as orphaned
- A pool with `ttl_minutes: 0` and recent `last_active_at` is NOT flagged
- The user-facing warning distinguishes standing-pool orphans from non-standing-team orphans (different cleanup commands per the message above)

**FR-MMT29: `/list-teams` doubles as discoverability**

Per FR-MMT11, `/list-teams` shows all active teams with their roster, multi-model status, idle time, and TTL. This is the primary inspection mechanism for users to verify their pool setup is working.

---

### 4.9 Audit

**FR-MMT30: Audit artifact extensions**

The audit artifact defined in `multi-model-review.md` FR-MR24 (audit artifact format) is extended with team-routing and pool-routing metadata when applicable.

**Schema additions (normative):**

```json
{
  "team_metadata": {
    "team_name": "review-a3f7b2c1",
    "team_type": "standing-pool" | "non-standing",
    "reviewer_roster": [
      { "reviewer_id": "code-reviewer", "spawn_timestamp": "<ISO-8601 UTC>" },
      { "reviewer_id": "security-reviewer", "spawn_timestamp": "<ISO-8601 UTC>" }
    ],
    "cross_domain_messages": {
      "count": 3,
      "messages": [
        { "from": "code-reviewer", "to": "security-reviewer", "subject": "potential SQL injection in users.py:42", "timestamp": "<ISO-8601 UTC>" }
      ]
    }
  },
  "pool_routing": {
    "routing_decision": "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch" | "fell-back-pool-draining" | "fell-back-pool-stale" | "fell-back-timeout" | "skipped-routing-mode-explicit",
    "pool_name": "review-pool" | null,
    "pool_multi_model": true | false | null,
    "match_rationale": "covers: pool roster {code-reviewer,security-reviewer,design-system-agent} ⊇ required {code-reviewer,security-reviewer}" | null,
    "would_have_routed": false | { "pool_name": "<name>", "reason_not_used": "roster_mismatch" | "draining" | "stale" | "<other>" }
  },
  "recovery": {
    "occurred": false | true,
    "failed_reviewer": null | "<reviewer_id>",
    "recovery_finding_count": 0
  }
}
```

Field semantics:
- `team_metadata` — present when generated by `/team-review` with multi-model active (FR-MMT3); omitted otherwise.
- `pool_routing.routing_decision` — required field on every audit artifact emitted by a standard Synthex command that supports pool routing in v1 (`/review-code`, `/performance-audit`). Enumerated values cover all FR-MMT15 / FR-MMT17 / FR-MMT22 / FR-MMT16a outcomes. The `would_have_routed` field records the case where a pool existed but couldn't be used; useful for analytics on how often pool design needs adjustment.
- `recovery` — present when FR-MMT24 per-task recovery fired during the review.

**Per-finding source extension** — already covered by FR-MMT20's `source` field on each canonical finding (`source.source_type`: `external` / `native-team` / `native-recovery`).

**Acceptance Criteria:**
- Audit artifacts for `/team-review` with multi-model include the `team_metadata` block per the schema above
- Audit artifacts for standard commands that routed to a pool include `pool_routing` with `routing_decision: "routed-to-pool"`
- Audit artifacts for standard commands that fell back to fresh-spawn record the routing decision with one of the documented `fell-back-*` enum values
- Audit artifacts for `/review-code` and `/performance-audit` always include `pool_routing` (with `routing_decision: "skipped-routing-mode-explicit"` when standing pools are disabled, else one of the routing values)
- Audit artifacts include the `finding_attribution_telemetry` block per FR-MMT30a when its config flag (default `true`) is enabled
- Layer 1 schema test validates the audit artifact extension shape (including the FR-MMT30a block when enabled)

**FR-MMT30a: Per-finding attribution telemetry**

(Promoted from OQ-3 in cycle 1 review.) Per-finding attribution telemetry — which reviewers raised which finding pre-consolidation — is added to the audit artifact under a new `finding_attribution_telemetry` block, gated by the config flag `multi_model_review.audit.record_finding_attribution_telemetry` (default: `true` — privacy-sensitive deployments can opt out by setting it to `false`; see FR-MMT6 schema).

**Schema (normative):**

```json
{
  "finding_attribution_telemetry": [
    {
      "consolidated_finding_id": "<id from canonical schema>",
      "raised_by": [
        { "reviewer_id": "code-reviewer", "family": "anthropic", "source_type": "native-team" },
        { "reviewer_id": "gpt-5-codex", "family": "openai", "source_type": "external" }
      ],
      "consensus_count": 2,
      "minority_of_one": false
    }
  ]
}
```

Field semantics:
- `consolidated_finding_id` — the `finding_id` of the canonical-schema finding emitted in the unified report.
- `raised_by` — every pre-consolidation reviewer (native-team, external, or native-recovery) that flagged this finding before dedup merged them. Source-type values match FR-MMT20's enumeration.
- `consensus_count` — `len(raised_by)`; how many reviewers independently surfaced the issue.
- `minority_of_one` — `true` when exactly one reviewer raised the finding AND it survived FR-MR14b minority-of-one demotion. Useful for analytics on which reviewers contribute unique signal.

**Why a separate FR (not just a sub-section of FR-MMT30):** the telemetry block is opt-out-able independently of the rest of the audit artifact schema, has its own config flag, and may evolve schema-wise without touching FR-MMT30's core block. Keeping it as FR-MMT30a makes the opt-out surface explicit.

**Acceptance Criteria:**
- Audit artifact includes `finding_attribution_telemetry` when `multi_model_review.audit.record_finding_attribution_telemetry` is `true` (default)
- Setting the flag to `false` omits the block entirely; rest of the audit artifact is unchanged
- For each consolidated finding, `raised_by` lists every pre-consolidation reviewer that flagged it (native-team, external, or native-recovery)
- `minority_of_one: true` correctly identifies findings that survived FR-MR14b demotion path

---

### 4.10 Security and Safety

**FR-MMT31: No new credential surface**

Standing pools and multi-model team review do not introduce any new credential handling. All authentication is handled by:
- The host Claude session (for native team reviewers, including pool teammates)
- The user's external CLI configuration (for external adapters in Feature A)

This inherits from `multi-model-review.md` FR-MR2 and FR-MR25.

**Acceptance Criteria:**
- No standing-pool config or runtime state contains provider credentials
- Pool metadata in `~/.claude/teams/standing/<name>/config.json` does not include credentials, environment secrets, or auth tokens

**FR-MMT32: Pool tasks not accessible cross-user on shared infra**

Standing pool task lists, mailboxes, and metadata live under `~/.claude/teams/standing/`, which is the user's home directory. On shared/multi-user infrastructure (e.g., a developer container shared by multiple users), pool resources are owned by the user that spawned them and not shared cross-user.

**This is an assumption documented for users**, not an enforced security boundary. Synthex does not implement multi-tenant pool isolation; users on shared infra should not assume that a pool spawned by one user is or is not visible to another. This is documented in Out of Scope (cross-user pool sharing).

**Acceptance Criteria:**
- `start-review-team` does not chmod or chown anything beyond default user-home semantics
- Documentation explicitly notes that pool resources follow standard filesystem permissions and are not engineered for multi-tenant isolation

---

## 5. Non-Functional Requirements

**NFR-MMT1: Zero-config compatibility**

Users with no `standing_pools` section AND no `multi_model_review.per_command.team_review` override see exactly today's Synthex+ behavior across all team commands and standard Synthex commands. Adding either section with `enabled: false` is also a no-op.

**NFR-MMT2: Idle pool cost**

Idle standing pool teammates consume host context and process resources continuously. The cost-per-idle-minute is bounded by:
- Each teammate is a long-lived process holding context window state
- Each idle event triggers a TeammateIdle hook check (~lightweight; no LLM call beyond a minimal "I have no work" response)

Documentation must set expectations: an idle pool of 2 reviewers (default) is similar in cost to having those 2 reviewers idle in a paused team — significant but not unbounded. Users running large pools (5+ reviewers) for extended periods should budget context accordingly.

**Specific target:** The per-idle-minute cost should be under 5,000 tokens per teammate (lightweight idle hook responses + occasional Lead-side housekeeping). This is a documentation target, not a hard enforcement; verified by sampling during dogfooding.

**Cost-warning trigger (concrete):** A `/start-review-team` invocation triggers the cost advisory message when EITHER condition holds:

- `reviewer_count >= 4`, OR
- `reviewer_count >= 2 AND ttl_minutes > 240` (any pool with 2+ reviewers and TTL above 4 hours)

The advisory is a one-line message displayed before the spawn confirmation in FR-MMT9 step 10: `"Heads up: this pool has {reviewer_count} reviewers and a {ttl_minutes}-minute TTL — expect higher idle context costs than the default 2-reviewer / 60-minute pool. See plugins/synthex-plus/docs/standing-pools.md for cost guidance."`

**Acceptance Criteria:**
- An empirical idle-cost measurement is documented in `plugins/synthex-plus/docs/standing-pools.md` after v1 dogfooding
- The cost advisory fires per the trigger condition above and is displayed before the spawn confirmation
- Pools NOT meeting the trigger condition spawn without the advisory

**NFR-MMT3: Pool routing latency**

The discovery-and-route step in standard Synthex commands (FR-MMT15 + FR-MMT16) should add less than **500 ms of overhead on local SSD (macOS or Linux)** per command invocation in the cold case (no pool match, falls back to fresh spawn). On network-mounted home directories (NFS, SMB) latency may exceed this without the implementation being buggy — discovery is bound by `index.json` read time and per-pool metadata-directory `stat` calls.

When a pool DOES match, the overall command latency should be lower than the fresh-spawn case (that's the whole point of pools).

**Baseline definition for hot-case comparison:** "fresh-spawn for review-code with a 100-line diff" is measured as the time from `/review-code` invocation start to "consolidated report posted to user" using the default `code_review.reviewers` (`code-reviewer, security-reviewer`) on a 100-line diff fixture in the test suite. The baseline is recorded once during v1 dogfooding and used as the comparison anchor for the hot-case target.

**Acceptance Criteria:**
- Discovery completes in < 100 ms for a project with up to 10 standing pools (verified via fixture, on local SSD)
- Total cold-case routing overhead is < 500 ms (verified via fixture, on local SSD)
- Hot-case (pool match) total latency is at least 50% lower than the recorded fresh-spawn baseline for review-code with a 100-line diff (verified via measurement during v1 dogfooding)
- Documentation notes the network-mounted-home-directory caveat

**NFR-MMT4: Platform support**

Same gap as `multi-model-review.md` NFR-MR2: standing pools require the host filesystem (for `~/.claude/teams/standing/` and `~/.claude/tasks/standing/`) and the `Teammate` API (for spawning long-lived teammates). Cloud/web Claude Code surfaces that don't expose host filesystem or that recycle session state aggressively will not support standing pools. Feature A inherits the same external-CLI gap from `multi-model-review.md`.

**Acceptance Criteria:**
- Pool commands fail with a clear, actionable error on cloud surfaces ("Standing pools require host filesystem access. This surface does not support standing pools.") — same pattern as the existing experimental-flag check in synthex-plus
- Documentation lists supported and unsupported surfaces explicitly

**NFR-MMT5: Parallelism**

Native and external reviewers in `/team-review` with multi-model run in parallel (per FR-MMT21). Wall-clock time is `max(slowest native, slowest external) + orchestrator consolidation time`, not the sum.

**Acceptance Criteria:**
- A behavioral fixture verifies that wall-clock time of a multi-model team review is within 20% of the slower of (native team time, external orchestrator time) — i.e., parallelism is real

**NFR-MMT6: Testability**

Both features must be testable under the existing three-layer testing pyramid (per `CLAUDE.md`):

- **Layer 1 (schema):** validate audit artifact additions; validate pool config schema; validate routing-decision-log schema
- **Layer 2 (behavioral):** cached-output tests for: pool discovery and matching, routing prefer-with-fallback, multi-model team consolidation, pool TTL enforcement, in-flight task drain
- **Layer 3 (semantic):** LLM-as-judge for `/team-review --multi-model` consolidated reports — does the unified report read coherently? Does it correctly attribute findings across native team and external sources?

Tests must NOT require live external CLIs (Codex, Gemini) — use recorded fixture outputs per `multi-model-review.md` NFR-MR7.

**Acceptance Criteria:**
- Test fixtures exist for: spawn pool, route work to pool, pool TTL expiration, multi-model team review with planted external findings, FAIL re-review loop with multi-model team, pool fallback when teammate crashes

**NFR-MMT7: Observability**

Pool state is observable via `/list-teams` (FR-MMT11) and the audit artifacts (FR-MMT30). Users should never need to inspect raw filesystem directories to understand pool status.

**Pool-routed output template (normative for v1 routing-enabled commands):**

When `/synthex:review-code` or `/synthex:performance-audit` routes to a standing pool, the user-visible output during the wait MUST include:

1. **Routing confirmation line** (immediately after discovery, before submission):
   `"Routing to standing pool '{name}' (multi-model: {yes|no})."` (verbatim per FR-MMT17)

2. **Submission confirmation** (after task is on the pool's task list):
   `"Submitted to pool '{name}' as task {uuid}. Polling for completion (timeout: {submission_timeout_seconds}s)..."`

3. **Periodic waiting indicator** (every 30 seconds while polling; suppressed automatically when stdout is not a TTY — CI-friendly default, no new flags):
   `"Pool '{name}' working: {n_completed} of {n_total} tasks complete..."`

4. **Provenance line in the resulting report header** (so the user can see where the review came from):
   `"Review path: standing pool '{name}' (multi-model: {yes|no})"` — included in the report's `## Review Header` block alongside the existing review-mode metadata.

Items 1, 2, and 4 are required. Item 3 (periodic indicator) is required for any submission whose actual wait exceeds 60 seconds; for sub-60-second waits, it may be omitted to avoid output noise.

**NFR-MMT8: Documentation**

The following docs must be updated as part of this PRD's implementation:
- `plugins/synthex-plus/README.md` — add commands and link to standing-pools docs
- `plugins/synthex-plus/config/defaults.yaml` — add `standing_pools` section with comments
- `plugins/synthex-plus/.claude-plugin/plugin.json` — register three new commands
- `plugins/synthex-plus/docs/standing-pools.md` (new) — design doc for the feature
- `plugins/synthex/README.md` — note pool routing in standard commands
- `CLAUDE.md` (project-level) — add three new commands to the Commands table; describe pool routing in standard commands

---

## 6. Out of Scope

Deferred to future work:

- **Pool sharing across users on shared infrastructure.** Standing pools are user-scoped via filesystem permissions; multi-tenant isolation is not engineered.
- **Pool persistence across host reboots.** Pools die when their host processes die. Restart on reboot is not implemented; users re-spawn pools per session.
- **Standing pools for non-review work types.** Implementation pools (long-lived `tech-lead + frontend-engineer + quality-engineer` for repeated `/team-implement` invocations), planning pools (long-lived `pm + architect + designer + tech-lead` for repeated `/team-plan` invocations), and refinement pools are explicitly out of scope for v1. Justification: review work is the highest-value pool target (most-invoked review-shaped work in standard Synthex; well-defined input/output contract; fast turnover per task). Other work types have different lifecycle and concurrency profiles that need separate analysis.
- **Orchestrator-as-team-lead refactor (Option C).** Rejected for v1 (FR-MMT3 rationale); revisit in v2 if Option B's "two coordinators" shape proves to be a UX or maintainability problem.
- **Pool dynamic resizing.** A pool's roster is fixed at spawn time. Adding/removing reviewers from a running pool requires stop+respawn. Acceptable trade-off.
- **Partial routing across pool + fresh-spawn for a single review.** Rejected for v1 (FR-MMT23 rationale).
- **Active TTL daemon.** V1 uses lazy TTL via discovery-time cleanup (FR-MMT13); a proactive daemon is future work.
- **Pre-spawned external CLI sessions for pools.** External adapter agents (FR-MR10) remain one-shot per multi-model invocation. A v2 enhancement might pre-warm a `codex exec` background session for a pool to amortize external CLI startup, but v1 invokes them fresh per orchestrator run.
- **Cost budgets for pool runtime or multi-model team review.** Inherited from `multi-model-review.md` Out of Scope.
- **Automated PII/secret redaction of artifacts before transmission to externals.** Inherited from `multi-model-review.md` Out of Scope.
- **Pool sharing within a session via in-process IPC instead of filesystem.** Filesystem is the only mechanism in v1, matching synthex-plus's existing intra-team coordination pattern.
- **Concurrent pool throughput optimization.** Concurrent submissions to the same pool serialize naturally (FR-MMT18). v1 does not optimize this; users wanting concurrency run multiple pools.

---

## 7. Success Metrics

This section is split into **Engineering Completion Criteria** (verifiable via fixture/test — pass/fail signals that the implementation matches the spec) and **Product Value Metrics** (signals that the feature is delivering user value, measured during dogfooding and after release).

### 7.1 Engineering Completion Criteria

| Metric | Target |
|--------|--------|
| `/team-review` with multi-model disabled produces byte-identical output to today's `/team-review` | Verified via regression fixture |
| `/team-review --multi-model` runs natives and externals in parallel | Verified via wall-clock measurement on representative fixture |
| Orchestrator's unified report is the only consolidated output of multi-model `/team-review` (no Lead-side competing report) | Verified via fixture inspecting both Lead's mailbox and orchestrator output path |
| Native team findings and external findings are both attributed in the unified report | Verified via fixture and Layer 1 schema test |
| `/synthex-plus:start-review-team` with defaults spawns a usable pool | Verified via integration test |
| `/synthex-plus:list-teams` shows pool with TTL countdown accurate within ±1 min | Verified via integration test |
| `/synthex-plus:stop-review-team` cleanly shuts down a pool with no orphaned resources | Verified via integration test (post-stop filesystem check) |
| `/synthex-plus:stop-review-team --force` works when pool has in-flight tasks | Verified via fixture |
| Standard Synthex commands discover matching standing pool within 100 ms | Verified via fixture |
| Pool routing falls back silently when no matching pool exists (prefer-with-fallback default) | Verified via fixture |
| Pool routing aborts cleanly when no matching pool exists (explicit-pool-required) | Verified via fixture |
| Pool TTL auto-cleanup on discovery works | Verified via fixture (set short TTL, advance clock, verify cleanup) |
| In-flight task at TTL expiration completes before shutdown | Verified via fixture |
| One-team-per-session rule excludes standing pools | Verified via fixture (spawn pool, then spawn team — both succeed) |
| Concurrent submissions to the same pool both complete | Verified via integration fixture |
| Audit artifact records pool routing decisions, including would-have-routed events | Verified via Layer 1 schema test |
| Pool teammate crash mid-task triggers per-task fresh-spawn fallback (not whole-review failure) | Verified via fixture |
| Routing decision-log fields are present and correct | Verified via Layer 1 schema test |
| Idle pool per-teammate cost is under 5,000 tokens / minute | Verified empirically in dogfooding |

### 7.1a Dogfooding Contract

Several Engineering Completion Criteria above and several Product Value Metrics below depend on a "during dogfooding" measurement window. To make those measurements actually happen, the dogfooding pass for this PRD has the following committed shape:

- **Participant count:** ≥ 3 internal users actively running standing pools and/or `/team-review --multi-model` against real review work (not just synthetic fixtures).
- **Duration:** ≥ 2 weeks of sustained usage. A single one-off invocation does not count toward the participant total.
- **Artifact location:** measurement results, qualitative observations, and the post-dogfood retro live at `docs/retros/multi-model-teams-dogfooding.md` (Synthex+ workspace).
- **Owner:** the Product Manager owns convening the dogfooding cohort, collecting measurements, and writing the retro at the end of the window. The Tech Lead owns instrumenting the audit-artifact-driven measurements (hit rate, fallback rate, finding-attribution telemetry per FR-MMT30a) so the data is captured automatically.
- **Gating relationship:** v1 release requires the dogfooding window to complete and the retro to land. If dogfooding surfaces blocking issues (e.g., Teammate API idle behavior incompatible with FR-MMT5 — see §8 Assumptions), v1 scope adjusts before release.

Without this contract, the four dogfooding-gated metrics in §7.2 are aspirational; with it, they have a concrete owner and surface.

### 7.2 Product Value Metrics

These are leading indicators that the feature is delivering value. They are tracked during dogfooding and the first 90 days post-release. Targets are aspirational; the goal is to measure them, not necessarily hit thresholds on day one.

| Metric | Why it matters | Measurement approach | v1 target |
|--------|----------------|---------------------|-----------|
| **Pool routing hit rate** (% of `/review-code` and `/performance-audit` invocations that routed to a pool when standing pools were enabled) | Tells us whether users with pools enabled are actually getting the amortization benefit. Low hit rate = pool roster doesn't match actual review needs, or users aren't keeping pools alive long enough. | Audit artifact's `pool_routing.routing_decision` enum aggregated across runs (FR-MMT30) | > 50% in dogfooding for users who explicitly enabled pools |
| **Wall-clock speedup vs. fresh-spawn** (median time-to-completed-report for `/review-code` with pool routing vs. without) | Speedup is the primary user-perceived benefit of standing pools. | Per-invocation timing logged in audit artifact; compare distributions | Pool-routed runs ≥ 30% faster than fresh-spawn runs on equivalent diff sizes |
| **Multi-model finding-quality lift** (qualitative: do dogfooders observe the multi-model unified report catches issues the native-only report missed?) | Tells us multi-model is doing its job — the whole point is to break the same-family ceiling. | Manual sampling during dogfooding; pair multi-model and native-only runs on the same diff and compare | Documented in dogfooding retro; goal: identify ≥ 1 specific finding per 10 sampled diffs that multi-model surfaced |
| **Adoption rate** (% of synthex-plus users who run `/start-review-team` at least once within 30 days of v1 release) | Adoption signal — feature must be discoverable and the value-proposition clear. | Self-reported in retro; project telemetry if added later | > 25% adoption in 30 days |
| **Fallback rate** (% of pool-routed submissions that ended in `status: "failed"` envelopes or polling timeouts) | UX-health signal — high fallback rate indicates pools are flaky or under-resourced. | Audit artifact's `pool_routing.routing_decision` enum (`fell-back-*` values) | < 5% of pool-routed submissions fall back |
| **Cross-session pool usage** (% of pools that received submissions from > 1 distinct host session during their lifetime) | Validates the cross-session lifetime design (FR-MMT5a). If most pools are only used by one session, the cross-session UX is over-engineered. | Audit artifact + index entries; compare submitter session IDs | Indicative; no target — measurement only |

---

## 8. Assumptions & Constraints

**Assumptions:**
- The `multi-model-review-orchestrator` agent, the canonical finding schema (FR-MR13), the consolidation pipeline (FR-MR14), and the first-class adapter set (FR-MR10) from `multi-model-review.md` will ship before or alongside this PRD's implementation. Feature A blocks on this; Feature B does not.
- The Claude Code beta `Teammate` API supports long-lived teammates that can idle indefinitely without resource leaks. **This is the single most load-bearing external dependency for Feature B and is currently UNVERIFIED.** The implementation plan derived from this PRD MUST include a pre-implementation spike titled `"Verify Teammate API idle behavior"` that confirms (a) whether teammate sessions have hard idle timeouts, (b) whether teammates can survive past the spawning host session ending, and (c) any per-teammate resource ceilings. Feature B is **gated** on this spike: if the API has hard idle timeouts shorter than the default `ttl_minutes` value, we either revisit FR-MMT5 (heartbeat to keep teammates alive) or descope Feature B from v1.
- Filesystem-based mailbox and task-list coordination (today's synthex-plus pattern) scales to multiple sessions submitting to the same pool concurrently. We don't expect contention issues at v1 scale.
- Synthex+ users adopt standing pools incrementally — a typical user enables one pool with default reviewers, sees the speedup, then optionally enables multi-model. The init flow is designed for this progression.

**Synthex+ assumptions challenged by this PRD (with justification):**

1. **One-team-per-session.** Relaxed to "one **non-standing** team per session." Standing pools are exempt from the count (FR-MMT26). Justification: standing pools have a different lifecycle and concurrency model than per-invocation teams; counting them would defeat their purpose.
2. **Per-invocation team naming.** Extended to a `standing/<user-chosen-name>` namespace alongside the per-invocation naming. Unique-name validation at spawn (FR-MMT9). Justification: standing pools need stable names for discovery and reference across sessions.
3. **Shut down when task list empties.** Extended via `standing: true` mode. Standing pool teammates idle indefinitely until TTL or manual stop (FR-MMT5, FR-MMT12). Justification: amortizing spawn cost requires the pool to outlive any individual task batch.
4. **No inter-session messaging.** Extended via standing-pool task list submission and mailbox messaging. Standard Synthex commands (running in their own host sessions) write tasks to standing pools' filesystem-based task lists (FR-MMT16). Justification: the file-based mechanism already used for intra-team coordination naturally extends to inter-session addressing — only the addressing convention is new.

**Synthex+ assumption preserved (intentionally):**

5. **Read-on-spawn pattern (`plugins/synthex-plus/docs/specs/decisions/ADR-plus-001-read-on-spawn.md` and described in `plugins/synthex-plus/templates/_skeleton.md`).** Standing pool teammates spawn once when the pool is created and adopt their full Synthex agent identity for the pool's entire lifetime. Read-on-spawn works for standing pools without modification. Load-bearing for synthex-plus's "no behavioral drift from standard Synthex" property — a pool's `code-reviewer` is the same `code-reviewer` agent as one spawned ephemerally by `/synthex:review-code`, modulo the team-specific behavioral overlay defined by the pool's template. Preserving this means users can switch between pool-routed and fresh-spawn review without seeing different reviewer behaviors.

**Constraints:**
- Per `CLAUDE.md`: no runtime code — all agents (orchestrator, adapters, pool teammates, pool Lead) are prompt-based markdown definitions invoked by Claude Code. New commands (`start-review-team`, `stop-review-team`, `list-teams`) are markdown command files.
- The plugin system's version-detection requires bumping `marketplace.json` and synthex-plus's `plugin.json` on release.
- Standing pools require the `Teammate` API and host filesystem; they do not work on cloud/web surfaces (NFR-MMT4).
- Multi-model in `/team-review` requires the external CLIs from `multi-model-review.md` to be installed locally (same surface gap).

---

## 9. Future Work / Extension Points

- **Option C (orchestrator-as-team-lead) refactor.** If Option B's "two coordinators in the host session" shape proves to be a UX or maintainability problem, revisit consolidating the orchestrator and the team Lead into a single coordinator. Prerequisites: stable v1 of Option B with measured failure modes.
- **Standing pools for non-review work.** Implementation pools, planning pools, refinement pools. Each has different lifecycle (longer-running tasks, task-graph dependencies, stuck-task semantics) and needs its own design pass.
- **Cross-session pool addressing via richer naming.** v1 names pools by string; v2 might support pool addressing by capability ("the pool that has multi-model and includes design-system-agent") to handle multi-pool environments more cleanly.
- **Orchestrator-aware pool routing.** When a standing pool is multi-model-enabled, standard Synthex commands routing to it currently submit a request that the pool's orchestrator handles. A more efficient design: the pool advertises "I have GPT-5 and Gemini already configured; you don't need to fan out separately" — the routing protocol could respect this and avoid duplicate fan-out work. Deferred until we have empirical data on how often this matters.
- **Active TTL daemon.** A background process or scheduled hook that proactively cleans up expired pools without waiting for a discovery operation. Defer until v1's lazy approach proves insufficient.
- **Pool dynamic resizing.** Adding or removing reviewers from a running pool without stop+respawn.
- **Pool warm-pool for external CLIs.** Pre-warmed `codex exec` background sessions inside a pool to amortize external CLI startup across multiple multi-model invocations.
- **Pool task prioritization.** Currently FIFO. Could add priority lanes (e.g., interactive submissions jump ahead of CI submissions).
- **Pool quotas and budgets.** Per-pool task quota, per-pool token budget, per-pool concurrent-submitter limits.
- **Pool sharing across teammates within a single Claude Code workspace.** If Anthropic adds workspace-shared resource APIs in the future, pools could be advertised at workspace scope rather than user scope.

---

## 10. Open Questions

**OQ-1: TTL behavior when in-flight tasks accumulate. — RESOLVED.**
Promoted to FR-MMT14a (Pool draining state — submission semantics). Resolution: option (c) — `pool_state: draining` field added to `config.json`, surfaced in `/list-teams`, and submitters fall back per `routing_mode` when they see `draining` or `stopping`. See FR-MMT14a for full contract.

**OQ-2: Should standard Synthex commands gain `--use-pool` / `--no-use-pool` invocation flags?**
FR-MMT17 documents `routing_mode` as a config setting. Should we also expose a per-invocation override flag? Pro: gives users a quick escape hatch for one-off cases ("I want to skip the pool for this one review"). Con: adds command-surface complexity for what's usually a session-level decision. Recommend NOT adding for v1 (config-only); revisit if users complain.

**OQ-3: Per-finding attribution telemetry in audit artifact. — RESOLVED.** See FR-MMT30a (§4.9).

**OQ-4: Pool roster matching mode default.**
FR-MMT15 defaults to `covers` (pool roster is a superset of command's needs). Alternative: `exact` (must equal) is more deterministic but reduces hit rate. Is `covers` the right default? Recommend yes — favoring routing-over-fresh-spawn matches the spirit of pools-as-amortization.

**OQ-5: Should standing pools support a "sticky session" mode where a specific submitting session always routes to the same pool even if other matching pools exist?**
v1 picks the first matching pool by name sort order (deterministic but not session-aware). For users running multiple pools to support concurrent throughput, sticky-session would be useful. Defer to future work; document the v1 limitation.

**OQ-6: TTL default for multi-model pools. — RESOLVED (deferred to v2).**
v1 uses a single `ttl_minutes` config (default 60) regardless of multi-model status. The dual-TTL idea (`standing_pools.multi_model_ttl_minutes` for longer default on multi-model pools) is deferred to v2; v1 users who want longer TTL on a multi-model pool can pass `--ttl 240` at spawn time. Rationale: avoid v1 config-surface bloat for what users can already achieve via the per-pool flag.

**OQ-7: Should `/list-teams` show a "would have routed" history for the current session?**
Audit captures this (FR-MMT30) but the audit file is per-invocation. A session-level "missed routing opportunities" view in `/list-teams` would help users see they should spawn a pool. Defer to future work; mention as v2 candidate.

**OQ-8: Backpressure on pool task lists.**
If a standing pool's task list gets very deep (e.g., a CI pipeline submitting 50 reviews in a tight loop), should the pool reject or queue new submissions? V1 has no backpressure — task lists grow unbounded. Recommend keeping as-is for v1 (file-based storage scales fine to thousands of tasks); add backpressure if/when users hit problems.

**OQ-9: Lead vs orchestrator ownership of FAIL re-review loops. — RESOLVED.**
The Lead retains FAIL-loop driver responsibility per FR-MMT4's "Lead role under multi-model" table (kept responsibility) and FR-MMT21 step 9. The orchestrator is invoked once per FAIL cycle for re-consolidation; it does not own the loop itself. Rationale: the Lead already knows the team's task list state and the FAIL semantics from `templates/review.md`; making the orchestrator FAIL-loop-aware would duplicate state-machine logic across two agents.

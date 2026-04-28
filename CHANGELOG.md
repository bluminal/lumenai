# Changelog

All notable changes to LumenAI and its plugins are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [synthex-plus 0.2.0] - 2026-04-26

### Added

**Feature A — Multi-model `/team-review`**
- `/synthex-plus:team-review` now accepts `--multi-model` flag (FR-MMT3/FR-MMT19). When enabled, the `multi-model-review-orchestrator` runs alongside the native team, external LLM adapters review in parallel, and findings from all sources are consolidated into a single unified report.
- Resolution chain for `multi_model` flag: command parameter → `multi_model_review.per_command.team_review.enabled` → `multi_model_review.enabled` → `false` (off by default).
- Lead suppression (FR-MMT4): team Lead publishes the orchestrator's consolidated report verbatim instead of producing a competing one.
- Native reviewers emit structured JSON findings alongside their markdown reports when multi-model mode is active (FR-MMT20).
- Multi-model FAIL re-review cycles re-run the orchestrator at each cycle (~2–3× per-cycle token cost vs native-only).
- Roster validation: aborts before team spawn if any reviewer is outside the v1-supported set (`code-reviewer`, `security-reviewer`, `design-system-agent`, `performance-engineer`).

**Feature B — Standing Review Pools**
- Three new commands: `/synthex-plus:start-review-team`, `/synthex-plus:stop-review-team`, `/synthex-plus:list-teams`.
- Pool state stored at `~/.claude/teams/standing/<name>/config.json`; discovery index at `~/.claude/teams/standing/index.json`.
- `/synthex:review-code` and `/synthex:performance-audit` automatically route to running pools when `standing_pools.enabled: true` (off by default).
- Pool lifecycle: `idle ↔ active → draining → stopping`. Graceful drain on shutdown signal; in-flight tasks complete first.
- Multi-model pools: start with `--multi-model` to run the orchestrator alongside pool reviewers.
- Stale-pool detection via `host_pid` check (FR-MMT22); stale pools cleaned up automatically on discovery.
- Identity drift mitigation (FR-MMT5b): pool reviewers unconditionally re-read their agent file before each task claim.

**Audit Artifact Extensions**
- Multi-model `/team-review` audit artifacts include `team_metadata` block (team name, reviewers, multi_model flag).
- Pool-routing commands include `pool_routing` block (pool name, routing mode, routing decision).
- Per-finding attribution telemetry (FR-MMT30a): opt-out via `multi_model_review.audit.record_finding_attribution_telemetry: false`.

**New configuration keys** (`.synthex-plus/config.yaml`):
- `standing_pools.*` — all nine pool-config keys
- `lifecycle.submission_timeout_seconds: 300`

**New agent** (`plugins/synthex-plus/agents/`):
- `team-orchestrator-bridge` — Haiku-backed bridge between native team mailboxes and the multi-model-review-orchestrator

**New documentation**:
- `plugins/synthex-plus/docs/standing-pools.md` — user-facing design guide
- `docs/specs/multi-model-teams/` — normative specifications (architecture, pool-lifecycle, routing, recovery)

## [0.5.1] - 2026-04-26

### Changed

- `/review-code` and `/performance-audit` now discover and route to standing review pools (via Synthex+) when `standing_pools.enabled: true` in `.synthex-plus/config.yaml`. Off by default — existing behavior unchanged.

**New configuration key** (`.synthex/config.yaml`):
- `multi_model_review.per_command.team_review.enabled: false` — per-command override for multi-model mode in `/team-review`
- `multi_model_review.audit.record_finding_attribution_telemetry: true` — enable per-finding source attribution in audit artifacts

## [0.5.0] - 2026-04-28

### Added — Multi-model review (off by default)

- **Multi-model review orchestrator** (`multi-model-review-orchestrator`): fans review prompts to multiple LLM-family proposers (OpenAI, Google, local-Ollama) via CLI adapters and consolidates findings into a single deduplicated, severity-reconciled, attributed list.
- **CLI adapters** for v1: `codex-review-prompter` (OpenAI), `gemini-review-prompter` (Google), `ollama-review-prompter` (local). All Haiku-backed; documented per-adapter install/auth/sandbox flags.
- **Utility agents**: `context-bundle-assembler` (single-source-of-truth context for all proposers per FR-MR28), `audit-artifact-writer` (per-invocation traceability per FR-MR24).
- **Configuration**: new `multi_model_review:` block in `.synthex/config.yaml` (and `plugins/synthex/config/defaults.yaml`) per FR-MR5. Includes `enabled`, `strict_mode`, `min_family_diversity`, `reviewers`, `aggregator`, `consolidation`, `audit` keys plus per-command overrides.
- **`/synthex:init`** now includes a "Configure Multi-Model Review (optional)" prompt that detects installed CLIs, runs auth checks, and surfaces 3 options (Enable with detected / Enable later snippet / Skip). Includes the FR-MR27 data-transmission warning.
- **`/synthex:review-code`** supports multi-model review via the FR-MR21 8-step decision framework with complexity gate (FR-MR21a). Use `--multi-model` / `--no-multi-model` flags to override config.
- **`/synthex:write-implementation-plan`** supports multi-model plan-review (no complexity gate per FR-MR22).
- **Audit artifacts**: every multi-model invocation writes a self-contained markdown file to `docs/reviews/` with all 7 FR-MR24 sections (invocation metadata, config snapshot, preflight result, per-reviewer results split native/external, consolidated findings with attribution, aggregator trace, optional continuation event). **Add `docs/reviews/` to your `.gitignore` if you prefer not to commit review artifacts** — these files are useful for cost analysis, debugging, and threshold tuning, but are not source code.

### Documentation

- New `docs/specs/multi-model-review/` directory: `architecture.md`, `adapter-recipes.md`, `failure-modes.md`, `adapter-contract.md`, plus the `_shared/canonical-finding-schema.md`.
- README and CLAUDE.md updated with multi-model agent and command references.

## [0.4.0] - 2026-04-22

### Added

- **Explicit per-agent and per-command model assignments ([ADR-001](docs/specs/decisions/ADR-001-model-selection.md)).** Every Synthex agent and command now declares a `model:` in its YAML frontmatter, calibrated to the cognitive demand of its role. Previously all agents and commands inherited the session's default model (typically Opus), which overpaid for mechanical and rubric-based work.
  - **Opus** (4 agents + 5 commands): `product-manager`, `architect`, `ux-researcher`, `sre-agent`; `next-priority`, `write-implementation-plan`, `refine-requirements`, `write-adr`, `write-rfc` — strategic planning, creative synthesis, foundational-artifact authoring.
  - **Sonnet** (8 agents + 4 commands): `tech-lead`, `lead-frontend-engineer`, `security-reviewer`, `terraform-plan-reviewer`, `performance-engineer`, `quality-engineer`, `design-system-agent`, `retrospective-facilitator`; `review-code`, `design-system-audit`, `reliability-review`, `performance-audit` — engineering execution, orchestration, contextual rubric reasoning.
  - **Haiku** (3 existing + 3 new agents + 3 commands): `code-reviewer`, `technical-writer`, `metrics-analyst`; `init`, `test-coverage-analysis`, `retrospective` — rubric and template application.
- **Haiku utility sub-agents for decomposing expensive Opus workloads ([ADR-002](docs/specs/decisions/ADR-002-haiku-subagent-decomposition.md)).** Three new narrow-scope sub-agents let Opus agents and commands delegate mechanical work, reducing per-run cost on `write-implementation-plan` by an estimated 35–40% without quality impact:
  - **`findings-consolidator`** — Dedupes, groups, and sorts findings from multiple reviewers; preserves attribution; flags severity disagreements. Invoked by `write-implementation-plan`, `review-code`, `write-rfc`, and `refine-requirements`.
  - **`plan-linter`** — Structural audit of implementation plan drafts against a deterministic rubric (required sections, typed acceptance criteria, task table structure, dependency validity). Runs between PM draft and peer review in `write-implementation-plan`.
  - **`plan-scribe`** — Applies the Product Manager's decided edits to the plan document mechanically; handles renumbering; validates template compliance. Invoked by `product-manager` after strategic decisions are made.
- **New Utility Layer** in the agent topology (`docs/agent-interactions.md`, `CLAUDE.md`) documenting the decomposition pattern and interaction map for the new sub-agents.

### Changed

- `write-implementation-plan` gains a **Plan Linter pass** (Step 5.5) between the PM's initial draft and the peer review loop, so expensive reviewers (Architect, Tech Lead, Design System Agent) spend their tokens on substantive concerns rather than structural nits.
- `write-implementation-plan`, `review-code`, `write-rfc`, and `refine-requirements` now invoke the **Findings Consolidator** between parallel reviewers returning and the consuming agent reading findings. Flow diagrams updated.
- `product-manager` agent gains a "Delegating Mechanical Edits to Plan Scribe" section; the compactness pass now delegates text rewriting to `plan-scribe` while retaining the strategic "what to tighten" call on the PM.
- **Foundational-artifact commands now run on Opus at the top level, not just in their sub-agents.** `write-adr` (previously Haiku), `write-rfc` (previously Sonnet), `refine-requirements` (previously Sonnet), and `write-implementation-plan` (previously Sonnet) all escalated to Opus. Rationale: these commands drive interactive flows and synthesize the final document, so a weaker model at the top bottlenecks the whole pipeline.

### Fixed

- `tests/schemas/synthex-plus/hooks.test.ts` — Updated Real Plugin Validation tests to parse the Claude Code record-keyed hooks.json format introduced in 0.3.6. Four previously-failing tests now pass; the legacy `validateHooks()` helper and its synthetic tests remain unchanged pending a larger `synthex-plus` refactor.
- `plugins/synthex-plus/.claude-plugin/plugin.json` — Synced `version` field (0.1.1 → 0.1.2) with `marketplace.json`, which had drifted during the 0.3.6 release.

## [0.3.6] - 2026-04-15

### Added

- **Ralph Loop integration for `next-priority` and `team-implement`.** Both commands now detect when they are running inside a [Ralph Loop](https://github.com/anthropics/claude-plugins-official/tree/main/ralph-loop) and output a `<promise>` completion signal to auto-terminate the loop when all work is done.
  - The command reads `.claude/ralph-loop.local.md` to detect an active loop and its configured `completion_promise`.
  - The completion signal fires **only** when every task in the plan has status `done`. Tasks with any non-done status — pending, in-progress, blocked, or awaiting `[H]` user approval — prevent the signal, allowing the loop to continue while the user completes manual tasks in a separate thread.
  - New `exit_on_milestone_complete` parameter (default `false`) for both commands: when `true`, outputs the completion signal at milestone boundaries even if later milestones have remaining work. Useful for inserting review checkpoints between milestones.
- Ralph Loop Integration sections added to both plugin READMEs with usage examples.

## [0.3.5] - 2026-04-13

### Added

- **Typed acceptance criteria framework (`[T]`, `[H]`, `[O]`).** Every task in the implementation plan now requires acceptance criteria tagged by validation type:
  - `[T]` (Testable) — proven by an automated test; the test must exist and pass before the task is marked complete, and the test file/name is linked back to the criterion in the plan.
  - `[H]` (Human-validated) — requires user approval via `AskUserQuestion` before merge; used for design decisions, stakeholder sign-off, UX judgment calls.
  - `[O]` (Observational) — post-deployment metrics tracked at the milestone/phase level, not individual tasks (e.g., adoption rates, error reduction).
- **Test linkage in plan completion records.** When a task is marked done, each `[T]` criterion records which test file and test name proves it (e.g., `[T] Email validation → src/auth/__tests__/login.test.ts: "validates email format"`).
- **Pre-merge gate in `next-priority`.** Tasks may only be merged when all `[T]` criteria have linked passing tests and all `[H]` criteria have been approved by the user.
- **`[H]`-criteria scheduling guidance.** Tasks with human-validated criteria are scheduled early in parallel batches so user review can overlap with autonomous `[T]`-only task execution.

### Changed

- `write-implementation-plan` output template updated with per-task acceptance criteria blocks, `[H]` scheduling notes in parallelization guidance, and milestone-level Observational Outcomes.
- `next-priority` Step 7 (Validate Completion) rewritten with type-specific validation paths; Step 8 (Merge Results) now includes an explicit pre-merge gate; Step 9 (Update the Plan) records test linkage and `[H]` approval.
- `team-implement` task enrichment (Step 7b) includes typed criteria with per-type handling instructions; task lifecycle (Step 8b) expanded from 4 to 6 steps with test linkage verification and human validation gates; plan synchronization (Step 9c) records test linkage and `[H]` approval; assignment guidance (Step 7d) includes `[H]`-criteria scheduling.
- `team-implement` illustrative task mapping example updated to show typed criteria in both plan source and `TaskCreate` description.

## [0.3.4] - 2026-03-14

### Added

- **Interactive `concurrent_tasks` prompt during `/init`.** The init command now detects the machine's CPU count and presents three presets (Yolo = all CPUs, Aggressive = 75% of CPUs, Default = 3) via `AskUserQuestion`, with the option to enter a custom number. Validates that the response is a positive integer and re-asks on invalid input. Updates both `implementation_plan.concurrent_tasks` and `next_priority.concurrent_tasks` in the generated config file.
- **CPU detection** for macOS (`sysctl -n hw.ncpu`), Linux (`nproc`), and Windows (`$env:NUMBER_OF_PROCESSORS`) with a fallback default of 12.
- Schema validation tests for the init command concurrent tasks workflow (46 tests) covering CPU detection, preset options, AskUserQuestion usage, integer validation loop, config update targets, and workflow step ordering.
- Total test count: 496 (up from 450), 16 test suites (up from 15).

### Changed

- `init` command workflow expanded from 5 steps to 6 — new Step 3 ("Configure Concurrent Tasks") inserted between config file creation and `.gitignore` update.

## [0.3.3] - 2026-03-13

### Added

- **`implementation_plan.concurrent_tasks`** config setting — Controls the maximum number of tasks the Product Manager recommends for parallel execution per milestone when drafting implementation plans via `write-implementation-plan`. Default: `3`. Can be overridden per-invocation via the `concurrent_tasks` command parameter.

## [0.3.0] - 2026-02-25

### Added

- **Generalized review loop mechanism.** All reviewer-invoking commands now support structured fix-and-re-review cycles, not just `write-implementation-plan`. New loops added to: `review-code` (Review Loop, triggers on FAIL), `write-rfc` (formalized RFC Review Loop with cycle counting), `reliability-review` (Remediation Loop, triggers on NOT READY), `design-system-audit` (Compliance Loop, triggers on FAIL), `performance-audit` (Optimization Loop, triggers on CRITICAL/HIGH findings).
- **Global `review_loops` config section** in `defaults.yaml` with `max_cycles: 2` and `min_severity_to_address: high`. All commands inherit these defaults with per-command overrides supported.
- **Fresh-agent-per-cycle context management.** Review loops spawn new sub-agent instances each cycle (never resumed) and carry forward only a compact findings summary between cycles. This prevents context window exhaustion during multi-cycle reviews.
- **`performance_audit` config section** in `defaults.yaml` with commented `review_loops` override.
- Per-command commented `review_loops` overrides in `code_review`, `architecture`, `design_system`, and `reliability` config sections for discoverability.
- Schema validation tests for the review loop mechanism (54 tests) covering config structure, command definitions, fresh-agent instructions, compact carry-forward, and stale reference detection.
- Total test count: 273 (up from 219), 15 test suites (up from 14).

### Changed

- **`implementation_plan.max_review_cycles` and `implementation_plan.min_severity_to_address` migrated** to nested `implementation_plan.review_loops.max_cycles: 3` (per-command override) and global `review_loops.min_severity_to_address: high` (inherited). Config resolution order: per-command > global > hardcoded default.
- `write-implementation-plan` command references updated to use `review_loops.*` config paths throughout.
- `write-rfc` Step 5 formalized with explicit cycle counting, max-cycles exit behavior, and Open Questions documentation for unresolved findings.
- `init` command guidance text updated to reference new `review_loops.*` config keys.
- Documentation updated: `CLAUDE.md` config table, `agent-interactions.md` flow diagrams, `README.md` config table.

### Breaking Changes

- Config keys `implementation_plan.max_review_cycles` and `implementation_plan.min_severity_to_address` are removed. Projects using these in `.synthex/config.yaml` must migrate to `implementation_plan.review_loops.max_cycles` and `review_loops.min_severity_to_address` (or per-command `implementation_plan.review_loops.min_severity_to_address`).

## [0.2.0] - 2026-02-25

### Added

- Configurable worktree settings in `defaults.yaml` (`worktrees.base_path`, `worktrees.branch_prefix`)
- `init` command now adds the worktrees base path to `.gitignore` if not already present

### Changed

- **`next-priority` command uses configurable worktree base path instead of hardcoded `/tmp/`.** Default changed to `.claude/worktrees/`, aligning with Claude Code's own worktree convention. This prevents data loss from volatile `/tmp` being cleared on reboot and eliminates naming collisions across projects by scoping worktrees to the repository.
- `next-priority` merge and cleanup steps now reference `{worktrees.branch_prefix}` and `{worktrees.base_path}` config values

## [0.1.1] - 2026-02-25

### Fixed

- **Product Manager: clarifying questions not surfacing in multi-agent orchestration.** When the PM agent ran as a sub-agent (e.g., via Claude Cowork or `write-implementation-plan`), its clarifying questions were returned as text output to the parent agent instead of reaching the human user. The parent agent would then answer the questions itself, bypassing the user entirely. The PM agent now explicitly uses the `AskUserQuestion` tool so questions always surface to the human user regardless of execution context.

### Changed

- Product Manager agent can now answer simple factual questions from its own sub-agents (e.g., reviewer agents) without escalating to the user, while still requiring `AskUserQuestion` for anything needing human judgment or preferences.
- `write-implementation-plan` command Step 4 (User Interview) now explicitly instructs the PM to use `AskUserQuestion`.

### Added

- Schema validation tests for Product Manager agent definition (13 tests) verifying `AskUserQuestion` instructions are present in all critical sections.
- Total test count: 219 (up from 206), 14 test suites (up from 13).

## [0.1.0] - 2026-02-24

First public release of the LumenAI marketplace and the Synthex plugin.

### Added

#### LumenAI Marketplace
- Plugin marketplace registry with `marketplace.json` manifest
- Convention-over-configuration project setup via `/init` command
- Three-layer automated testing framework (schema, behavioral, semantic)
- CI pipeline with GitHub Actions (schema validation on every PR)

#### Synthex Plugin — Agents (15)

**Orchestration Layer**
- **Tech Lead** — Full-stack orchestrator and primary coding agent
- **Lead Frontend Engineer** — Frontend tech lead with framework delegation
- **Product Manager** — Requirements gathering, planning, and strategy

**Specialist Layer**
- **Architect** — System architecture, ADRs, plan feasibility review
- **Code Reviewer** — Craftsmanship review, spec compliance, conventions
- **Security Reviewer** — Vulnerability detection, secrets scanning, access control
- **Terraform Plan Reviewer** — Infrastructure cost, risk, and security analysis
- **Quality Engineer** — Test strategy, coverage analysis, test writing
- **Design System Agent** — Token governance, component compliance audits
- **Performance Engineer** — Core Web Vitals, bundle analysis, query optimization
- **SRE Agent** — SLOs/SLIs, observability, runbooks, postmortems
- **Technical Writer** — API docs, user guides, migration guides, changelogs

**Research & Analysis Layer**
- **UX Researcher** — Research plans, personas, journey maps, OSTs
- **Metrics Analyst** — DORA, HEART/AARRR frameworks, OKR tracking
- **Retrospective Facilitator** — Structured retrospectives, improvement tracking

#### Synthex Plugin — Commands (11)
- **init** — Project configuration and directory scaffolding
- **next-priority** — Identify and execute highest-priority tasks
- **write-implementation-plan** — Transform PRD into implementation plan
- **review-code** — Multi-perspective code review
- **write-adr** — Architecture Decision Record authoring
- **write-rfc** — Request for Comments authoring
- **test-coverage-analysis** — Test gap analysis with optional test writing
- **design-system-audit** — Frontend design system compliance audit
- **retrospective** — Structured cycle retrospective
- **reliability-review** — Operational readiness assessment
- **performance-audit** — Full-stack performance analysis

#### Testing
- 206 schema validation tests across 13 test suites
- Schema validators for all 13 testable agents
- 21 test fixtures (8 terraform, 7 security, 3 code review, 3 PM)
- Golden snapshot infrastructure for regression testing
- Promptfoo integration for behavioral and semantic evaluation

[synthex-plus 0.2.0]: https://github.com/bluminal/lumenai/releases/tag/synthex-plus-v0.2.0
[0.5.1]: https://github.com/bluminal/lumenai/releases/tag/v0.5.1
[0.5.0]: https://github.com/bluminal/lumenai/releases/tag/v0.5.0
[0.4.0]: https://github.com/bluminal/lumenai/releases/tag/v0.4.0
[0.3.6]: https://github.com/bluminal/lumenai/releases/tag/v0.3.6
[0.3.5]: https://github.com/bluminal/lumenai/releases/tag/v0.3.5
[0.3.4]: https://github.com/bluminal/lumenai/releases/tag/v0.3.4
[0.3.3]: https://github.com/bluminal/lumenai/releases/tag/v0.3.3
[0.3.0]: https://github.com/bluminal/lumenai/releases/tag/v0.3.0
[0.2.0]: https://github.com/bluminal/lumenai/releases/tag/v0.2.0
[0.1.1]: https://github.com/bluminal/lumenai/releases/tag/v0.1.1
[0.1.0]: https://github.com/bluminal/lumenai/releases/tag/v0.1.0

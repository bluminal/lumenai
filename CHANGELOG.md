# Changelog

All notable changes to LumenAI and its plugins are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.0]: https://github.com/bluminal/lumenai/releases/tag/v0.3.0
[0.2.0]: https://github.com/bluminal/lumenai/releases/tag/v0.2.0
[0.1.1]: https://github.com/bluminal/lumenai/releases/tag/v0.1.1
[0.1.0]: https://github.com/bluminal/lumenai/releases/tag/v0.1.0

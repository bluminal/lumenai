# Changelog

All notable changes to LumenAI and its plugins are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/bluminal/lumenai/releases/tag/v0.2.0
[0.1.1]: https://github.com/bluminal/lumenai/releases/tag/v0.1.1
[0.1.0]: https://github.com/bluminal/lumenai/releases/tag/v0.1.0

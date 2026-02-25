# Synthex

AI agents modeled after a software startup org chart — specialized roles that synthesize to discover, build, ship, operate, and learn from complete, production-quality software.

## Installation

Install the LumenAI marketplace, then install Synthex:

```bash
/plugin marketplace add bluminal/lumenai
/plugin install synthex
```

### Project Setup

After installing, run the **init** command in your project to scaffold configuration and document directories:

```bash
/init
```

This creates:

| Path | Purpose |
|------|---------|
| `.synthex/config.yaml` | Project configuration (overrides defaults) |
| `docs/reqs/` | Product requirements (PRDs) |
| `docs/plans/` | Implementation plans |
| `docs/specs/` | Technical specifications |
| `docs/specs/decisions/` | Architecture Decision Records (ADRs) |
| `docs/specs/rfcs/` | Requests for Comments (RFCs) |
| `docs/runbooks/` | Operational runbooks |
| `docs/retros/` | Retrospective documents |

Running `/init` is optional — all commands work out of the box with sensible defaults. The config file lets you customize behavior per-project (e.g., add reviewers, change coverage thresholds, adjust document paths).

## Agents (15)

### Orchestration Layer

Lead roles that coordinate specialists and drive execution.

| Agent | Role | Type |
|-------|------|------|
| **Tech Lead** | Full-stack orchestrator, primary coding agent | Execution + Orchestration |
| **Lead Frontend Engineer** | Frontend tech lead, delegates to framework specialists | Execution + Delegation |
| **Product Manager** | Requirements gathering, implementation planning, product strategy | Planning + Strategy |

### Specialist Layer

Domain experts invoked by leads or commands for focused work.

| Agent | Role | Type |
|-------|------|------|
| **Architect** | System architecture guidance, ADRs, plan feasibility review | Advisory + Planning |
| **Code Reviewer** | Craftsmanship review, specification compliance, convention adherence | Advisory (PASS/WARN/FAIL) |
| **Security Reviewer** | Security review quality gate (vulnerabilities, secrets, access control) | Advisory (PASS/WARN/FAIL) |
| **Terraform Plan Reviewer** | Infrastructure-as-code review (cost, risk, security) | Advisory (PASS/WARN/FAIL) |
| **Quality Engineer** | Test strategy, coverage analysis, test writing | Execution + Advisory |
| **Design System Agent** | Design tokens, component governance, compliance audits | Execution + Advisory |
| **Performance Engineer** | Full-stack performance analysis (Core Web Vitals, queries, bundles) | Advisory |
| **SRE Agent** | SLOs/SLIs, observability, runbooks, blameless postmortems | Advisory + Execution |
| **Technical Writer** | API docs, user guides, migration guides, changelogs | Execution |

### Research & Analysis Layer

Agents focused on understanding users, measuring outcomes, and driving improvement.

| Agent | Role | Type |
|-------|------|------|
| **UX Researcher** | Research plans, personas, journey maps, Opportunity Solution Trees | Planning + Advisory |
| **Metrics Analyst** | DORA metrics, HEART/AARRR frameworks, OKR tracking | Advisory |
| **Retrospective Facilitator** | Structured retrospectives, improvement item tracking | Planning + Advisory |

## Commands (11)

| Command | Purpose | Agents Orchestrated |
|---------|---------|-------------------|
| `/init` | Initialize project configuration and directories | -- |
| `/next-priority` | Execute next highest-priority tasks | Tech Lead |
| `/write-implementation-plan` | Transform PRD into implementation plan | PM + Architect + Design System Agent + Tech Lead |
| `/review-code` | Multi-perspective code review | Code Reviewer + Security Reviewer + Performance Engineer (opt.) |
| `/write-adr` | Create Architecture Decision Record | Architect (interactive) |
| `/write-rfc` | Create Request for Comments | Architect + PM + Tech Lead + Security Reviewer |
| `/test-coverage-analysis` | Analyze test gaps, optionally write tests | Quality Engineer |
| `/design-system-audit` | Audit frontend for design system compliance | Design System Agent |
| `/retrospective` | Structured cycle retrospective | Metrics Analyst + Retrospective Facilitator |
| `/reliability-review` | Operational readiness assessment | SRE Agent + Terraform Plan Reviewer (opt.) |
| `/performance-audit` | Full-stack performance analysis | Performance Engineer |

## Configuration

Synthex uses a **convention over configuration** approach:

- **Without a config file:** All commands and agents use sensible embedded defaults. Everything works out of the box.
- **With a config file:** Projects override specific settings in `.synthex/config.yaml`. Only include what you want to change.
- **Config lives in the repo:** Version-controlled alongside code, so the team shares the same configuration.

See [`config/defaults.yaml`](config/defaults.yaml) for the full reference. Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `implementation_plan.reviewers` | architect, designer, tech-lead | Sub-agents that review draft implementation plans |
| `implementation_plan.max_review_cycles` | 3 | Max review iterations |
| `implementation_plan.min_severity_to_address` | high | Minimum severity PM must resolve |
| `code_review.reviewers` | code-reviewer, security-reviewer | Reviewers for `/review-code` |
| `code_review.max_diff_lines` | 300 | Warn when diff exceeds this size |
| `code_review.spec_paths` | `[docs/specs]` | Specifications for compliance checking |
| `quality.coverage_thresholds` | line: 80, branch: 70, function: 80 | Coverage thresholds |
| `quality.test_runner` | vitest | Test runner for coverage reports |
| `architecture.decisions_path` | `docs/specs/decisions` | ADR storage |
| `architecture.rfcs_path` | `docs/specs/rfcs` | RFC storage |
| `design_system.spec_path` | `docs/specs/design-system.md` | Design system spec |
| `design_system.scan_paths` | `[src/]` | Paths to audit for compliance |
| `reliability.slo_document` | `docs/specs/slos.md` | SLO/SLI definitions |
| `reliability.runbooks_path` | `docs/runbooks` | Operational runbooks |
| `retrospective.format` | start-stop-continue | Retrospective format |
| `retrospective.max_improvement_items` | 3 | Max items per cycle |
| `documents.requirements` | `docs/reqs/main.md` | Default PRD path |
| `documents.implementation_plan` | `docs/plans/main.md` | Default plan path |
| `documents.specs` | `docs/specs` | Specs directory |

## License

Apache 2.0 — See [LICENSE](../../LICENSE) for details.

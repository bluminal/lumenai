# Bluminal Labs Marketplace

An internal marketplace for Claude Code plugins by Bluminal Labs.

## What is this?

The Bluminal Labs Marketplace is a structured registry of Claude Code plugins — collections of AI agents and commands that work together to accomplish complex software delivery tasks.

## Plugins

### Autonomous Organization

The first plugin in the marketplace. The **Autonomous Organization** models a software startup's org chart as a collection of AI agents that collaborate via prompts, skills, and delegation to deliver complete, production-quality software.

The organization spans the full software lifecycle: **discover, build, ship, operate, and learn** — with 15 agents organized into three layers and 11 commands that orchestrate them.

#### Agents (15)

**Orchestration Layer** — Lead roles that coordinate specialists and drive execution.

| Agent | Role | Type |
|-------|------|------|
| **Tech Lead** | Full-stack orchestrator, primary coding agent | Execution + Orchestration |
| **Lead Frontend Engineer** | Frontend tech lead, delegates to framework specialists | Execution + Delegation |
| **Product Manager** | Requirements gathering, implementation planning, product strategy | Planning + Strategy |

**Specialist Layer** — Domain experts invoked by leads or commands for focused work.

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

**Research & Analysis Layer** — Agents focused on understanding users, measuring outcomes, and driving improvement.

| Agent | Role | Type |
|-------|------|------|
| **UX Researcher** | Research plans, personas, journey maps, Opportunity Solution Trees | Planning + Advisory |
| **Metrics Analyst** | DORA metrics, HEART/AARRR frameworks, OKR tracking | Advisory |
| **Retrospective Facilitator** | Structured retrospectives, improvement item tracking | Planning + Advisory |

#### Commands (11)

| Command | Purpose | Agents Orchestrated |
|---------|---------|-------------------|
| **init** | Initialize project configuration and directories | -- |
| **next-priority** | Execute next highest-priority tasks | Tech Lead |
| **write-implementation-plan** | Transform PRD into implementation plan | PM + Architect + Design System Agent + Tech Lead |
| **review-code** | Multi-perspective code review | Code Reviewer + Security Reviewer + Performance Engineer (opt.) |
| **write-adr** | Create Architecture Decision Record | Architect (interactive) |
| **write-rfc** | Create Request for Comments | Architect + PM + Tech Lead + Security Reviewer |
| **test-coverage-analysis** | Analyze test gaps, optionally write tests | Quality Engineer |
| **design-system-audit** | Audit frontend for design system compliance | Design System Agent |
| **retrospective** | Structured cycle retrospective | Metrics Analyst + Retrospective Facilitator |
| **reliability-review** | Operational readiness assessment | SRE Agent + Terraform Plan Reviewer (opt.) |
| **performance-audit** | Full-stack performance analysis | Performance Engineer |

## Automated Testing

All agents are tested using a three-layer testing pyramid. Since agents are pure markdown (no runtime code), testing works by invoking agents with synthetic fixtures and validating their outputs.

| Layer | What | Cost | When |
|-------|------|------|------|
| 1 - Schema | Validates markdown structure, sections, tables, verdict format | $0 | Every PR |
| 2 - Behavioral | Regex/JS assertions against cached agent outputs | ~$3/run (cached) | Manual trigger |
| 3 - Semantic | LLM-as-judge evaluates accuracy and quality | ~$8/run | Manual trigger |

**Current coverage:** 206 tests across 13 test suites covering all 15 agents, with schema validators and inline sample outputs for each. See [CLAUDE.md](./CLAUDE.md) for full details.

```bash
cd tests && npx vitest run schemas/   # Layer 1: instant, free
```

## Project Structure

```
claude-plugins/
├── .claude-plugin/marketplace.json     # Marketplace registry
├── plugins/autonomous-org/             # Autonomous Organization plugin
│   ├── .claude-plugin/plugin.json      # Plugin manifest (15 agents, 11 commands)
│   ├── agents/                         # Agent definitions (.md files)
│   ├── commands/                       # Command definitions (.md files)
│   └── config/defaults.yaml            # Default project configuration
├── tests/                              # Automated agent testing framework
│   ├── schemas/                        # Layer 1: Schema validators + Vitest tests
│   ├── helpers/                        # Invocation wrapper, cache, parser, snapshots
│   ├── fixtures/                       # Synthetic test inputs with planted issues
│   └── promptfoo.config.yaml           # Layer 2+3: Behavioral + semantic tests
├── docs/
│   ├── reqs/main.md                    # Product requirements
│   ├── plans/main.md                   # Implementation plan
│   ├── agent-interactions.md           # Agent interaction map and orchestration flows
│   └── research-sources.md             # Research behind each agent's design
├── CLAUDE.md                           # Developer instructions
└── README.md                           # This file
```

## How to Extend

See [CLAUDE.md](./CLAUDE.md) for instructions on adding new agents, commands, and plugins.

## License

UNLICENSED — Internal Bluminal Labs use only.

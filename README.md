# LumenAI

A Claude Code plugin marketplace by Bluminal Labs.

## What is this?

LumenAI is a structured registry of Claude Code plugins — collections of AI agents and commands that work together to accomplish complex software delivery tasks.

```bash
/plugin marketplace add bluminal/lumenai
```

## Plugins

### Synthex

The first plugin in the marketplace. **Synthex** models a software startup's org chart as a collection of AI agents that synthesize to deliver complete, production-quality software.

```bash
/plugin install synthex
```

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

### Synthex+ (Beta)

A **companion plugin** to Synthex that adds persistent team orchestration via Claude Code's beta Agent Teams API. Synthex+ reuses Synthex agent definitions — it does not duplicate or modify them.

> **BETA** — Requires the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` feature flag. Both the Agent Teams API and this plugin are under active development.

```bash
/plugin install synthex-plus
```

Where standard Synthex spawns ephemeral subagents (each unaware of the others), Synthex+ creates persistent teams where agents share a task list, exchange messages via mailboxes, and coordinate autonomously.

| Synthex Command | Synthex+ Equivalent | What Changes |
|----------------|--------------------|----|
| `next-priority` | `team-implement` | Persistent team with real-time coordination instead of sequential subagent invocations |
| `review-code` | `team-review` | Cross-domain messaging between reviewers (e.g., code reviewer alerts security reviewer) |
| `write-implementation-plan` | `team-plan` | Reviewers persist across review cycles, retaining full context |

#### Commands (4)

| Command | Purpose | Synthex Agents Used |
|---------|---------|-------------------|
| **team-init** | Initialize Synthex+ configuration | -- |
| **team-implement** | Sustained multi-agent implementation | Tech Lead + Frontend Engineer + Quality Engineer + Code Reviewer + Security Reviewer |
| **team-review** | Multi-perspective code review with cross-domain communication | Code Reviewer + Security Reviewer + Performance Engineer (opt.) + Design System Agent (opt.) |
| **team-plan** | Collaborative implementation planning with persistent reviewers | Product Manager + Architect + Design System Agent + Tech Lead |

**When to use Synthex+ over Synthex:** Multi-component work spanning 3+ files across 2+ system layers, large code reviews (500+ LOC), security-sensitive changes, or planning for 10+ requirements. For quick, focused tasks, standard Synthex is lighter and more cost-effective.

See the [Synthex+ README](./plugins/synthex-plus/README.md) for full documentation.

## Automated Testing

All agents are tested using a three-layer testing pyramid. Since agents are pure markdown (no runtime code), testing works by invoking agents with synthetic fixtures and validating their outputs.

| Layer | What | Cost | When |
|-------|------|------|------|
| 1 - Schema | Validates markdown structure, sections, tables, verdict format | $0 | Every PR |
| 2 - Behavioral | Regex/JS assertions against cached agent outputs | ~$3/run (cached) | Manual trigger |
| 3 - Semantic | LLM-as-judge evaluates accuracy and quality | ~$8/run | Manual trigger |

**Current coverage:** 404 tests across 18 test suites — 206 for Synthex agents + 131 for Synthex+ templates, hooks, and command outputs + 67 for shared infrastructure. See [CLAUDE.md](./CLAUDE.md) for full details.

```bash
cd tests && npx vitest run schemas/   # Layer 1: instant, free
```

## Project Structure

```
lumenai/
├── .claude-plugin/marketplace.json     # Marketplace registry
├── plugins/
│   ├── synthex/                        # Synthex plugin
│   │   ├── .claude-plugin/plugin.json  # Plugin manifest (15 agents, 11 commands)
│   │   ├── agents/                     # Agent definitions (.md files)
│   │   ├── commands/                   # Command definitions (.md files)
│   │   └── config/defaults.yaml        # Default project configuration
│   └── synthex-plus/                   # Synthex+ plugin (BETA)
│       ├── .claude-plugin/plugin.json  # Plugin manifest (4 commands)
│       ├── commands/                   # Team command definitions (.md files)
│       ├── templates/                  # Team composition templates
│       ├── hooks/                      # Hook behavioral specs + hooks.json
│       ├── scripts/                    # Thin shell shims for hook events
│       ├── config/defaults.yaml        # Default configuration
│       └── docs/                       # Decision guide, context management, output formats
├── tests/                              # Automated agent testing framework
│   ├── schemas/                        # Layer 1: Schema validators + Vitest tests
│   │   └── synthex-plus/               # Synthex+ validators (templates, hooks, outputs)
│   ├── helpers/                        # Invocation wrapper, cache, parser, snapshots
│   ├── fixtures/                       # Synthetic test inputs with planted issues
│   │   └── synthex-plus/               # Synthex+ fixtures
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

Apache 2.0 — See [LICENSE](./LICENSE) for details.

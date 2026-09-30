# LumenAI

A Claude-first plugin marketplace with a shared Agent Skills distribution by Bluminal Labs.

## What is this?

LumenAI is a structured registry of plugins and Agent Skills — collections of AI agents and commands that work together to accomplish complex software delivery tasks. Claude Code, Codex, and Grok install Synthex as a native plugin; Gemini CLI and OpenCode use the portable Agent Skills bundle.

Install the marketplace in Claude Code:

```bash
/plugin marketplace add bluminal/lumenai
```

Or install it in Codex:

```bash
codex plugin marketplace add bluminal/lumenai
codex plugin add synthex@lumenai
```

Or install it in Grok:

```bash
grok plugin marketplace add bluminal/lumenai
grok plugin install synthex --trust
```

Codex and Grok expose the same Synthex names as skills (for example, `$review-code` / `/synthex:review-code` and `$architect`). Gemini CLI and OpenCode consume that same generated Agent Skills layer through their workspace or project skill roots. Thin generated skill entrypoints load the existing files under `commands/` and `agents/`, so those Markdown definitions remain the single behavioral source of truth.

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

#### Commands (12)

| Command | Purpose | Agents Orchestrated |
|---------|---------|-------------------|
| **init** | Initialize project configuration and directories | -- |
| **next-priority** | Execute next highest-priority tasks | Tech Lead |
| **refine-requirements** | Improve PRD clarity through multi-agent review | PM + Tech Lead + Lead Frontend Engineer |
| **write-implementation-plan** | Transform PRD into implementation plan | PM + Architect + Design System Agent + Tech Lead |
| **review-code** | Multi-perspective code review | Code Reviewer + Security Reviewer + Performance Engineer (opt.) |
| **write-adr** | Create Architecture Decision Record | Architect (interactive) |
| **write-rfc** | Create Request for Comments | Architect + PM + Tech Lead + Security Reviewer |
| **test-coverage-analysis** | Analyze test gaps, optionally write tests | Quality Engineer |
| **design-system-audit** | Audit frontend for design system compliance | Design System Agent |
| **retrospective** | Structured cycle retrospective | Metrics Analyst + Retrospective Facilitator |
| **reliability-review** | Operational readiness assessment | SRE Agent + Terraform Plan Reviewer (opt.) |
| **performance-audit** | Full-stack performance analysis | Performance Engineer |

### Synthex+ (removed)

> **Removed.** Synthex+ was a companion plugin for persistent team orchestration via Claude Code's beta Agent Teams API. Its standing-review-pool capability was folded into Synthex; the plugin then shipped a tombstone release and was removed from the marketplace. Its `team-*` commands (`team-review`, `team-implement`, `team-plan`, `team-refine`, `team-init`) are retired outright — their behavior is Synthex's capability ladder inside `review-code`, `next-priority`, `write-implementation-plan`, and `refine-requirements`, not a 1:1 port. See [`docs/migrations/synthex-plus.md`](./docs/migrations/synthex-plus.md) for the migration steps, the command mapping, and the full removal timeline.

## Multi-Model Review

Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, local-Ollama) via CLI adapters and consolidates findings into a single deduplicated, severity-reconciled, attributed list.

The primary benefit: catching correlated-error blind spots — bugs and issues that any single LLM family would miss but that show up when multiple families review independently.

**Off by default.** Opt in via `/synthex:init` (interactive prompt) or by editing `.synthex/config.yaml`. CLI-only — Synthex does not store API keys.

See [`docs/specs/multi-model-review/architecture.md`](docs/specs/multi-model-review/architecture.md) for the full design and [`docs/specs/multi-model-review/adapter-recipes.md`](docs/specs/multi-model-review/adapter-recipes.md) for per-adapter setup.

## Native Looping

Synthex 0.8+ ships a native `--loop` flag on iteration-friendly commands (`next-priority`, `write-implementation-plan`, `refine-requirements`, `review-code`), plus a generic `/synthex:loop` for arbitrary prompts. Loops iterate in the same agent thread by default (auto-compaction handles the context window) and persist per-session state at `.synthex/loops/<loop-id>.json` for resume across sessions. See [`plugins/synthex/docs/native-looping.md`](plugins/synthex/docs/native-looping.md) for the full framework spec.

## Automated Testing

All agents are tested using a three-layer testing pyramid. Since agents are pure markdown (no runtime code), testing works by invoking agents with synthetic fixtures and validating their outputs.

| Layer | What | Cost | When |
|-------|------|------|------|
| 1 - Schema | Validates markdown structure, sections, tables, verdict format | $0 | Every PR |
| 2 - Behavioral | Regex/JS assertions against cached agent outputs | ~$3/run (cached) | Manual trigger |
| 3 - Semantic | LLM-as-judge evaluates accuracy and quality | ~$8/run | Manual trigger |

**Current coverage:** see `tests/schemas/` for the full Layer 1 suite (Synthex agents, commands, and shared infrastructure). See [CLAUDE.md](./CLAUDE.md) for full details.

```bash
cd tests && npx vitest run schemas/   # Layer 1: instant, free
```

## Project Structure

```
lumenai/
├── .agents/plugins/marketplace.json     # Codex marketplace registry
├── .claude-plugin/marketplace.json     # Claude Code marketplace registry
├── .grok-plugin/marketplace.json       # Grok marketplace registry
├── plugins/
│   ├── synthex/                        # Synthex plugin
│   │   ├── .codex-plugin/plugin.json   # Codex plugin manifest
│   │   ├── .grok-plugin/plugin.json    # Grok plugin manifest (shared skills only)
│   │   ├── .claude-plugin/plugin.json  # Plugin manifest (15 agents, 12 commands)
│   │   ├── agents/                     # Agent definitions (.md files)
│   │   ├── commands/                   # Command definitions (.md files)
│   │   ├── skills/                     # Generated Agent Skills entrypoints
│   │   └── config/defaults.yaml        # Default project configuration
│   # Synthex+ (plugins/synthex-plus/) was removed in Task 55 — its pool
│   # capability lives in plugins/synthex/ above. See
│   # docs/migrations/synthex-plus.md.
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

Apache 2.0 — See [LICENSE](./LICENSE) for details.

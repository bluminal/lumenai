# Bluminal Labs Claude Plugins — Developer Instructions

## Project Overview

This is the **Bluminal Labs Marketplace** — an internal marketplace for Claude Code plugins. The first plugin is the **Autonomous Organization**, a collection of AI agents modeled after a software startup org chart.

## Directory Structure

```
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json        # Marketplace registry (lists all plugins)
├── .github/
│   └── workflows/
│       └── agent-tests.yml     # CI pipeline (3-tier agent testing)
├── plugins/
│   └── autonomous-org/         # First plugin: Autonomous Organization
│       ├── .claude-plugin/
│       │   └── plugin.json     # Plugin manifest (lists agents + commands)
│       ├── agents/             # Agent definitions (.md files)
│       ├── commands/           # Command/skill definitions (.md files)
│       └── config/             # Default configuration templates
│           └── defaults.yaml   # Default project configuration
├── tests/                      # Automated agent testing framework
│   ├── schemas/                # Layer 1: Schema validators + Vitest tests
│   ├── helpers/                # Invocation wrapper, cache, parser, snapshots
│   ├── fixtures/               # Synthetic test inputs with planted issues
│   └── promptfoo.config.yaml   # Layer 2+3: Behavioral + semantic tests
├── docs/
│   ├── reqs/                   # Product requirements documents
│   │   └── main.md             # Primary PRD
│   ├── plans/                  # Implementation plans
│   │   └── main.md             # Primary implementation plan
│   ├── agent-interactions.md   # Agent interaction map and orchestration flows
│   └── research-sources.md     # Research sources behind agent designs
├── CLAUDE.md                   # This file
└── README.md                   # Project overview
```

## How Plugins Work

- **Agents** are markdown files in `agents/` that define an AI role (identity, responsibilities, behavioral rules, output format)
- **Commands** are markdown files in `commands/` that define orchestration workflows (parameters, workflow steps, which agents to invoke)
- **plugin.json** registers agents and commands within a plugin
- **marketplace.json** registers plugins within the marketplace

## Adding a New Agent

1. Create a new `.md` file in `plugins/[plugin-name]/agents/`
2. Define the agent's role, responsibilities, workflow, output format, and behavioral rules
3. Add the agent name to the `agents` array in `plugins/[plugin-name]/.claude-plugin/plugin.json`

## Adding a New Command

1. Create a new `.md` file in `plugins/[plugin-name]/commands/`
2. Define parameters, workflow steps, and which agents to invoke
3. Add the command filename to the `commands` array in `plugins/[plugin-name]/.claude-plugin/plugin.json`

## Adding a New Plugin

1. Create a new directory under `plugins/`
2. Add `.claude-plugin/plugin.json` with agent and command registrations
3. Add the plugin to the `plugins` array in `.claude-plugin/marketplace.json`

## Conventions

- Agent filenames: `kebab-case.md` (e.g., `tech-lead.md`, `security-reviewer.md`)
- Command filenames: `kebab-case.md` (e.g., `next-priority.md`)
- Commands can be nested in subdirectories (e.g., `commands/testing/fix-tests.md`)
- All agent and command definitions are markdown — no runtime code
- PRDs go in `docs/reqs/`, implementation plans go in `docs/plans/`
- NEVER place implementation plans or progress tracking in this file (CLAUDE.md)

## Agents (Autonomous Organization)

### Orchestration Layer

| Agent | Role | Type |
|-------|------|------|
| `tech-lead` | Full-stack orchestrator, primary coding agent | Execution + Orchestration |
| `lead-frontend-engineer` | Frontend tech lead, delegates to framework specialists | Execution + Delegation |
| `product-manager` | Requirements gathering, implementation planning, product strategy | Planning + Strategy |

### Specialist Layer

| Agent | Role | Type |
|-------|------|------|
| `architect` | System architecture guidance, ADRs, plan feasibility review | Advisory + Planning |
| `code-reviewer` | Craftsmanship review, specification compliance, convention adherence | Advisory (PASS/WARN/FAIL) |
| `security-reviewer` | Security review quality gate (vulnerabilities, secrets, access control) | Advisory (PASS/WARN/FAIL) |
| `terraform-plan-reviewer` | Infrastructure-as-code review (cost, risk, security) | Advisory (PASS/WARN/FAIL) |
| `quality-engineer` | Test strategy, coverage analysis, test writing | Execution + Advisory |
| `design-system-agent` | Design tokens, component governance, compliance audits | Execution + Advisory |
| `performance-engineer` | Full-stack performance analysis (Core Web Vitals, queries, bundles) | Advisory |
| `sre-agent` | SLOs/SLIs, observability, runbooks, blameless postmortems | Advisory + Execution |
| `technical-writer` | API docs, user guides, migration guides, changelogs | Execution |

### Research & Analysis Layer

| Agent | Role | Type |
|-------|------|------|
| `ux-researcher` | Research plans, personas, journey maps, Opportunity Solution Trees | Planning + Advisory |
| `metrics-analyst` | DORA metrics, HEART/AARRR frameworks, OKR tracking | Advisory |
| `retrospective-facilitator` | Structured retrospectives, improvement item tracking | Planning + Advisory |

## Commands

| Command | Purpose | Agents Orchestrated |
|---------|---------|-------------------|
| `init` | Initialize project configuration and directories | — |
| `next-priority` | Execute next highest-priority tasks | Tech Lead |
| `write-implementation-plan` | Transform PRD into implementation plan | PM + Architect + Design System Agent + Tech Lead |
| `review-code` | Multi-perspective code review | Code Reviewer + Security Reviewer + Performance Engineer (opt.) |
| `write-adr` | Create Architecture Decision Record | Architect (interactive) |
| `write-rfc` | Create Request for Comments | Architect + PM + Tech Lead + Security Reviewer |
| `test-coverage-analysis` | Analyze test gaps, optionally write tests | Quality Engineer |
| `design-system-audit` | Audit frontend for design system compliance | Design System Agent |
| `retrospective` | Structured cycle retrospective | Metrics Analyst + Retrospective Facilitator |
| `reliability-review` | Operational readiness assessment | SRE Agent + Terraform Plan Reviewer (opt.) |
| `performance-audit` | Full-stack performance analysis | Performance Engineer |

See `docs/agent-interactions.md` for the complete interaction map and `docs/research-sources.md` for the research behind each agent's design.

## Project Configuration Framework

The Autonomous Organization uses a **convention over configuration** approach for project-level customization.

### How It Works

- **Without a config file:** Commands and agents use sensible embedded defaults. Everything works out of the box.
- **With a config file:** Projects override specific settings in `.autonomous-org/config.yaml`. Only include what you want to change.
- **Config lives in the repo:** Version-controlled alongside code, so the team shares the same configuration.

### Initialization

Run the `init` command to create the configuration file and document directories:
```
/init
```

This creates:
- `.autonomous-org/config.yaml` — Project configuration (copied from `plugins/autonomous-org/config/defaults.yaml`)
- `docs/reqs/` — Product requirements directory
- `docs/plans/` — Implementation plans directory
- `docs/specs/` — Technical specifications directory
- `docs/specs/decisions/` — Architecture Decision Records (ADRs)
- `docs/specs/rfcs/` — Requests for Comments (RFCs)
- `docs/runbooks/` — Operational runbooks
- `docs/retros/` — Retrospective documents

### Configuration File Location

```
your-project/
├── .autonomous-org/
│   └── config.yaml         # Project-level config (overrides defaults)
├── docs/
│   ├── reqs/main.md        # PRD
│   ├── plans/main.md       # Implementation plan
│   ├── specs/              # Technical specifications
│   │   ├── decisions/      # Architecture Decision Records (ADRs)
│   │   └── rfcs/           # Requests for Comments (RFCs)
│   ├── runbooks/           # Operational runbooks
│   └── retros/             # Retrospective documents
└── ...
```

### What's Configurable

See `plugins/autonomous-org/config/defaults.yaml` for the full reference. Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `implementation_plan.reviewers` | architect, designer, tech-lead | Sub-agents that review draft implementation plans |
| `implementation_plan.max_review_cycles` | 3 | Max review iterations |
| `implementation_plan.min_severity_to_address` | high | Minimum severity PM must resolve |
| `code_review.reviewers` | code-reviewer, security-reviewer | Reviewers for `review-code` command |
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

### Design Pattern

This configuration framework is designed to be extended. As new commands and agents are added, their configurable settings are added to `config/defaults.yaml` with sensible defaults. Projects only override what they need to change.

## Automated Testing Framework

The agents and commands are tested using a three-layer testing pyramid. Since agents are pure markdown (no runtime code), testing works by invoking agents with synthetic fixtures and validating their outputs.

### Testing Pyramid

```
         /\            Layer 3: SEMANTIC EVAL
        /  \           (Manual trigger — LLM-as-judge)
       /    \
      /------\         Layer 2: BEHAVIORAL ASSERTIONS
     / cached  \       (Manual trigger — one LLM call, many assertions)
    /  outputs  \
   /------------\      Layer 1: SCHEMA VALIDATION
  / zero LLM cost \   (Every PR — golden snapshots)
 /________________\
```

| Layer | What | Cost | When |
|-------|------|------|------|
| 1 - Schema | Validates markdown structure, sections, tables, verdict format | $0 | Every PR |
| 2 - Behavioral | Regex/JS assertions against cached agent outputs | ~$3/run (cached) | Manual trigger |
| 3 - Semantic | LLM-as-judge evaluates accuracy and quality | ~$8/run | Manual trigger |

### Test Directory Structure

```
tests/
├── promptfoo.config.yaml         # Layer 2+3 config (behavioral + semantic)
├── vitest.config.ts              # Layer 1 config
├── schemas/                      # Layer 1: Output structure validators
│   ├── helpers.ts                # Markdown parsing utilities (verdict, finding, section, table parsers)
│   ├── terraform-reviewer.ts     # Terraform plan review validator
│   ├── security-reviewer.ts      # Security review validator
│   ├── implementation-plan.ts    # Implementation plan template validator
│   ├── code-reviewer.ts          # Code review validator (craftsmanship, conventions)
│   ├── design-system-agent.ts    # Design system compliance validator
│   ├── architect.ts              # Plan review + ADR validator (dual-mode)
│   ├── performance-engineer.ts   # Performance audit validator (quantified impact)
│   ├── sre-agent.ts              # Reliability review validator (SLOs, observability)
│   ├── quality-engineer.ts       # Coverage analysis validator
│   ├── metrics-analyst.ts        # DORA/HEART metrics validator
│   ├── retrospective-facilitator.ts  # Retrospective format validator
│   ├── ux-researcher.ts          # Multi-artifact validator (5 types: OST, persona, journey map, etc.)
│   ├── technical-writer.ts       # Multi-document validator (6 types: API doc, changelog, etc.)
│   └── *.test.ts                 # Vitest test suites (one per validator)
├── helpers/
│   ├── claude-provider.js        # Promptfoo custom provider (wraps claude -p)
│   ├── invoke-agent.ts           # Agent invocation wrapper with caching
│   ├── cache.ts                  # SHA-256 hash-based LLM output cache
│   ├── parse-markdown-output.ts  # Structured markdown parser
│   └── snapshot-manager.ts       # Golden snapshot management
├── fixtures/                     # Synthetic test inputs with planted issues
│   ├── terraform/                # 8 TF plan fixtures
│   ├── security/                 # 7 code diff fixtures
│   ├── code-reviewer/            # 3 diff fixtures (clean-code, god-object, missing-error-handling)
│   ├── product-manager/          # 3 PM input fixtures
│   └── commands/                 # Command integration fixtures
├── __snapshots__/                # Golden outputs for regression
└── .cache/                       # LLM output cache (gitignored)
```

### Schema Validator Coverage

Every testable agent has a schema validator and a corresponding test suite with inline sample outputs:

| Agent | Validator | Tests | Fixtures | Key Validations |
|-------|-----------|-------|----------|----------------|
| terraform-reviewer | `terraform-reviewer.ts` | 46 | 8 | Resource changes, cost analysis, destructive actions, security |
| security-reviewer | `security-reviewer.ts` | 33 | 7 | CWE references, severity sorting, verdict consistency |
| implementation-plan | `implementation-plan.ts` | 14 | -- | Milestone structure, task decomposition, dependency graph |
| code-reviewer | `code-reviewer.ts` | 16 | 3 | Educational content, convention compliance, reuse opportunities |
| design-system-agent | `design-system-agent.ts` | 7 | -- | Token violations table, accessibility findings, compliance verdict |
| architect | `architect.ts` | 15 | -- | Dual-mode (Plan Review + ADR), alternatives table, severity sorting |
| performance-engineer | `performance-engineer.ts` | 9 | -- | Quantified impact (ms, KB), performance budget table |
| sre-agent | `sre-agent.ts` | 10 | -- | Readiness verdict, SLO/observability tables, deployment assessment |
| quality-engineer | `quality-engineer.ts` | 7 | -- | Coverage table, gap priorities, test strategy |
| metrics-analyst | `metrics-analyst.ts` | 8 | -- | DORA metrics table, OKR tracking, quantitative content |
| retrospective-facilitator | `retrospective-facilitator.ts` | 12 | -- | Format detection, improvement item limits, blameless language |
| ux-researcher | `ux-researcher.ts` | 17 | -- | 5 artifact types, evidence basis, confidence levels |
| technical-writer | `technical-writer.ts` | 17 | -- | 6 document types, section structure per type |

**Total: 206 tests, 13 test suites, 0 failures.**

### Running Tests

```bash
cd tests

# Layer 1: Schema validation (instant, free)
npx vitest run schemas/

# Layer 2: Behavioral assertions (uses cached LLM outputs)
npx promptfoo eval --config promptfoo.config.yaml --filter-pattern "B[0-9]"

# Layer 3: Semantic evaluation (LLM-as-judge)
npx promptfoo eval --config promptfoo.config.yaml --filter-pattern "S[0-9]"

# All layers
npm run test:all
```

### Caching Strategy

LLM outputs are cached by `hash(agent.md + fixture + model)`. Changing an agent definition or fixture invalidates the cache and triggers a fresh LLM call. Unchanged agents reuse cached outputs at zero cost.

### Adding Tests for a New Agent

1. Create fixtures in `tests/fixtures/{agent-name}/`
2. Add a schema validator in `tests/schemas/{agent-name}.ts`
3. Add Vitest tests in `tests/schemas/{agent-name}.test.ts`
4. Add behavioral assertions to `tests/promptfoo.config.yaml`
5. Generate golden snapshots: `npm run snapshots:update`

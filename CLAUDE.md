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
│   └── plans/                  # Implementation plans
│       └── main.md             # Primary implementation plan
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

## Current MVP Agents (Autonomous Organization)

| Agent | Role | Type |
|-------|------|------|
| `terraform-plan-reviewer` | Analyzes terraform plans for cost/risk/security | Advisory (PASS/WARN/FAIL) |
| `lead-frontend-engineer` | Frontend tech lead, delegates to framework specialists | Execution + Delegation |
| `tech-lead` | Full-stack orchestrator, primary coding agent | Execution + Orchestration |
| `security-reviewer` | Quality gate for code security and secrets leakage | Advisory (PASS/WARN/FAIL) |
| `product-manager` | Requirements gathering (interactive Q&A), implementation planning | Planning + Strategy |

## Current MVP Commands

| Command | Purpose |
|---------|---------|
| `init` | Initializes Autonomous Organization configuration for a project |
| `next-priority` | Identifies top tasks and delegates to Tech Lead for execution |
| `write-implementation-plan` | Transforms a PRD into an implementation plan via Product Manager |

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

### Configuration File Location

```
your-project/
├── .autonomous-org/
│   └── config.yaml         # Project-level config (overrides defaults)
├── docs/
│   ├── reqs/main.md        # PRD
│   ├── plans/main.md       # Implementation plan
│   └── specs/              # Technical specifications
└── ...
```

### What's Configurable

See `plugins/autonomous-org/config/defaults.yaml` for the full reference. Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `implementation_plan.reviewers` | architect, designer, tech-lead | Sub-agents that review draft implementation plans |
| `implementation_plan.max_review_cycles` | 3 | Max review iterations |
| `implementation_plan.min_severity_to_address` | high | Minimum severity PM must resolve |
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
│   ├── helpers.ts                # Markdown parsing utilities
│   ├── terraform-reviewer.ts     # TF output format validator
│   ├── security-reviewer.ts      # Security output format validator
│   ├── implementation-plan.ts    # Plan template validator
│   └── *.test.ts                 # Vitest test suites
├── helpers/
│   ├── claude-provider.js        # Promptfoo custom provider (wraps claude -p)
│   ├── invoke-agent.ts           # Agent invocation wrapper with caching
│   ├── cache.ts                  # SHA-256 hash-based LLM output cache
│   ├── parse-markdown-output.ts  # Structured markdown parser
│   └── snapshot-manager.ts       # Golden snapshot management
├── fixtures/                     # Synthetic test inputs with planted issues
│   ├── terraform/                # 8 TF plan fixtures
│   ├── security/                 # 7 code diff fixtures
│   ├── product-manager/          # 3 PM input fixtures
│   └── commands/                 # Command integration fixtures
├── __snapshots__/                # Golden outputs for regression
└── .cache/                       # LLM output cache (gitignored)
```

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

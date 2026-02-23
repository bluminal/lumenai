# Bluminal Labs Marketplace

An internal marketplace for Claude Code plugins by Bluminal Labs.

## What is this?

The Bluminal Labs Marketplace is a structured registry of Claude Code plugins — collections of AI agents and commands that work together to accomplish complex software delivery tasks.

## Plugins

### Autonomous Organization

The first plugin in the marketplace. The **Autonomous Organization** models a software startup's org chart as a collection of AI agents that collaborate via prompts, skills, and delegation to deliver complete, production-quality software.

**Agents:**

| Agent | Role |
|-------|------|
| **Tech Lead** | Full-stack orchestrator — writes code and coordinates specialists to deliver complete work products |
| **Lead Frontend Engineer** | Frontend tech lead — ensures high-quality UX, delegates to framework specialists |
| **Security Reviewer** | Quality gate — reviews code changes for security defects, secrets, and vulnerabilities |
| **Terraform Plan Reviewer** | Infrastructure advisor — analyzes terraform plans for cost, risk, and security |
| **Product Manager** | Strategy and planning — gathers requirements and produces implementation plans |

**Commands:**

| Command | Purpose |
|---------|---------|
| **next-priority** | Identifies the highest-priority tasks and orchestrates their execution |
| **write-implementation-plan** | Transforms requirements into a prioritized implementation plan |

## Project Structure

```
claude-plugins/
├── .claude-plugin/marketplace.json     # Marketplace registry
├── plugins/autonomous-org/             # Autonomous Organization plugin
│   ├── .claude-plugin/plugin.json      # Plugin manifest
│   ├── agents/                         # Agent definitions
│   └── commands/                       # Command definitions
├── docs/reqs/                          # Product requirements
├── docs/plans/                         # Implementation plans
├── CLAUDE.md                           # Developer instructions
└── README.md                           # This file
```

## How to Extend

See [CLAUDE.md](./CLAUDE.md) for instructions on adding new agents, commands, and plugins.

## License

UNLICENSED — Internal Bluminal Labs use only.

# Initialize Synthex+

Set up the Synthex+ teams plugin configuration for a project. This command scaffolds the configuration file needed for team-based orchestration commands. It checks for the Synthex dependency, verifies the experimental Agent Teams flag, detects orphaned team resources, and creates the project-level configuration.

**Prerequisite:** Synthex should be installed and initialized first (`/init`). Synthex+ extends Synthex with persistent multi-agent team capabilities.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where to create the config file | `.synthex-plus/config.yaml` | No |

## What This Command Does

1. **Checks for existing configuration** at `.synthex-plus/config.yaml` (or custom path)
2. **Verifies the Synthex dependency** is installed
3. **Checks the experimental Agent Teams flag** is set in the environment
4. **Detects orphaned team resources** from previous sessions
5. **Creates the project configuration file** at `.synthex-plus/config.yaml`
6. **Updates `.gitignore`** to exclude `.synthex-plus/` if not already present
7. **Provides guidance** on available team commands and configuration

This command does NOT create document directories — those are managed by the Synthex `init` command.

## Workflow

### 1. Check for Existing Configuration

Check if `@{config_path}` already exists.

- **If it exists:** Inform the user that a Synthex+ configuration already exists. Ask if they want to review it, reset it to defaults, or leave it as-is.
- **If it doesn't exist:** Proceed to step 2.

### 2. Check Synthex Dependency

Verify that the Synthex plugin is available by checking for either:
- `plugins/synthex/agents/tech-lead.md` exists (agent file presence check)
- OR `.synthex/config.yaml` exists (Synthex has been initialized in this project)

**If neither is found:** Display a warning but do NOT fail. Continue with the remaining steps.

```
Warning: Synthex plugin not detected. Synthex+ requires Synthex agent definitions
for team member identities. Team commands will fail until Synthex is installed.
```

Record this warning for display in the final summary (step 7).

### 3. Check Experimental Flag

Check if the environment variable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set to `1`.

**If the flag is not set or not equal to `1`:** Display a warning but do NOT fail. Continue with the remaining steps.

```
Warning: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is not set. Agent Teams features
require this flag. Set it in your environment or in ~/.claude/settings.json under env.
```

Record this warning for display in the final summary (step 7).

### 4. Check for Orphaned Team Resources

Check for directories under `~/.claude/teams/` that may be left over from previous sessions.

**If orphaned team directories are found:** Display a warning for each one but do NOT fail. Continue with the remaining steps.

```
Warning: Found orphaned team resources at ~/.claude/teams/{name}. These may be left
over from a previous session. Consider cleaning up with: rm -rf ~/.claude/teams/{name}
```

Record these warnings for display in the final summary (step 7).

### 5. Create Configuration File

Read the default configuration template from the plugin's `config/defaults.yaml` file (located relative to this command at `../config/defaults.yaml`).

Create the directory `.synthex-plus/` in the project root if it doesn't exist, then write the defaults template to `@{config_path}`.

The configuration file must retain all comments from the defaults template — these serve as inline documentation explaining each setting.

### 6. Update .gitignore

Check if `.gitignore` exists in the project root. If it does, check whether it already contains an entry for `.synthex-plus/`.

- **If `.gitignore` exists and does NOT contain `.synthex-plus/`:** Append the following block to the end of the file:

```
# Synthex+ configuration (project-specific overrides)
.synthex-plus/
```

- **If `.gitignore` exists and already contains `.synthex-plus/`:** Do nothing.
- **If `.gitignore` does not exist:** Create it with the entry above.

### 7. Confirm and Guide

Display a summary of what was created, any warnings collected from steps 2-4, and guidance on available commands and configuration.

```
Synthex+ initialized for this project.

Created:
  .synthex-plus/config.yaml    — Teams configuration (overrides plugin defaults)
  .gitignore                   — Added .synthex-plus/ (if not present)
```

If any warnings were recorded in steps 2-4, display them in a dedicated section:

```
Warnings:
  - Synthex plugin not detected. Team commands will fail until Synthex is installed.
  - CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is not set. Agent Teams features require this flag.
  - Found orphaned team resources at ~/.claude/teams/{name}.
```

Then display available commands, templates, and configuration guidance:

```
Available team commands:
  /team-implement              — Execute plan tasks with a persistent implementation team
  /team-review                 — Multi-perspective code review with cross-domain discussion
  /team-plan                   — Collaborative implementation planning

Available templates:
  implementation               — Feature development (Tech Lead + Frontend + Quality + Reviewer)
  review                       — Deep code review (Craftsmanship + Security + Performance + Design)
  planning                     — Implementation planning (PM + Architect + Designer + Implementer)

Configuration guide:
  - Adjust cost model:     Edit cost_guidance.base_tokens_per_teammate
  - Disable cost prompt:   Set cost_guidance.show_cost_comparison: false
  - Hook settings:         Edit hooks.task_completed and hooks.teammate_idle
  - Full reference:        See .synthex-plus/config.yaml for all settings
```

## Configuration Overview

The Synthex+ configuration file controls team-specific behavior. It is separate from the Synthex configuration (`.synthex/config.yaml`) to maintain clean separation of concerns.

### Key Configuration Sections

| Section | Description |
|---------|-------------|
| `teams` | Default team templates for implementation, review, and planning |
| `hooks` | Quality gate hooks for task completion and idle teammate detection |
| `cost_guidance` | Token estimation constants for pre-creation cost comparison |
| `review_loops` | Teams-specific review loop settings (higher defaults than Synthex) |
| `task_list` | Shared task list behavior (context mode, concurrency limits) |
| `lifecycle` | Team execution settings (stuck task timeout, task limits) |
| `documents` | Document paths (matches Synthex defaults for interoperability) |

### Relationship to Synthex Configuration

Synthex+ builds on top of Synthex. The two configuration files serve different purposes:

| Setting | Owned by |
|---------|----------|
| Agent definitions, agent behavior | Synthex (`.synthex/config.yaml`) |
| Document paths, review rigor | Synthex (`.synthex/config.yaml`) |
| Team templates, team lifecycle | Synthex+ (`.synthex-plus/config.yaml`) |
| Hook behavior, cost guidance | Synthex+ (`.synthex-plus/config.yaml`) |
| Task list settings | Synthex+ (`.synthex-plus/config.yaml`) |

Document paths appear in both configurations for convenience. When both are present, Synthex+ defers to its own `documents` section to allow teams-specific overrides.

## Design Philosophy

Synthex+ follows the same **convention over configuration** approach as Synthex:

- **Without a config file:** All team commands use sensible embedded defaults. Everything works out of the box.
- **With a config file:** Projects can override specific settings. Only include what you want to change — unspecified values use defaults.
- **Config lives in the repo:** `.synthex-plus/config.yaml` is a project file, version-controlled alongside code, so the team shares the same configuration.
- **Non-destructive checks:** All dependency and environment checks produce warnings, never failures. This ensures the init command always completes successfully, even in partially configured environments.

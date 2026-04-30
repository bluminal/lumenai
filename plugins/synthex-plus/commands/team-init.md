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

This step runs two passes — one for non-standing teams, one for standing pools. The two passes use different orphan criteria and produce distinct warnings.

#### Pass 1: Non-standing team orphan detection

Scan `~/.claude/teams/` for directories that may be left over from previous sessions, excluding `~/.claude/teams/standing/`. Standing pools are governed by their own lifecycle rules (Pass 2) and must not be flagged by this non-standing orphan check.

**If orphaned non-standing team directories are found:** Display a warning for each one but do NOT fail. Continue with the remaining steps.

```
Warning: Found orphaned team resources at ~/.claude/teams/{name}. These may be left
over from a previous session. Consider cleaning up with: rm -rf ~/.claude/teams/{name}
```

Record these warnings for display in the final summary (step 7).

#### Pass 2: Standing pool orphan detection (FR-MMT28)

Scan `~/.claude/teams/standing/index.json` for standing pools that appear orphaned. A standing pool is orphaned when **both** of the following conditions are true:

1. **TTL elapsed:** The pool's `ttl_minutes` has elapsed since `spawn_timestamp` (or `ttl_minutes` is 0 and the pool has exceeded its expected session lifetime).
2. **Inactive for >24 hours:** The pool's `last_active_at` timestamp is more than 24 hours old.

Both conditions must hold simultaneously — a pool that is TTL-elapsed but was recently active is NOT orphaned (it may be finishing work). A pool that has been inactive for 24h but has not yet exceeded its TTL is NOT orphaned.

**If an orphaned standing pool is found:**

1. Invoke the `standing-pool-cleanup` agent to perform cleanup.
2. Emit the following FR-MMT28 warning (verbatim):
   ```
   Standing pool '{name}' appears orphaned (TTL elapsed and inactive for >24h). It has been cleaned up automatically.
   ```

**Suppression note:** FR-MMT22's one-time-per-session suppression marker lives in the calling command's session state (in `routing.md`), not in `team-init`. FR-MMT22 suppression does not suppress these FR-MMT28 orphan warnings — each pass operates independently.

Record these FR-MMT28 warnings for display in the final summary (step 7).

If `~/.claude/teams/standing/index.json` does not exist or is empty, skip Pass 2 silently.

### 5. Create Configuration File

Read the default configuration template from the plugin's `config/defaults.yaml` file (located relative to this command at `../config/defaults.yaml`) using the **Read** tool. Then create the directory `.synthex-plus/` in the project root if it doesn't exist, and write the template content to `@{config_path}` using the **Write** tool.

The configuration file must retain all comments from the defaults template — these serve as inline documentation explaining each setting.

**Implementation rules — strict:**

- Use the **Read** tool to load `defaults.yaml`. Use the **Write** tool to create the project config. **Do NOT use `cp`, `cat >`, `sed -i`, `tee`, or any shell command that takes the defaults path as an argument.** Shell commands trigger Claude Code's sensitive-file permission prompt (which flags both source and destination of `cp`) and risk argument-order bugs that could overwrite the plugin's defaults.
- The plugin's `defaults.yaml` is **read-only**. Never write to it, never pass it as a destination argument to any tool, never edit it. It is a template, not project state.
- The destination `@{config_path}` (default `.synthex-plus/config.yaml`) is the only file this step creates.

### 6. Update .gitignore

Check if `.gitignore` exists in the project root. Ensure it contains entries for the synthex-plus configuration directory and the per-developer state file.

For each entry below:

- **If `.gitignore` exists and does NOT contain the path:** Append it.
- **If `.gitignore` exists and already contains the path:** Do nothing for that entry.
- **If `.gitignore` does not exist:** Create it.

The resulting block to append (omitting any lines already present) is:

```
# Synthex+ configuration (project-specific overrides)
.synthex-plus/

# Synthex+ per-developer state (upgrade-nudge tracking)
.synthex-plus/state.json
```

The `.synthex-plus/state.json` line is explicit per FR-UO24 / D-UO2 — even though the `.synthex-plus/` directory entry already covers it, the explicit state-file entry documents intent and survives any future narrowing of the directory-level ignore.

### 7. Standing Review Pools (optional)

**Standing Review Pools (optional)**

Already initialized? Re-run the wizard with `/synthex-plus:configure-teams` to reconsider the routing and matching modes without re-running full `team-init`.

Standing review pools keep reviewers warm between reviews — useful when you run many code reviews per session and want to amortize the reviewer spawn cost.

AskUserQuestion: "Would you like to enable standing review pools for this project? (Enable / Skip)"

On Enable:
- Write `standing_pools.enabled: true` to `.synthex-plus/config.yaml`
- Add default standing-pool settings to the config:
  - `standing_pools.routing_mode: prefer-with-fallback`  (silent fallback when no pool matches)
  - `standing_pools.matching_mode: covers`  (pool roster must cover required reviewers)
- Do NOT spawn any pool now — FR-MMT27 criterion 3: do not spawn a pool at init time (user runs /start-review-team separately when ready)

On Skip:
- Do not write `standing_pools` config keys; feature stays off by default

Record the user's choice (Enabled or Skipped) for use in Step 9's guidance output.

### 8. Multi-model review in /team-review (optional)

**Multi-model review in /team-review (optional)**

When enabled, /team-review routes reviewer findings through an external multi-model orchestrator for deeper consolidation — useful for large or high-risk diffs.

Note: This requires `multi_model_review.enabled: true` in `.synthex/config.yaml` (the base Synthex plugin's config). If you haven't enabled multi-model review in Synthex yet, the Synthex /init command handles that setup.

AskUserQuestion: "Would you like to enable multi-model review in /team-review? This requires multi_model_review.enabled: true in .synthex/config.yaml. (Enable / Skip)"

On Enable:
- Write `multi_model_review.per_command.team_review.enabled: true` to `.synthex-plus/config.yaml`
- Note to user: "Enabled. Make sure multi_model_review.enabled: true is set in .synthex/config.yaml — run /synthex:init if you haven't already."

On Skip:
- Do not write the config key; feature stays off by default

Record the user's choice (Enabled or Skipped) for use in Step 9's guidance output.

### 9. Confirm and Guide

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

If `standing_pools.enabled: true` was chosen in Step 7, append the following to the "Available team commands" section in the guidance output:

```
  /synthex-plus:start-review-team  — Start a standing review pool (keeps reviewers warm between reviews)
  /synthex-plus:stop-review-team   — Stop a running pool (graceful shutdown with drain)
  /synthex-plus:list-teams         — View all active pools and their status
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

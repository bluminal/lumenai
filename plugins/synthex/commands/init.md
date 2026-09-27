---
model: haiku
---

# Initialize Synthex

Set up the Synthex plugin configuration for a project. This command scaffolds the configuration file and document directories needed for the plugin to operate.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where to create the config file | `.synthex/config.yaml` | No |

## What This Command Does

1. **Creates the project configuration file** at `.synthex/config.yaml` (or custom path)
2. **Prompts for concurrent task parallelism** — detects CPU count and asks the user to choose a concurrency level (Yolo, Aggressive, Default, or custom)
3. **Configures multi-model review (optional)** — scans for installed CLIs, runs auth checks, and offers opt-in options for multi-model review
4. **Updates `.gitignore`** to exclude the worktrees directory (`.claude/worktrees/`) if not already present
5. **Creates `.worktreeinclude`** so Claude Code copies env files (e.g., `.env`, `.env.local`) into every new worktree
6. **Asks about starring the repo** — offers to open the Lumenai marketplace on GitHub so the user can star it
7. **Creates document directories** (`docs/reqs/`, `docs/plans/`, `docs/specs/`, `docs/specs/decisions/`, `docs/specs/rfcs/`, `docs/runbooks/`, `docs/retros/`) if they don't exist
8. **Provides guidance** on customizing the configuration for your project

## Workflow

### 1. Check for Existing Configuration

Check if `@{config_path}` already exists.

- **If it exists:** Inform the user that a configuration already exists. Ask if they want to review it, reset it to defaults, or leave it as-is.
- **If it doesn't exist:** Proceed to create it.

### 2. Create Configuration File

Run `plugins/synthex/scripts/init-scaffold.sh` (resolved from the installed plugin root — Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/init-scaffold.sh" "@{config_path}"`) as ONE Bash call. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

The script (FR-HM26) does the mechanical work this step and Step 8 used to describe by hand, in one call:

- Copies the plugin's `config/defaults.yaml` to `@{config_path}` (default `.synthex/config.yaml`) byte-for-byte — no transformation. **Idempotent:** an existing config file is left untouched by this call. If Step 1's "reset to defaults" choice was picked, re-run with a trailing `--force` to overwrite it.
- Creates the standard document directories from Step 8 if they don't already exist.

It checks writability before writing and exits non-zero with a clear message if a target directory can't be written to (e.g. a read-only sandbox). Print its stdout/stderr to the user verbatim — it reports exactly what it created. The plugin's `config/defaults.yaml` stays read-only; the script never writes to it, and never takes it as anything but a read source.

**Fallback (no shell tool, or the script is missing):** use the **Read** tool to load the plugin's `config/defaults.yaml` and the **Write** tool to create `@{config_path}` (skip it if the file exists, unless "reset to defaults" was chosen), then create the Step 8 directories. **Do NOT use `cp`, `cat >`, `sed -i`, `tee`, or any shell command that takes the defaults path as an argument**: Claude Code's permission engine flags both paths of `cp`, and an argument-order slip could overwrite the plugin's template.

#### 2a. Detect and Write Project Facts

FR-HM29 (D12): detect the four project facts below and write them to `.synthex/facts.md`, each under its own anchor with an inline freshness-rule comment. This is model work (detection reads the repo directly), not a script — there is nothing here a zero-token script does more simply.

| Fact | Anchor | Freshness rule | How to detect |
|------|--------|-----------------|----------------|
| `commit_convention` | `#commit-convention` | Re-verify when HEAD has moved more than 50 commits past `recorded_sha` | Sample `git log -n 50` and majority-vote the subject pattern (same heuristic `commit-message-author` Step 2 uses) |
| `test_runner` (+ coverage command) | `#test-runner` | Re-verify when `package.json` or `pytest.ini` mtime is newer than `recorded_at` | Inspect `package.json` scripts/devDependencies, `pytest.ini`, `vitest.config.*`, `jest.config.*` |
| `frontend_framework` | `#frontend-framework` | Same rule as `test_runner` | Inspect `package.json` dependencies for React/Vue/Angular/Svelte, or `@docs/specs/frontend.md` |
| `spec_index` (path glob to spec file map) | `#spec-index` | Re-verify when `docs/specs` mtime is newer than `recorded_at` | Glob `docs/specs/**/*.md` and record a path → title map |

Write `.synthex/facts.md` with the **Write** tool in this format (omit a fact's section entirely if it can't be detected — never write a guess):

```markdown
# Project Facts

Auto-generated by `/synthex:init`. Commands read this file first; if a fact
is missing or stale per its freshness rule, they fall back to detecting it
directly, the same way they did before this file existed.

## commit_convention {#commit-convention}
<!-- freshness: re-verify when HEAD is >50 commits past recorded_sha -->
recorded_sha: <sha>
value: conventional | issue-key | gitmoji | plain | none

## test_runner {#test-runner}
<!-- freshness: re-verify when package.json or pytest.ini mtime > recorded_at -->
recorded_at: <ISO-8601 timestamp>
runner: vitest
coverage_command: npx vitest run --coverage

## frontend_framework {#frontend-framework}
<!-- freshness: re-verify when package.json or pytest.ini mtime > recorded_at -->
recorded_at: <ISO-8601 timestamp>
value: react | vue | angular | svelte | none

## spec_index {#spec-index}
<!-- freshness: re-verify when docs/specs mtime > recorded_at -->
recorded_at: <ISO-8601 timestamp>
paths:
  - docs/specs/foo.md: "Foo Spec"
```

Print `Wrote <N> facts to .synthex/facts.md`, where `<N>` is the count of fact sections actually written (0-4).

### 3. Configure Concurrent Tasks

Prompt the user to choose how many parallel tasks Synthex should run. This value controls `implementation_plan.concurrent_tasks` and `next_priority.concurrent_tasks` in the config file.

#### 3a. Detect CPU Count

Detect the number of logical CPUs on the machine using the appropriate system command:

| Platform | Command |
|----------|---------|
| macOS | `sysctl -n hw.ncpu` |
| Linux | `nproc` |
| Windows (PowerShell) | `$env:NUMBER_OF_PROCESSORS` |

**Fallback:** If CPU detection fails for any reason, default to `12`.

Store the detected CPU count as `cpus`.

#### 3b. Calculate Options

Compute the following preset values:

| Option | Value | Description |
|--------|-------|-------------|
| Yolo | `cpus` | Use all available CPUs — maximum parallelism |
| Aggressive | `max(floor(cpus * 0.75), 8)` | High parallelism with headroom for system processes. If CPU detection failed, use `8`. |
| Default | `3` | Conservative — works well on any machine |

#### 3c. Ask the User

Use the `AskUserQuestion` tool to present the options. The question should be formatted as:

> **How many parallel tasks should Synthex run?**
>
> This controls how many tasks execute concurrently during planning and execution (e.g., `next-priority`, `write-implementation-plan`). Higher values speed up work but use more system resources.
>
> 1. **Yolo ({cpus})** — All CPUs, maximum parallelism
> 2. **Aggressive ({aggressive_value})** — 75% of CPUs, leaves headroom
> 3. **Default (3)** — Conservative, works on any machine
>
> Or type a custom number.

Where `{cpus}` and `{aggressive_value}` are the computed values from step 3b.

#### 3d. Validate the Response

The response **must** resolve to a positive integer. Apply these rules:

1. If the user picks an option by number (e.g., "1", "2", "3") or name (e.g., "yolo", "aggressive", "default"), resolve it to the corresponding integer value.
2. If the user types a plain integer (e.g., "6"), use that value directly.
3. If the response is NOT a valid positive integer and cannot be resolved to one, re-ask using `AskUserQuestion`:

   > That doesn't look like a valid number. `concurrent_tasks` must be a positive integer (e.g., 3, 8, 16). Please enter a number or pick one of the options above.

4. Repeat validation until a valid positive integer is obtained. Do NOT proceed until you have a valid integer.

#### 3e. Update the Config File

Replace **both** `concurrent_tasks` values in the config file at `@{config_path}`:
- `implementation_plan.concurrent_tasks` — set to the chosen value
- `next_priority.concurrent_tasks` — set to the chosen value

### 4. Configure Multi-Model Review (optional)

Delegate to the `/synthex:configure-multi-model` wizard at `plugins/synthex/commands/configure-multi-model.md`. Read that file and follow Steps 1a–1d (Detection Scan, Surface Three Options, Data-Transmission Warning, Apply the Chosen Option) inline as part of `init`. Skip Step 0 (re-entry check) — `init` always invokes the wizard in fresh-configuration mode.

### 5. Update .gitignore

Check if `.gitignore` exists in the project root. Ensure it contains entries for **four** synthex-managed paths:

1. The worktrees base path (`.claude/worktrees` by default, or the value from `worktrees.base_path` in the config file).
2. The synthex upgrade-nudge state file (`.synthex/state.json`) — per FR-UO24, this file is per-developer/per-clone and must not be committed.
3. The synthex native-looping state directory (`.synthex/loops/`) — per D-NL14, loop state is per-developer/per-clone (each loop is per-session and includes a `session_id`).
4. The synthex project facts file (`.synthex/facts.md`) — per FR-HM29 (D12), facts carry recorded SHAs and mtimes that differ per clone, so it is not committed.

For each entry:

- **If `.gitignore` exists and does NOT contain the path:** Append it.
- **If `.gitignore` exists and already contains the path:** Do nothing for that entry.
- **If `.gitignore` does not exist:** Create it.

Concretely, the resulting block to append (omitting any lines already present) is:

```
# Synthex worktrees (parallel task execution)
.claude/worktrees/

# Synthex per-developer state (upgrade-nudge tracking)
.synthex/state.json

# Synthex native-looping state (per-session, per-developer)
.synthex/loops/

# Synthex cached project facts (per-clone SHAs and mtimes; FR-HM29)
.synthex/facts.md
```

### 6. Create `.worktreeinclude`

Claude Code's built-in worktree support (`claude --worktree`, subagent `isolation: worktree`) creates a fresh checkout that does NOT include gitignored files like `.env`. A `.worktreeinclude` file at the project root tells Claude Code which gitignored files to copy into each new worktree, using `.gitignore` syntax. Only files that both match a pattern AND are gitignored get copied — tracked files are never duplicated.

Check if `.worktreeinclude` exists in the project root.

- **If it does NOT exist:** Use the **Write** tool to create it with the following starter content:

  ```
  # Files copied into every Claude Code worktree (--worktree, subagent isolation, desktop parallel sessions).
  # Syntax matches .gitignore. Only files that both match here AND are gitignored are copied.
  # Add anything a fresh checkout needs: env files, local credentials, generated config not in source control.

  .env
  .env.local
  ```

- **If it already exists:** Do not overwrite or modify it. Inform the user briefly: ".worktreeinclude already exists — left unchanged."

The file is committed to the repo so the whole team benefits from the same worktree-population behavior. Mention this in the confirmation step (Step 9).

### 7. Ask About Starring the Repo

After the configuration scaffolding is in place, ask the user whether they'd like to star the Lumenai marketplace repository on GitHub. Stars help more developers find the project — which means more eyeballs for new features and bug fixes.

Delegate to the `/synthex:star` command at `plugins/synthex/commands/star.md`. Read that file and follow Steps 2 and 3 (Ask the user → Apply the user's choice) inline as part of `init`. Skip Step 1 (the state-existence check) — `init` has already ensured `.synthex/` exists. If the user picks "Maybe later", do nothing extra; the upgrade-nudge hook will surface the prompt again on the next version bump.

### 8. Create Document Directories

Already done — the Step 2 script call (`init-scaffold.sh`) created these directories if they didn't already exist:
- `docs/reqs/` — Product requirements documents
- `docs/plans/` — Implementation plans
- `docs/specs/` — Technical specifications
- `docs/specs/decisions/` — Architecture Decision Records (ADRs)
- `docs/specs/rfcs/` — Requests for Comments (RFCs)
- `docs/runbooks/` — Operational runbooks
- `docs/retros/` — Retrospective documents

No action needed here; this step is a no-op kept for numbering continuity with Step 9's confirmation output. Do NOT create any files inside these directories — just the directories, and only via the Step 2 script (never ad hoc).

### 9. Confirm and Guide

Inform the user what was created and provide guidance:

```
Synthex initialized for this project.

Created:
  .synthex/config.yaml           — Project configuration (concurrent_tasks: {chosen_value})
  .synthex/facts.md              — Cached project facts (Wrote {N} facts to .synthex/facts.md)
  .gitignore                     — Added worktrees path (if not present)
  .worktreeinclude               — Env files copied into new Claude Code worktrees (if not present)
  docs/reqs/                     — Product requirements (PRDs)
  docs/plans/                    — Implementation plans
  docs/specs/                    — Technical specifications
  docs/specs/decisions/          — Architecture Decision Records (ADRs)
  docs/specs/rfcs/               — Requests for Comments (RFCs)
  docs/runbooks/                 — Operational runbooks
  docs/retros/                   — Retrospective documents
  docs/reviews/                  — Multi-model review audit artifacts (if multi-model enabled)

Next steps:
  1. Review .synthex/config.yaml and customize for your project
  2. Create your PRD with the `write-implementation-plan` command
  3. Or write your PRD manually at docs/reqs/main.md

Available commands:
  /write-implementation-plan   — Transform a PRD into an implementation plan
  /next-priority               — Execute the next highest-priority tasks
  /review-code                 — Multi-perspective code review
  /write-adr                   — Create an Architecture Decision Record
  /write-rfc                   — Create a Request for Comments
  /test-coverage-analysis      — Analyze test gaps, optionally write tests
  /design-system-audit         — Audit frontend for design system compliance
  /retrospective               — Facilitate a structured retrospective
  /reliability-review          — Assess operational readiness
  /performance-audit           — Full-stack performance analysis

Configuration guide:
  - Add reviewers:    Add entries to implementation_plan.reviewers
  - Remove reviewers: Set enabled: false on any default reviewer
  - Adjust rigor:     Change review_loops.max_cycles or review_loops.min_severity_to_address
  - Full reference:   See .synthex/config.yaml for all settings
```

## Configuration Overview

The configuration file controls how the Synthex plugin behaves in this project. Key settings:

### Implementation Plan Reviewers

By default, three sub-agents review every draft implementation plan:

| Reviewer | Focus |
|----------|-------|
| **Architect** | Technical architecture, feasibility, NFR coverage, missing technical tasks |
| **Designer** | Design tasks, UX impact, visual/interaction design clarity |
| **Tech Lead** | Task clarity, acceptance criteria, parallelizability, dependency accuracy |

**Adding a reviewer** (e.g., for a security-sensitive project):

```yaml
implementation_plan:
  reviewers:
    - agent: architect
      enabled: true
      focus: "Technical architecture, feasibility, NFR coverage"
    - agent: designer
      enabled: true
      focus: "Design tasks, UX impact, visual design clarity"
    - agent: tech-lead
      enabled: true
      focus: "Task clarity, acceptance criteria, parallelizability"
    - agent: security-reviewer
      enabled: true
      focus: "Security requirements, threat modeling coverage, compliance tasks"
```

**Disabling a reviewer** (e.g., for a backend-only project with no design needs):

```yaml
implementation_plan:
  reviewers:
    - agent: designer
      enabled: false
```

### Review Rigor

| Setting | Default | Description |
|---------|---------|-------------|
| `review_loops.max_cycles` | 2 | Global max review loop iterations (all commands) |
| `review_loops.min_severity_to_address` | high | Global minimum severity that must be resolved |
| `implementation_plan.review_loops.max_cycles` | 3 | Per-command override for implementation plans |

### Document Paths

| Setting | Default | Description |
|---------|---------|-------------|
| `documents.requirements` | `docs/reqs/main.md` | Default PRD location |
| `documents.implementation_plan` | `docs/plans/main.md` | Default plan location |
| `documents.specs` | `docs/specs` | Technical specs directory |
| `documents.decisions` | `docs/specs/decisions` | Architecture Decision Records |
| `documents.rfcs` | `docs/specs/rfcs` | Requests for Comments |
| `documents.runbooks` | `docs/runbooks` | Operational runbooks |
| `documents.retros` | `docs/retros` | Retrospective documents |

## Design Philosophy

The Synthex uses a **convention over configuration** approach:

- **Without a config file:** All commands and agents use sensible embedded defaults. Everything works out of the box.
- **With a config file:** Projects can override specific settings. Only include what you want to change — unspecified values use defaults.
- **Config lives in the repo:** `.synthex/config.yaml` is a project file, version-controlled alongside code, so the team shares the same configuration.

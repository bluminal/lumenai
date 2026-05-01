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
5. **Creates document directories** (`docs/reqs/`, `docs/plans/`, `docs/specs/`, `docs/specs/decisions/`, `docs/specs/rfcs/`, `docs/runbooks/`, `docs/retros/`) if they don't exist
6. **Provides guidance** on customizing the configuration for your project

## Workflow

### 1. Check for Existing Configuration

Check if `@{config_path}` already exists.

- **If it exists:** Inform the user that a configuration already exists. Ask if they want to review it, reset it to defaults, or leave it as-is.
- **If it doesn't exist:** Proceed to create it.

### 2. Create Configuration File

Read the default configuration template from the plugin's `config/defaults.yaml` file (located relative to this command at `../config/defaults.yaml`) using the **Read** tool. Then create the directory `.synthex/` in the project root if it doesn't exist, and write the template content to `@{config_path}` using the **Write** tool.

**Implementation rules — strict:**

- Use the **Read** tool to load `defaults.yaml`. Use the **Write** tool to create the project config. **Do NOT use `cp`, `cat >`, `sed -i`, `tee`, or any shell command that takes the defaults path as an argument.** Shell commands trigger Claude Code's sensitive-file permission prompt (which flags both source and destination of `cp`) and risk argument-order bugs that could overwrite the plugin's defaults.
- The plugin's `defaults.yaml` is **read-only**. Never write to it, never pass it as a destination argument to any tool, never edit it. It is a template, not project state.
- The destination `@{config_path}` (default `.synthex/config.yaml`) is the only file this step creates.

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

Prompt the user to opt in to multi-model review. Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, local Ollama, etc.) and consolidates findings into a single attributed list. Off by default; this step allows the user to enable it during init.

#### 4a. Detection Scan

Emit a progress indicator before beginning:

```
Detecting installed CLIs...
```

For each candidate CLI in `[codex, gemini, ollama, llm, aws, claude]`, run BOTH a `which` check AND a lightweight auth check per the adapter's documented auth check command (D22 — auth pre-validation):

| CLI | `which` check | Auth check command |
|-----|---------------|--------------------|
| `codex` | `which codex` | `codex auth status` |
| `gemini` | `which gemini` | `gcloud auth list` |
| `ollama` | `which ollama` | `curl -sf http://localhost:11434/api/tags > /dev/null` |
| `llm` | `which llm` | `llm keys list` |
| `aws` | `which aws` | `aws sts get-caller-identity --output text` |
| `claude` | `which claude` | `claude --version` |

**All `which` and auth checks dispatch concurrently in a single parallel Bash batch** — preflight wall-clock is bounded by the slowest single check + collation overhead, not by the sum of per-CLI latencies.

Auth checks that exit 0 are treated as authenticated regardless of advisory text on stdout/stderr. Only the exit code determines the auth result.

Bucket results into three groups after collation:

- **detected-and-authenticated** — `which` AND auth check both exited 0
- **detected-but-unauthenticated** — `which` exited 0; auth check exited non-zero
- **not-detected** — `which` exited non-zero

#### 4b. Surface Three Options via AskUserQuestion

Use the `AskUserQuestion` tool to present the options:

> **Enable multi-model review (optional)?**
>
> Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, local Ollama, etc.) and consolidates findings into a single attributed list. This catches errors a single model would miss. Off by default; opt in by selecting one of the options below.
>
> Detection results: detected-and-authenticated [`<list of authenticated CLIs>`]; detected-but-unauthenticated [`<list with remediation hints>`]; not-detected [`<list>`].
>
> 1. **Enable with detected CLIs** — write `multi_model_review.enabled: true` + `reviewers: [<ONLY authenticated CLIs by name>]` to `.synthex/config.yaml`. Option label lists ONLY authenticated CLIs (D22 — option only includes CLIs that pass both `which` AND auth check).
> 2. **Enable later (show snippet)** — print a commented-out `multi_model_review:` YAML snippet matching the `multi_model_review:` block structure from `defaults.yaml`; detected CLIs appear as commented-out reviewers. User can uncomment when ready.
> 3. **Skip** — do not write any `multi_model_review` config. Default behavior preserved.

If the detection results include detected-but-unauthenticated CLIs, surface them SEPARATELY with remediation hints (per D22 — e.g., `"Detected but unauthenticated: gemini — run \`gcloud auth login\` to enable"`).

If no CLIs are detected-and-authenticated, option 1 is still presented but its label reads "Enable with detected CLIs (none currently authenticated — authenticate a CLI first)". The option remains available; the user can still choose it and fix auth afterward.

#### 4c. Data-Transmission Warning (FR-MR27)

BEFORE writing `enabled: true` to config (option 1 only), surface the following warning verbatim:

> **Heads up — data transmission**
>
> Multi-model review sends your code, diffs, and (for write-implementation-plan) draft plan markdown to the configured external CLIs. Each CLI relays this content to its underlying provider (OpenAI, Google, etc.) per the provider's terms of service. Synthex does not store, log, or modify this content beyond what's needed to invoke the CLI.
>
> If you need to keep all review content local, configure ONLY local-model adapters (Ollama, Bedrock with on-prem model) and remove hosted-model adapters from `reviewers`.

Proceed to write the config only after this warning is displayed.

#### 4d. Apply the Chosen Option

**Option 1 — Enable with detected CLIs:**

1. Display the data-transmission warning (step 4c).
2. Write the following keys to `.synthex/config.yaml`:
   - `multi_model_review.enabled: true`
   - `multi_model_review.reviewers: [<authenticated CLIs only>]` — list contains ONLY the CLIs that passed both `which` AND auth check (D22). Do NOT include detected-but-unauthenticated CLIs in this list.
3. Run the orchestrator's preflight subroutine (FR-MR20). Report the preflight summary in FR-MR20 format:
   - `N reviewers configured, M available, K families, aggregator: <name>`
   - **Preflight failure during init prints remediation but does NOT abort init.** The user can fix CLI auth and re-run preflight later.
4. Create `docs/reviews/` via `mkdir -p docs/reviews/` if not already present. Surface this in the init confirmation output (e.g., `"Created docs/reviews/ for audit artifacts"`).

**Option 2 — Enable later (show snippet):**

Print the following commented-out YAML snippet (structure matches the `multi_model_review:` block in `defaults.yaml`) to the terminal so the user can copy it into `.synthex/config.yaml` when ready:

```yaml
# multi_model_review:
#   enabled: true
#   reviewers:
#     # - codex-review-prompter      # OpenAI / Codex CLI  (codex login)
#     # - gemini-review-prompter     # Google / gcloud     (gcloud auth login)
#     # - ollama-review-prompter     # Local model         (ollama serve)
#   aggregator:
#     command: auto
```

Detected CLIs appear as commented-out reviewers in the snippet. Do NOT write any `multi_model_review` keys to `.synthex/config.yaml`.

**Option 3 — Skip:**

Do not write any `multi_model_review` config. The feature remains disabled (default behavior preserved per FR-MR23).

#### Anti-pattern: do NOT write API keys to config

Synthex is CLI-only. The config does NOT contain API keys. Auth is the responsibility of each CLI's native auth flow (`codex login`, `gcloud auth login`, `ollama serve`, etc.). Never prompt for or store API keys during init.

### 5. Update .gitignore

Check if `.gitignore` exists in the project root. If it does, check whether it already contains an entry for the worktrees base path (`.claude/worktrees` by default, or the value from the config file).

- **If `.gitignore` exists and does NOT contain the worktrees path:** Append the following block to the end of the file:

```
# Synthex worktrees (parallel task execution)
.claude/worktrees/
```

- **If `.gitignore` exists and already contains the path:** Do nothing.
- **If `.gitignore` does not exist:** Create it with the worktrees entry above.

### 6. Create Document Directories

Create the following directories if they don't already exist:
- `docs/reqs/` — Product requirements documents
- `docs/plans/` — Implementation plans
- `docs/specs/` — Technical specifications
- `docs/specs/decisions/` — Architecture Decision Records (ADRs)
- `docs/specs/rfcs/` — Requests for Comments (RFCs)
- `docs/runbooks/` — Operational runbooks
- `docs/retros/` — Retrospective documents

Do NOT create any files inside these directories — just the directories.

### 7. Confirm and Guide

Inform the user what was created and provide guidance:

```
Synthex initialized for this project.

Created:
  .synthex/config.yaml           — Project configuration (concurrent_tasks: {chosen_value})
  .gitignore                     — Added worktrees path (if not present)
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

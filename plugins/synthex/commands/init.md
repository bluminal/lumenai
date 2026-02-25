# Initialize Synthex

Set up the Synthex plugin configuration for a project. This command scaffolds the configuration file and document directories needed for the plugin to operate.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where to create the config file | `.synthex/config.yaml` | No |

## What This Command Does

1. **Creates the project configuration file** at `.synthex/config.yaml` (or custom path)
2. **Updates `.gitignore`** to exclude the worktrees directory (`.claude/worktrees/`) if not already present
3. **Creates document directories** (`docs/reqs/`, `docs/plans/`, `docs/specs/`, `docs/specs/decisions/`, `docs/specs/rfcs/`, `docs/runbooks/`, `docs/retros/`) if they don't exist
4. **Provides guidance** on customizing the configuration for your project

## Workflow

### 1. Check for Existing Configuration

Check if `@{config_path}` already exists.

- **If it exists:** Inform the user that a configuration already exists. Ask if they want to review it, reset it to defaults, or leave it as-is.
- **If it doesn't exist:** Proceed to create it.

### 2. Create Configuration File

Read the default configuration template from the plugin's `config/defaults.yaml` file (located relative to this command at `../config/defaults.yaml`).

Create the directory `.synthex/` in the project root if it doesn't exist, then write the defaults template to `@{config_path}`.

### 3. Update .gitignore

Check if `.gitignore` exists in the project root. If it does, check whether it already contains an entry for the worktrees base path (`.claude/worktrees` by default, or the value from the config file).

- **If `.gitignore` exists and does NOT contain the worktrees path:** Append the following block to the end of the file:

```
# Synthex worktrees (parallel task execution)
.claude/worktrees/
```

- **If `.gitignore` exists and already contains the path:** Do nothing.
- **If `.gitignore` does not exist:** Create it with the worktrees entry above.

### 4. Create Document Directories

Create the following directories if they don't already exist:
- `docs/reqs/` — Product requirements documents
- `docs/plans/` — Implementation plans
- `docs/specs/` — Technical specifications
- `docs/specs/decisions/` — Architecture Decision Records (ADRs)
- `docs/specs/rfcs/` — Requests for Comments (RFCs)
- `docs/runbooks/` — Operational runbooks
- `docs/retros/` — Retrospective documents

Do NOT create any files inside these directories — just the directories.

### 5. Confirm and Guide

Inform the user what was created and provide guidance:

```
Synthex initialized for this project.

Created:
  .synthex/config.yaml           — Project configuration
  .gitignore                     — Added worktrees path (if not present)
  docs/reqs/                     — Product requirements (PRDs)
  docs/plans/                    — Implementation plans
  docs/specs/                    — Technical specifications
  docs/specs/decisions/          — Architecture Decision Records (ADRs)
  docs/specs/rfcs/               — Requests for Comments (RFCs)
  docs/runbooks/                 — Operational runbooks
  docs/retros/                   — Retrospective documents

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
  - Adjust rigor:     Change max_review_cycles or min_severity_to_address
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
| `max_review_cycles` | 3 | Maximum review loop iterations before forcing completion |
| `min_severity_to_address` | high | Minimum severity the PM must resolve (critical, high, medium, low) |

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

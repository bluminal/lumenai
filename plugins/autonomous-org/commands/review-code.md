# Review Code

Comprehensive, multi-perspective code review combining craftsmanship review, security analysis, and optional performance assessment — all run in parallel for fast, thorough feedback.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `target` | File paths, directory, or git diff range to review | staged changes (`git diff --cached`) | No |
| `config_path` | Path to autonomous-org project config | `.autonomous-org/config.yaml` | No |

## Core Responsibilities

You orchestrate a multi-agent code review that produces a unified, actionable report. Each reviewer operates independently in parallel, then you consolidate their findings into a single verdict.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. If it exists, load the code review configuration and merge with defaults. If it does not exist, use the defaults from the plugin's `config/defaults.yaml`.

**Default values:**

| Setting | Default |
|---------|---------|
| `code_review.reviewers` | `[code-reviewer, security-reviewer]` |
| `code_review.max_diff_lines` | `300` |
| `code_review.convention_sources` | `[CLAUDE.md, .eslintrc, .prettierrc]` |

### 2. Determine Review Scope

Resolve what code to review based on the `target` parameter:

- **No target provided:** Review staged changes (`git diff --cached`). If nothing is staged, review unstaged changes (`git diff`). If no changes at all, inform the user and exit.
- **File/directory path:** Review the specified files
- **Git range (e.g., `main..HEAD`):** Review the diff for that range

**Diff size check:** If the diff exceeds `max_diff_lines`, warn the user and suggest splitting the review into smaller chunks. Large diffs produce lower-quality reviews. Proceed if the user confirms.

### 3. Gather Context

Before launching reviewers, gather context they'll need:

- Read `@CLAUDE.md` for project conventions
- Read convention sources from config (e.g., `.eslintrc`, `.prettierrc`)
- Identify the programming language(s) and frameworks in the diff

### 4. Launch Reviewers in Parallel

For each enabled reviewer in the configuration, launch a sub-agent IN PARALLEL:

**Code Reviewer sub-agent:**
- Provide the full diff and project context
- Ask for a craftsmanship review (correctness, maintainability, convention adherence, specification compliance, reuse opportunities)
- Expect structured output with PASS/WARN/FAIL verdict and severity-ranked findings

**Security Reviewer sub-agent:**
- Provide the full diff and project context
- Ask for a security-focused review (vulnerabilities, secrets, injection, access control)
- Expect structured output with PASS/WARN/FAIL verdict and severity-ranked findings

**Performance Engineer sub-agent (optional, if enabled in config):**
- Provide the full diff and project context
- Ask for a performance-focused review (algorithmic complexity, bundle impact, query patterns, caching)
- Expect structured output with PASS/WARN/FAIL verdict and severity-ranked findings

**Design System Agent sub-agent (automatic for UI changes):**
- If the diff contains frontend/UI files (`.tsx`, `.jsx`, `.css`, `.scss`, `.vue`, `.svelte`), automatically invoke the Design System Agent for compliance review
- This runs in parallel with the other reviewers

### 5. Consolidate Results

Merge all reviewer outputs into a unified report:

```markdown
## Code Review Report

### Reviewed: [target description]
### Date: [YYYY-MM-DD]

---

### Overall Verdict: [PASS | WARN | FAIL]

| Reviewer | Verdict | Findings |
|----------|---------|----------|
| Code Reviewer | [PASS/WARN/FAIL] | [count by severity] |
| Security Reviewer | [PASS/WARN/FAIL] | [count by severity] |
| Performance Engineer | [PASS/WARN/FAIL or N/A] | [count by severity] |
| Design System | [PASS/WARN/FAIL or N/A] | [count by severity] |

---

### CRITICAL Findings
[All CRITICAL findings from all reviewers, grouped]

### HIGH Findings
[All HIGH findings from all reviewers, grouped]

### MEDIUM Findings
[All MEDIUM findings from all reviewers, grouped]

### LOW Findings
[All LOW/Nit findings from all reviewers, grouped]

---

### What's Done Well
[Positive observations from all reviewers — always included]

---

### Summary
[2-3 sentence overall assessment and recommended next steps]
```

**Verdict consolidation rules:**
- **FAIL** if ANY reviewer returns FAIL (any CRITICAL or HIGH finding)
- **WARN** if ANY reviewer returns WARN (MEDIUM findings only)
- **PASS** if ALL reviewers return PASS

### 6. Present Results

Present the consolidated report to the user. If the verdict is FAIL or WARN, provide clear guidance on which findings to address first (ordered by severity, then by reviewer priority).

---

## Configuration

```yaml
# .autonomous-org/config.yaml (code_review section)
code_review:
  # Reviewers to run in parallel
  reviewers:
    - code-reviewer       # Craftsmanship review (always recommended)
    - security-reviewer   # Security review (always recommended)
    # - performance-engineer  # Uncomment for performance-critical code

  # Maximum diff size before warning
  max_diff_lines: 300

  # Files to read for project conventions
  convention_sources:
    - CLAUDE.md
    - .eslintrc
    - .prettierrc

  # Specification paths for compliance checking (used by Code Reviewer)
  spec_paths:
    - docs/specs

  # Additional specialist reviewers (optional)
  # specialists: []
```

---

## Critical Requirements

- All reviewers run IN PARALLEL for speed
- Every finding must include a specific file location and actionable suggestion
- The consolidated report must preserve all findings from all reviewers — never drop or summarize away individual findings
- The "What's Done Well" section is mandatory — balanced feedback is essential
- Design system compliance is automatically included for UI changes without explicit configuration
- The overall verdict follows the strictest reviewer (one FAIL = overall FAIL)

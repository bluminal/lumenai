# Design System Audit

Audit the frontend codebase for design system compliance — identifying hardcoded values, incorrect component usage, accessibility violations, and opportunities to improve visual consistency.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `scope` | File paths or directory to audit | configured `design_system.scan_paths` | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

You invoke the **Design System Agent sub-agent** to perform a comprehensive compliance audit of the frontend codebase against the project's design system specification.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load the design system configuration.

**Default values:**

| Setting | Default |
|---------|---------|
| `design_system.spec_path` | `docs/specs/design-system.md` |
| `design_system.scan_paths` | `[src/]` |

### 2. Locate Design System Specification

Read the design system specification at the configured `spec_path`. This document defines:
- Token registry (colors, spacing, typography, breakpoints)
- Component catalog (approved components and their APIs)
- Pattern library (approved UI patterns)

If the specification doesn't exist, inform the user:

```
No design system specification found at [spec_path].

To create one, you can:
1. Ask the Design System Agent to generate an initial spec from your existing codebase
2. Create one manually at [spec_path]
3. Update the path in .synthex/config.yaml under design_system.spec_path
```

### 3. Identify Files to Audit

Resolve the audit scope:
- **Explicit scope provided:** Audit the specified files/directories
- **No scope provided:** Scan all paths configured in `design_system.scan_paths`
- Filter to frontend files only: `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`, `.less`, `.module.css`

### 4. Launch Design System Agent

Invoke the **Design System Agent sub-agent** in Compliance Review mode. Provide:

- The design system specification document
- The list of files to audit
- The project's `CLAUDE.md` for additional context

The Design System Agent produces a compliance report:

```markdown
## Design System Compliance Review

### Summary
[Overall compliance assessment: PASS / WARN / FAIL and 1-2 sentence overview]

### Token Violations
| Location | Violation | Current Value | Should Be |
|----------|-----------|---------------|-----------|
| [file:line] | Hardcoded color | `#3b82f6` | `var(--color-primary)` |
| [file:line] | Hardcoded spacing | `16px` | `var(--space-4)` |
| [file:line] | Hardcoded font-size | `14px` | `var(--text-sm)` |
| [file:line] | Hardcoded breakpoint | `768px` | `var(--breakpoint-md)` |

### Component Usage Issues

#### [MEDIUM | LOW] Issue Title
- **Location:** [File path and line number]
- **Issue:** [What's wrong with the component usage]
- **Recommendation:** [Which design system component/pattern to use instead]

### Accessibility Findings

#### [CRITICAL | HIGH | MEDIUM | LOW] Issue Title
- **Location:** [File path and line number]
- **WCAG Criterion:** [e.g., 1.4.3 Contrast (Minimum)]
- **Issue:** [Accessibility violation]
- **Remediation:** [Specific fix]

### Recommendations
[General suggestions for better design system utilization]
```

### 5. Present Results

Present the compliance report to the user with a summary:

```
Design System Audit Complete

Verdict: [PASS / WARN / FAIL]
Files audited: [count]
Token violations: [count]
Component issues: [count]
Accessibility findings: [count by severity]

Top priority fixes:
1. [Most critical finding]
2. [Second most critical]
3. [Third most critical]
```

---

## Configuration

```yaml
# .synthex/config.yaml (design_system section)
design_system:
  # Path to the design system specification document
  spec_path: docs/specs/design-system.md

  # Directories to scan during audits
  scan_paths:
    - src/

  # Design system specialist sub-agents (optional)
  # specialists:
  #   - agent: storybook-expert
  #     focus: "Storybook configuration and story authoring"
```

---

## Critical Requirements

- Every hardcoded value that has a corresponding design token MUST be flagged — this is the primary purpose of the audit
- Accessibility findings must reference specific WCAG 2.1 criteria
- The audit must be actionable — every finding must include the specific fix (the correct token name, the right component, the proper ARIA attribute)
- The audit does NOT modify any files — it is purely advisory. The user or a follow-up task addresses the findings.
- If no design system specification exists, the command should help the user create one rather than producing an empty audit

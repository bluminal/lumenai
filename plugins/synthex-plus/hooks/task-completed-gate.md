# TaskCompleted Review Gate

> Behavioral specification for the TaskCompleted hook. This is the single source of truth for how the system evaluates completed tasks before accepting them as done.

## Purpose

The TaskCompleted review gate ensures every implementation task passes a quality check before the team accepts it as complete. When a teammate marks a task as `completed` on the shared task list, this hook intercepts the completion event, detects the type of work performed, routes to the appropriate reviewer agents, and either allows or blocks completion based on their verdicts.

- Shell entry point: `plugins/synthex-plus/scripts/task-completed-gate.sh` (thin shim, exit codes only)
- Hook registration: `plugins/synthex-plus/hooks/hooks.json` (event: `TaskCompleted`)
- Configuration: `hooks.task_completed.review_gate` in `.synthex-plus/config.yaml` (or `plugins/synthex-plus/config/defaults.yaml`)

The shell shim contains no business logic (D5). All routing decisions, work type classification, and verdict handling are defined here and executed by the prompt-mediated review system.

---

## Skip Conditions

Before performing any work type detection or reviewer routing, check these conditions in order. If any condition is met, exit immediately with code 0 (allow completion).

1. **Review gate disabled:** If `hooks.task_completed.review_gate.enabled` is `false`, exit 0. No review is performed.
2. **Documentation-only change:** If work type detection (see below) classifies the task as `documentation`, exit 0. Documentation changes do not require a review gate.

---

## Work Type Detection

Classify the completed task into exactly one work type based on the files modified during the task. The task's completion note (reported by the implementing teammate when marking the task as `completed`) lists the files that were created, modified, or deleted.

### Classification Rules

Evaluate file extensions and paths in priority order. The first matching rule determines the work type.

| Priority | Work Type | Matching Criteria |
|----------|-----------|-------------------|
| 1 | **Infrastructure** | Any modified file matches: `*.tf`, `*.tfvars`, `*.hcl`, `Dockerfile`, `docker-compose*.yml`, `*.yaml`/`*.yml` under `k8s/`, `kubernetes/`, `deploy/`, `infra/`, or `cloudformation/` directories, `serverless.yml`, `*.cdk.ts` |
| 2 | **Frontend** | Any modified file matches: `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `*.less`, `*.module.css`, `*.svg` under `src/` or `app/`, or files under directories named `components/`, `pages/`, `layouts/`, `styles/`, `public/`, `assets/` |
| 3 | **Test** | All modified files are test files: `*.test.ts`, `*.test.tsx`, `*.test.js`, `*.test.jsx`, `*.spec.ts`, `*.spec.tsx`, `*.spec.js`, `*.spec.jsx`, or files under `__tests__/`, `tests/`, `test/`, `e2e/`, `cypress/`, `playwright/` directories |
| 4 | **Code** | Any modified file matches: `*.ts`, `*.js`, `*.py`, `*.go`, `*.rs`, `*.java`, `*.rb`, `*.php`, `*.swift`, `*.kt`, `*.cs`, `*.c`, `*.cpp`, `*.h`, `*.hpp`, or other recognized source code extensions |
| 5 | **Documentation** | All modified files are: `*.md`, `*.mdx`, `*.txt`, `*.rst`, `*.adoc`, or files under `docs/` directories with no source code files present |

### Ambiguity Resolution

- If a task modifies both source code and test files, classify as the source code type (code, frontend, or infrastructure) -- not test. Tests accompanying source changes are reviewed alongside the source.
- If a task modifies both frontend and backend source files, classify as **frontend** -- the frontend classification is a superset that includes the design system reviewer.
- If no files are listed in the completion note, classify as **code** (the most common default) and proceed with the standard code reviewers.

---

## Reviewer Routing

After determining the work type, invoke the reviewer agents specified by the configuration at `hooks.task_completed.review_gate.reviewers`.

### Default Routing Table

| Work Type | Reviewers | Config Path |
|-----------|-----------|-------------|
| Code | `code-reviewer`, `security-reviewer` | `hooks.task_completed.review_gate.reviewers.code` |
| Frontend | `code-reviewer`, `security-reviewer`, `design-system-agent` | `hooks.task_completed.review_gate.reviewers.frontend` |
| Infrastructure | `code-reviewer`, `terraform-plan-reviewer` | `hooks.task_completed.review_gate.reviewers.infrastructure` |
| Test | `code-reviewer` | (hardcoded -- not configurable) |
| Documentation | *(no review -- skip condition)* | N/A |

### Reviewer Invocation

- Reviewers are invoked as subagents within the Reviewer and Security teammate sessions defined in the active team template (e.g., `templates/implementation.md`).
- Each reviewer receives: the task description, the list of modified files, and the diff of changes made by the implementing teammate.
- Reviewers execute concurrently when multiple are assigned. The hook waits for all reviewers to complete before evaluating verdicts.
- Each reviewer produces a structured verdict following the standard Synthex reviewer output format: `PASS`, `WARN`, or `FAIL` with severity-ranked findings.

---

## Verdict Handling

After all assigned reviewers have completed their assessment, evaluate the combined verdicts to determine the hook's exit behavior.

### FAIL -- Any Reviewer Returns FAIL (Exit Code 2)

If **any** reviewer produces a `FAIL` verdict (indicating CRITICAL or HIGH severity findings):

1. **Block task completion:** Return exit code 2, which prevents the task from transitioning to `completed` status.
2. **Reopen the task:** If `hooks.task_completed.review_gate.auto_reopen_on_fail` is `true` (default), set the task back to `in_progress` on the shared task list. Attach the review findings to the task description as an addendum so the implementing teammate has full context for iteration.
3. **Notify the implementer:** Send a mailbox message (type: `message`) to the teammate who originally completed the task. The message includes:
   - Which reviewer(s) returned FAIL
   - The specific CRITICAL and HIGH findings that must be addressed
   - Any MEDIUM/LOW findings included for awareness (not required for resolution)
4. **Do not notify the lead** about FAIL verdicts -- the implementer iterates directly. The lead observes the reopened task on the shared task list during normal progress monitoring.

### PASS -- All Reviewers Return PASS (Exit Code 0)

If **all** reviewers produce a `PASS` verdict (no findings, or only LOW/"Nit" findings):

1. **Allow task completion:** Return exit code 0. The task transitions to `completed` status.
2. **Notify the team lead:** Send a mailbox message (type: `message`) to the lead confirming the quality gate passed. Include a brief summary: task name, work type, reviewers invoked, and the PASS verdict.

### WARN -- No FAIL, But Warnings Exist (Exit Code 0)

If **no** reviewer produces a `FAIL` verdict, but one or more produce a `WARN` verdict (MEDIUM severity findings):

1. **Allow task completion:** Return exit code 0. WARN findings do not block completion.
2. **Notify the team lead:** Send a mailbox message (type: `message`) to the lead with the WARN findings documented. Include:
   - Which reviewer(s) returned WARN
   - The specific MEDIUM findings for the lead's awareness
   - A note that completion was allowed despite warnings
3. The lead decides whether to create follow-up tasks to address WARN findings or accept them as-is.

### Verdict Precedence

When multiple reviewers return different verdicts, apply this precedence (highest to lowest):

1. **FAIL** -- any single FAIL from any reviewer blocks completion
2. **WARN** -- any single WARN (with no FAIL) allows completion with notification
3. **PASS** -- all reviewers must return PASS for a clean pass

---

## Configuration Reference

All configuration lives under the `hooks.task_completed.review_gate` path in the project's `.synthex-plus/config.yaml`. If no project config exists, the defaults from `plugins/synthex-plus/config/defaults.yaml` apply.

```yaml
hooks:
  task_completed:
    review_gate:
      # Master switch for the review gate.
      # Set to false to disable all task completion reviews.
      # Default: true
      enabled: true

      # Automatically reopen tasks that receive a FAIL verdict.
      # When true, the task returns to in_progress with findings attached.
      # When false, the task is blocked (exit 2) but not reopened -- the
      # lead must manually reassign.
      # Default: true
      auto_reopen_on_fail: true

      # Reviewer agents by work type.
      # Each key maps to a list of Synthex agent names that will review
      # completed tasks of that type.
      # Test and Documentation types are not configurable:
      #   test -> code-reviewer only (hardcoded)
      #   documentation -> skipped (no review)
      reviewers:
        code: [code-reviewer, security-reviewer]
        frontend: [code-reviewer, security-reviewer, design-system-agent]
        infrastructure: [code-reviewer, terraform-plan-reviewer]
```

### Config Resolution Order

1. Project config at `.synthex-plus/config.yaml` (highest priority)
2. Plugin defaults at `plugins/synthex-plus/config/defaults.yaml`
3. Hardcoded fallbacks: `enabled: true`, `auto_reopen_on_fail: true`, code reviewers: `[code-reviewer, security-reviewer]`

---

## Exit Code Summary

| Exit Code | Meaning | When |
|-----------|---------|------|
| 0 | Allow task completion | PASS verdict, WARN verdict, review gate disabled, documentation-only change |
| 2 | Block task completion | FAIL verdict from any reviewer |

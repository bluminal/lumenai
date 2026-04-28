# Team Review

Multi-perspective code review using a persistent agent team where reviewers work concurrently and can discuss findings with each other. This is the teams-optimized equivalent of Synthex's `review-code` command.

Unlike `review-code` which spawns isolated subagent reviewers that cannot communicate, `team-review` creates a persistent team where reviewers can message each other directly. When the Code Reviewer spots a potential security issue, it alerts the Security Reviewer via mailbox rather than silently noting it in its own report. This cross-domain communication produces more thorough analysis, especially for large or high-risk changesets.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `target` | File paths, directory, or git diff range to review | staged changes | No |
| `template` | Team composition template to use | Value from config `teams.default_review_template`, falling back to `review` | No |
| `config_path` | Path to Synthex+ configuration | `.synthex-plus/config.yaml` | No |
| `multi_model` | Enable multi-model review: run the `multi-model-review-orchestrator` alongside the native team per FR-MMT3/FR-MMT19. Overrides config when explicitly set. | Resolved via `Resolve multi-model state` chain (see Workflow) | No |

**Config resolution order:** command parameter > project config (`{config_path}`) > plugin defaults (`config/defaults.yaml`) > hardcoded fallback.

## Workflow

### 1. Load Configuration

Load the Synthex+ configuration using the same resolution chain as team-implement Step 1.

Extract the following values for use in subsequent steps:
- `teams.default_review_template` -- template name (unless overridden by `template` parameter)
- `cost_guidance.*` -- cost estimation constants
- `review_loops.*` -- review cycle limits (max_cycles, min_severity_to_address)
- `documents.specs` -- specification paths for reviewer context

After configuration is loaded, resolve multi-model state per the `Resolve multi-model state` step before proceeding.

### 1a. Resolve multi-model state

Resolve the `multi_model` flag using the following resolution chain (highest priority first):

1. **Command parameter** — if `multi_model` was passed explicitly (e.g., `--multi-model` flag or `multi_model=true/false`), use that value. This overrides all config settings.
2. **Per-command config** — if no command parameter, read `multi_model_review.per_command.team_review.enabled` from the resolved config (`.synthex/config.yaml` merged onto `plugins/synthex/config/defaults.yaml`).
3. **Global config** — if the per-command key is absent or null, fall back to `multi_model_review.enabled`.
4. **Default** — if neither config key is set, resolve to `false`.

Store the resolved boolean as `multi_model_active`. Subsequent steps reference this as the "Resolve multi-model state" result.

When `multi_model_active` is `true`, subsequent steps apply the multi-model overlays per FR-MMT3/FR-MMT4/FR-MMT20. When `false`, behavior is byte-identical to today's `/team-review` (no orchestrator spawned, no overlay composed).

### 2. Determine Review Scope

Resolve the changeset to review based on the `target` parameter:

- **No target provided:** Review staged changes (`git diff --cached`). If nothing is staged, review unstaged changes (`git diff`). If no changes at all, inform the user and exit: "No staged or unstaged changes found. Provide a target (file path, directory, or git range) or stage changes first."
- **File/directory path:** Review the specified files directly
- **Git range (e.g., `main..HEAD`):** Review the diff for that range

**Calculate diff metrics:**
- Count the total lines changed (additions + deletions)
- Identify the number of files affected
- Categorize files by type: frontend (`.tsx`, `.jsx`, `.css`, `.scss`, `.vue`, `.svelte`), infrastructure (`.tf`, `.tfvars`), general code (everything else)
- Record the short git SHA for team naming: the first 8 characters of the HEAD commit SHA for the target, or the SHA of the most recent commit in the range

**Diff size check:** If the diff exceeds `code_review.max_diff_lines` (default 300), warn the user:
```
Warning: Diff is {line_count} lines, exceeding the recommended {max_diff_lines} limit.
Large diffs may produce lower-quality reviews. Consider splitting into smaller changesets.
Proceed anyway? [Y/n]
```

**Display scope summary:**
```
Review scope:
  Target: {target_description}
  Files: {file_count} files ({frontend_count} frontend, {infra_count} infrastructure, {general_count} general)
  Diff size: {line_count} lines (+{additions} / -{deletions})
  Reviewers: {reviewer_list} (from {template_name} template)
```

### 3. Pre-Flight Checks

Pre-flight checks follow the same procedure as team-implement Step 3 (one-team-per-session, dependency check, orphan detection). The same checks apply without modification.

### 4. Cost Estimate

Display the cost estimate following the canonical template in `plugins/synthex-plus/docs/output-formats.md`.

For team-review:
- `{fallback_command}` = `review-code`
- `{team_command}` = `team-review`
- `num_tasks` = count of active reviewer roles (from the resolved template, after applying auto-inclusion rules from Step 2's file categorization)
- `num_teammates` = total teammate count including lead

Same skip behavior as team-implement: when `cost_guidance.show_cost_comparison` is `false`, skip the estimate and confirmation prompt entirely.

Include this caveat after the canonical display: the formula assumes all teammates interact with all tasks. For review teams, the estimate is closer to actual cost because each reviewer examines the full scope.

**User confirmation:** After displaying the estimate, prompt "Proceed with team creation? [Y/n]". If the user declines, abort gracefully with no side effects.

### 5. Create Team

Compose and issue a team creation prompt using the **read-on-spawn pattern** (ADR-plus-001). Each teammate receives a three-layer prompt: identity from the canonical Synthex agent file, team-specific behavioral overlay from the template, and review-specific context.

#### 5a. Read the review template

Read the team template file determined in Step 1 (default: `plugins/synthex-plus/templates/review.md`). Extract:

- **Roles table** -- Role name, Synthex agent file path, required flag, and team-specific behavioral overlay for each teammate
- **Communication patterns section** -- Mailbox conventions, cross-domain messaging rules
- **Task decomposition guidance section** -- How the lead creates review tasks, parallel execution rules

**Auto-inclusion rules:** Apply the following rules based on file categorization from Step 2:
- **Performance reviewer:** Include only when `review.include_performance` is enabled in the project config, or when explicitly requested via command flag
- **Design reviewer:** Automatically include when the changeset contains frontend files (`.tsx`, `.jsx`, `.css`, `.scss`, `.vue`, `.svelte`)

#### 5a-validation. Multi-model reviewer roster validation (when `multi_model_active` is `true`)

When `Resolve multi-model state` resolves to `multi_model_active: true`, validate the active reviewer roster against the v1-supported set before composing spawn prompts:

**v1-supported reviewers for multi-model mode:** `code-reviewer`, `security-reviewer`, `design-system-agent`, `performance-engineer`.

For each active reviewer role resolved from the template (after applying auto-inclusion rules above):
- If the reviewer's Synthex agent name is NOT in the v1-supported set, abort immediately with this error (verbatim):

```
Multi-model mode is not supported for reviewer '<name>' in v1. Supported reviewers for multi-model pools: code-reviewer, security-reviewer, design-system-agent, performance-engineer. Either remove this reviewer from the roster, or omit --multi-model.
```

Where `<name>` is replaced with the unsupported reviewer's agent name (e.g., `quality-engineer`).

**Abort behavior:** No team is created (`Teammate` spawn is NOT called). The user is presented with the error and the command exits. No side effects (no `.synthex-plus/.active-team` file written, no tasks created).

**When `multi_model_active: false`:** This validation is skipped entirely. Any reviewer supported by the template is valid.

#### 5b. Compose the team creation prompt

For each active role in the template, compose a spawn prompt with three layers:

1. **Identity (read-on-spawn):**
   ```
   Read your agent definition at {agent_file_path} and adopt it as your identity.
   ```
   - The teammate reads the complete Synthex agent markdown file as its first action
   - No condensed summaries -- the canonical agent file IS the identity

2. **Team-specific behavioral overlay:**
   - Sourced directly from the template's roles table "Team-Specific Behavioral Overlay" column
   - Mailbox conventions, task list conventions, cross-domain messaging patterns
   - These overlay instructions supplement the base agent identity -- they do not replace it

3. **Context:**
   - Reference to `CLAUDE.md` for project conventions
   - Reference to relevant specs (from config `documents.specs`)
   - The diff scope: commit range, file list, diff command to read the changeset
   - Convention sources from config (`code_review.convention_sources`)

When `multi_model_active: true`, a fourth layer is added (Step 5b-4 below): the Multi-Model Conditional Overlay from `templates/review.md`, included verbatim.

#### 5b-4. Multi-model overlay composition (when `multi_model_active` is `true`)

When `Resolve multi-model state` resolves to `multi_model_active: true`, compose spawn prompts as follows — **no template engine; verbatim Markdown inclusion**:

1. Read `plugins/synthex-plus/templates/review.md`.
2. Extract the entire `### Multi-Model Conditional Overlay (apply when multi_model=true)` section verbatim — from the heading line through the end of the section (stop at the next `---` or `###` heading at the same level).
3. Include this overlay verbatim in **both** the Lead's spawn prompt AND each native reviewer's spawn prompt. The overlay section contains both sub-instructions; the host model routes each sub-instruction to the appropriate role (Lead reads the Lead-suppression sub-section; reviewers read the Reviewer JSON-envelope sub-section).
4. When `multi_model_active` is `false`, the overlay section is omitted entirely — it is NOT included in any spawn prompt.

**Verification:** Inspect the composed spawn-prompt blob (the string written into the team creation prompt) and assert presence or absence of the overlay text as a raw-string match. This is the Q2 resolution per D22: the test surface is the composed spawn-prompt blob, not a live teammate or a rendered template.

#### 5c. Include auto-compaction guidance (FR-CW3)

The team creation prompt must include guidance about Claude Code's auto-compaction behavior:

- Teammates may lose detailed memory of earlier work when context compaction occurs
- Task descriptions on the shared task list serve as the durable record
- The lead's consolidation is the authoritative final output
- When in doubt about prior state, check the task list and mailbox before re-doing work

#### 5d. Team naming convention

The team name follows the pattern: `review-{short-hash}` where `{short-hash}` is the first 8 characters of the git SHA identified in Step 2.

Example: `review-a3f7b2c1`

#### 5e. Illustrative spawn prompt

```
Create a team named "review-a3f7b2c1" with the following teammates:

Lead (Review Orchestrator):
  You are the review team lead and orchestrator. You do not have a separate
  Synthex agent identity. Your responsibilities:
  - Create one review task per active reviewer role on the shared task list
  - Each task includes: the diff scope, files to review, relevant specs,
    and the reviewer's specific focus area
  - Monitor reviewer progress via TaskList
  - After all review tasks complete, consolidate findings into a unified report
  - Apply verdict precedence: FAIL > WARN > PASS
  - Produce the consolidated report in Synthex review-code output format

Craftsmanship (Code Reviewer):
  Read your agent definition at plugins/synthex/agents/code-reviewer.md and
  adopt it as your identity. Additionally:
  - Claim your review task from the shared task list
  - Send your findings to Lead via mailbox on task completion
  - If you discover potential security issues, message Security directly
    with the file path and code snippet
  - Use your standard Synthex code-reviewer output format for findings

Security (Security Reviewer):
  Read your agent definition at plugins/synthex/agents/security-reviewer.md
  and adopt it as your identity. Additionally:
  - Claim your review task from the shared task list
  - Send your findings to Lead via mailbox on task completion
  - If security findings overlap with code quality, message Craftsmanship
    directly with the finding details
  - Use your standard Synthex security-reviewer output format for findings

The changeset under review is: git diff main..HEAD
Files affected: src/auth/login.ts, src/auth/session.ts, src/api/routes.ts
Relevant specs: docs/specs/auth.md

Note on context compaction: Your conversation context may be compacted during
review. The shared task list is your durable memory -- always check it for
current state. The Lead's consolidated report is the authoritative final output.
```

#### 5f. Issue the team creation prompt

After composing the prompt:

- Issue the team creation prompt to Claude Code using the `Teammate` tool with the `spawnTeam` operation
- The team name is `review-{short-hash}` as defined in 5d
- Each role from the template becomes a named teammate in the spawn call
- Wait for confirmation that the team was created successfully before proceeding
- If team creation fails, display the error and abort -- do not retry automatically

#### 5g. Instantiate multi-model orchestrator (when `multi_model_active` is `true`)

When `Resolve multi-model state` resolves to `multi_model_active: true`, immediately after the team is created (Step 5f confirmation received), instantiate the `multi-model-review-orchestrator` in the host session:

**How to invoke:** Use the Task tool from the host session — NOT via the `Teammate` API. The orchestrator is not a teammate; it runs as a host-session agent alongside the team (FR-MMT3 step 3, criterion 2).

**Task tool invocation — pass these four required inputs:**

```
{
  command: "team-review",
  artifact_path: <diff scope resolved in Step 2 — git range, file path, or staged-changes path>,
  native_reviewers: <list of active reviewer names from the resolved template, e.g. ["code-reviewer", "security-reviewer"]>,
  config: <resolved multi_model_review config block from .synthex/config.yaml merged onto defaults.yaml>
}
```

**Parallelism:** The orchestrator **runs in parallel with team execution** (FR-MMT21 step 2). After issuing the orchestrator Task, do not wait for it before proceeding to Step 6 (Post-Creation Verification) and Step 7 (Create Review Tasks). The orchestrator and the native team execute concurrently; the orchestrator will wait for native review tasks to reach `completed` status before beginning consolidation.

**Wall-clock time:** wall-clock time for a multi-model `/team-review` invocation is `max(slowest native reviewer, slowest external adapter)` — NOT the sum. Native and external work runs in parallel.

**When `multi_model_active: false`:** This step is skipped entirely. No orchestrator is spawned. Behavior is byte-identical to standard `/team-review`.

### 6. Post-Creation Verification

Post-creation verification follows the same procedure as team-implement Step 6 (inspect team metadata, handle missing roles, prompt-based fallback, display verification summary).

### 7. Create Review Tasks

After the team is verified, the lead creates one review task per active reviewer role on the shared task list.

#### 7a. Task creation

For each active reviewer, create a task via `TaskCreate`:

- **Subject:** "{Reviewer role} review of {target_description}" (e.g., "Craftsmanship review of main..HEAD")
- **Description:** Includes the following elements:
  - The diff command or file paths so the reviewer can read the changeset directly (e.g., `git diff main..HEAD` or explicit file list)
  - Relevant specification links from `documents.specs` and `code_review.spec_paths`
  - Convention sources from `code_review.convention_sources` (e.g., CLAUDE.md, .eslintrc)
  - The reviewer's specific focus area:
    - **Craftsmanship:** Code quality, conventions, maintainability, specification compliance, reuse opportunities
    - **Security:** Vulnerabilities, secrets, injection vectors, access control, CWE references
    - **Performance:** Algorithmic complexity, bundle impact, query patterns, caching, quantified impact estimates
    - **Design:** Design token compliance, accessibility, component patterns, hardcoded values
  - Instruction to send findings to Lead via `SendMessage` on completion
  - Instruction to message other reviewers directly when finding cross-domain issues

Task descriptions follow the `references` context mode (pointers to files and specs, not full inline content).

#### 7b. All tasks are parallel

All review tasks are independent with **no** `addBlockedBy` dependencies. Reviewers work concurrently. The only sequencing is that the lead's consolidation happens after all review tasks reach `completed` status.

#### 7c. Illustrative review task

```
TaskCreate:
  subject: "Craftsmanship review of main..HEAD"
  description: |
    Review the changeset for code quality, conventions, and reuse opportunities.

    Diff: run `git diff main..HEAD` to read the changeset
    Files: src/auth/login.ts, src/auth/session.ts, src/api/routes.ts
    Specs: See docs/specs/auth.md for authentication requirements
    Conventions: Refer to CLAUDE.md and .eslintrc for project conventions

    Focus: correctness, maintainability, convention adherence, specification
    compliance, reuse opportunities. Produce findings in your standard
    Synthex code-reviewer output format (PASS/WARN/FAIL verdict with
    severity-ranked findings).

    On completion: send findings to Lead via SendMessage. If you discover
    potential security issues, message Security directly with the file path
    and code snippet.
```

### 8. Execute Reviews

#### 8a. Concurrent execution

Reviewers work independently and concurrently on their assigned review tasks:

1. Each reviewer claims their task via `TaskUpdate` (status: `in_progress`, owner: teammate name)
2. The reviewer reads the changeset using the diff command from their task description
3. The reviewer produces findings in their standard Synthex output format
4. On completion, the reviewer marks the task as `completed` via `TaskUpdate` and sends findings to the Lead via `SendMessage`

#### 8b. Cross-domain discovery

When a reviewer finds something in another reviewer's domain, they message the relevant teammate directly via `SendMessage` (type: "message") with the finding details and file location. The receiving reviewer incorporates the tip into their own review.

Examples:
- Craftsmanship spots a potential SQL injection -- messages Security with the file path and code snippet
- Security finds an insecure pattern that is also a convention violation -- messages Craftsmanship
- Design finds hardcoded color values that should use design tokens -- messages Craftsmanship

Cross-domain messages are advisory. The receiving reviewer decides whether to incorporate the finding or note it as out of scope.

#### 8c. Lead monitoring

The lead monitors reviewer progress by periodically checking `TaskList`:

- Track which review tasks are in progress and which are complete
- A review task is "stuck" if it has been `in_progress` for longer than `lifecycle.stuck_task_timeout_minutes` without activity
- For stuck tasks: message the reviewer via mailbox to check status; if unresponsive, note the reviewer as unavailable and proceed to consolidation with available findings

### 9. Consolidate

After all review tasks complete, the lead produces a consolidated review report.

#### 9-pre. Multi-model consolidation bypass (when `multi_model_active` is `true`)

When `Resolve multi-model state` resolves to `multi_model_active: true`:

**The Lead does NOT run its natural consolidation pipeline.** The Lead's role shifts to "publish the orchestrator's report" (FR-MMT21 step 8 / FR-MMT4 Lead Suppression). Concretely:

1. Wait for the orchestrator-report mailbox message. The orchestrator (spawned in Step 5g) posts its completed report to:
   ```
   ~/.claude/teams/<team-name>/inboxes/lead/orchestrator-report-<timestamp>.json
   ```
   The Lead's spawn prompt (composed with the Multi-Model Conditional Overlay per Step 5b-4) already contains the FR-MMT4 Lead-suppression instruction — the Lead will wait for this message automatically per that instruction.

2. When the `orchestrator-report` message arrives, the Lead surfaces its `report` field as the team's review output. The Lead does NOT re-rank, edit, summarize, or consolidate the orchestrator's report.

3. This produces **exactly one consolidated report** — the orchestrator's. No Lead-side consolidated-report file is produced under the multi-model branch.

**Native-only branch (when `multi_model_active: false`):** The Consolidate step proceeds identically to today's `/team-review` (Steps 9a–9d below). Behavior is byte-identical to the Task 0 baseline.

#### 9a. Gather findings

**This step runs only when `multi_model_active: false`.** When `multi_model_active: true`, skip to Step 9-pre above — consolidation is performed by the orchestrator.

Read the findings from each completed review task:
- Check each reviewer's `SendMessage` output for their findings
- Check the task list for completion notes
- Incorporate any cross-domain findings that were communicated between reviewers

#### 9b. Verdict consolidation

Apply strict verdict precedence:
- **FAIL** if ANY reviewer returns FAIL (any CRITICAL or HIGH severity finding)
- **WARN** if no FAIL but ANY reviewer returns WARN (MEDIUM severity findings only)
- **PASS** only if ALL reviewers return PASS

The consolidated verdict represents the strictest individual verdict. A single FAIL from any reviewer means the consolidated verdict is FAIL.

#### 9c. Consolidated report format

The consolidated report matches Synthex's `review-code` output format:

```markdown
## Code Review Report

### Reviewed: {target_description}
### Date: {YYYY-MM-DD}

---

### Overall Verdict: {PASS | WARN | FAIL}

| Reviewer | Verdict | Findings |
|----------|---------|----------|
| Craftsmanship | {PASS/WARN/FAIL} | {count by severity} |
| Security | {PASS/WARN/FAIL} | {count by severity} |
| Performance | {PASS/WARN/FAIL or N/A} | {count by severity} |
| Design | {PASS/WARN/FAIL or N/A} | {count by severity} |

---

### CRITICAL Findings
{All CRITICAL findings from all reviewers, grouped}

### HIGH Findings
{All HIGH findings from all reviewers, grouped}

### MEDIUM Findings
{All MEDIUM findings from all reviewers, grouped}

### LOW Findings
{All LOW/Nit findings from all reviewers, grouped}

---

### Cross-Domain Findings
{Findings discovered through inter-reviewer communication, with source and recipient noted}

---

### What's Done Well
{Positive observations from all reviewers -- always included}

---

### Summary
{2-3 sentence overall assessment and recommended next steps}
```

The "Cross-Domain Findings" section is unique to team-review. It highlights findings that emerged from inter-reviewer communication -- issues that would have been missed in a standard `review-code` invocation where reviewers are isolated. Omit this section if no cross-domain messaging occurred.

#### 9d. FAIL handling and re-review loop

> **Multi-model mode:** When `multi_model_active: true`, the FAIL loop re-invokes the orchestrator on each cycle per FR-MMT21 step 9. See the multi-model FAIL cycle note in Step 3 below.

If the consolidated verdict is **FAIL**, enter a fix-and-re-review loop. **WARN does NOT trigger the loop** -- MEDIUM-only findings are informational.

This loop runs up to `review_loops.max_cycles` iterations (default: 3):

1. **Present findings:** Display the consolidated report with clear guidance on which CRITICAL and HIGH findings must be addressed.

2. **Caller fixes:** The caller (user or orchestrating agent) applies fixes to the code. This command does NOT apply fixes -- it waits for the caller to make changes and signal readiness for re-review.

3. **Re-review (team persists):** Unlike Synthex's `review-code` which spawns fresh subagent instances per cycle, the team persists between review cycles. The lead creates **new** review tasks on the shared task list for each reviewer, scoped to domain-specific changed files. Each new task includes:
   - The changed files relevant to that reviewer's domain (e.g., Security gets files with security-relevant changes, Craftsmanship gets files with code quality changes, Design gets modified frontend files). The lead determines domain relevance based on the reviewer's focus area defined in the review template
   - The diff for those specific files only (not the full changeset) — this keeps re-review focused and avoids re-examining unchanged code
   - A compact summary of unresolved findings from the prior cycle: one line per finding with severity, title, and reviewer
   - Instruction to verify whether prior findings have been addressed

   After creating the tasks, the lead also sends a `SendMessage` (type: `message`) to each reviewer with a brief notification: which files changed, which of their prior findings are expected to be addressed, and a pointer to the new review task on the shared task list. This direct message ensures reviewers are promptly aware of the re-review scope without needing to poll the task list.

   Reviewers claim and execute these new tasks following the same pattern as Step 8. The key advantage is that reviewers retain context from the prior cycle -- they know what they flagged previously and can verify fixes more efficiently.

   **Multi-model FAIL cycle (when `multi_model_active` is `true`):** Each FAIL re-review cycle also re-runs the orchestrator. After the lead creates new review tasks and reviewers complete them, re-invoke the `multi-model-review-orchestrator` via the Task tool (same as Step 5g) with the updated diff scope for the re-review. The orchestrator runs the full consolidation pipeline on the combined new native findings + fresh external adapter results. The Lead again waits for the `orchestrator-report` message and surfaces it as the cycle's consolidated report.

   > **Cost guidance:** ~2-3× per-cycle token cost vs native-only FAIL cycles (each cycle invokes N adapter agents + 1 orchestrator consolidation pass, plus the native team re-review).

4. **Re-consolidate:** Apply the same consolidation rules from 9a-9c on the new findings.

5. **Check exit conditions:** Exit the loop when:
   - The overall verdict is PASS or WARN (all CRITICAL and HIGH findings resolved), OR
   - `review_loops.max_cycles` is reached

   If max cycles are reached with a FAIL verdict, present the remaining findings and note: "Review loop exhausted after {max_cycles} cycles. {count} unresolved findings remain. Manual review recommended."

### 10. Graceful Shutdown

Graceful shutdown follows the same procedure as team-implement Step 10 (completion check, completion report, ordered shutdown sequence, resource cleanup, remove team name record).

**Completion report specifics for team-review:** The completion report per `output-formats.md` uses:
- `template_name` = "review"
- `Quality gates` section lists each reviewer's individual verdict and finding count
- `Files modified` is typically empty for review (reviewers examine code, they do not modify it) -- omit this section if no files were changed
- `Discovered work` captures any issues that were identified as requiring separate follow-up (e.g., tech debt items noted during review that are out of scope for the current changeset)

## Error Handling

### Reviewer failure

When a reviewer stops unexpectedly, the lead detects the failure through lack of `TaskUpdate` activity. The lead sends a `SendMessage` to check on the stopped reviewer. If the reviewer is unresponsive:

- Mark the reviewer's `in_progress` task as `completed` with a note: "Reviewer unavailable -- findings not collected"
- Proceed to consolidation with available findings from other reviewers
- Note the missing review in the consolidated report: "{Reviewer} review was not completed due to reviewer failure"
- The consolidated verdict is based only on reviewers that completed successfully

Unlike team-implement where tasks can be reassigned, review tasks are role-specific and cannot be meaningfully reassigned to a different reviewer type.

### Lead failure and cleanup failure

These follow the same patterns as team-implement's error handling (lead failure triggers best-effort cleanup; cleanup failure reports resource locations for manual intervention).

## When to Use Teams

Use `team-review` instead of `review-code` when the diff exceeds 500 lines of changed code, changes are security-critical (auth, crypto, API surface), or the changeset spans 5+ files across multiple modules. The key advantage is cross-domain discovery -- reviewers can alert each other to findings in overlapping areas (e.g., code reviewer spots a potential injection and messages the security reviewer directly). For diffs under 200 lines with a single concern, routine bug fixes, or documentation changes, use `review-code` instead.

See `plugins/synthex-plus/docs/decision-guide.md` for the full teams vs. subagents comparison.

## Graceful Degradation

Agent Teams requires the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable. This check runs **before Step 3 (Pre-Flight Checks)** -- if the flag is missing, none of the team creation steps are reached.

**Detection:** Check whether `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set to `1`. If it is not set or has any other value, abort with the following message:

```
Agent Teams requires the experimental feature flag.
Set the following environment variable and restart Claude Code:

  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

This flag enables the Agent Teams API used by Synthex+ commands.
```

Then offer the standard Synthex fallback as an alternative -- do **not** force it:

```
Alternatively, you can use the standard Synthex command:

  /synthex:review-code @{target}

This uses sequential subagent execution instead of persistent teams.
```

Present both options and let the user decide how to proceed.

## Orphan Prevention

Orphan prevention follows the same mechanism as team-implement:

- **Step 5 (team creation):** After the team is created successfully, write the team name to `.synthex-plus/.active-team`.
- **Step 10 (shutdown):** Delete `.synthex-plus/.active-team`.
- **Pre-flight detection (Step 3):** If `.synthex-plus/.active-team` exists and the recorded team's metadata directory also exists, report it as an orphan. If the tracking file exists but the team metadata is gone, silently delete the stale tracking file.

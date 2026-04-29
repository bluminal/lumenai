---
model: sonnet
---

# Review Code

Comprehensive, multi-perspective code review combining craftsmanship review, security analysis, and optional performance assessment — all run in parallel for fast, thorough feedback.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `target` | File paths, directory, or git diff range to review | staged changes (`git diff --cached`) | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

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
| `code_review.review_loops.max_cycles` | inherited from global `review_loops.max_cycles` (2) |
| `code_review.review_loops.min_severity_to_address` | inherited from global `review_loops.min_severity_to_address` (high) |

**Review loop config resolution order:** `code_review.review_loops` > global `review_loops` > hardcoded default (max_cycles: 2, min_severity_to_address: high).

### 1b. Standing Pool Discovery and Routing (FR-MMT15)

**Only execute this step when `standing_pools.enabled: true` in `.synthex-plus/config.yaml`. If `.synthex-plus/config.yaml` does not exist or `standing_pools.enabled` is `false` or absent, skip this step entirely and proceed to Step 2 with normal fresh-spawn review.**

This step executes at command-invocation time, before any diff resolution or reviewer spawning.

#### 1b-i. Compute Required-Reviewer-Set

Resolve the required reviewer set per the FR-MMT15 normative chain:
1. If `--reviewers` flag was passed at invocation, use that list.
2. Else if `code_review.reviewers` is set in `.synthex/config.yaml`, use that value.
3. Else use the hardcoded fallback: `[code-reviewer, security-reviewer]`.

#### 1b-ii. Inline Discovery (FR-MMT15)

Read `~/.claude/teams/standing/index.json` directly via the Read tool. If the file does not exist or is empty, treat discovery as "no pool found" and apply the routing-mode rules in §1b-iv.

Filter pools in the index:
- `standing: true`
- `pool_state` is NOT `draining` or `stopping`
- TTL has not expired: `now - last_active_at < ttl_minutes * 60`

**Stale-pool detection (FR-MMT22):** During filtering, if a pool meets EITHER stale condition:
  - Condition 1: The pool's `metadata_dir` no longer exists on disk
  - Condition 2: `last_active_at` is older than `max(ttl_minutes minutes, 24 hours)`
  → Invoke the `standing-pool-cleanup` agent at `plugins/synthex-plus/agents/standing-pool-cleanup.md` with the pool name and detection reason.
  → Emit this verbatim one-time-per-session warning (substituting pool name and fallback action): `"Standing pool '{name}' was stale and has been cleaned up. {fallback_action}."`
  → Treat the cleaned-up pool as absent.

Apply matching mode from `standing_pools.matching_mode` (default: `covers`):
- `covers` — pool roster must be a **superset** of the required-reviewer-set
- `exact` — pool roster must **equal** the required-reviewer-set

Pick the **first matching pool** by name sort order. Produce the inline-discovery output:

```json
{
  "routing_decision": "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch" | "fell-back-pool-draining" | "fell-back-pool-stale",
  "pool_name": "<pool name if matched>",
  "multi_model": true | false,
  "match_rationale": "<brief explanation of why this pool was selected>"
}
```

#### 1b-iii. Route to Pool

**If `routing_decision: routed-to-pool`:**

1. Emit the verbatim FR-MMT17 routing notification (interpolated):
   > `"Routing to standing pool '{pool_name}' (multi-model: {yes|no})."`

2. Prepare the task descriptions for the pool reviewers. Each reviewer in the required-reviewer-set gets a separate task:
   - `subject`: e.g., `"Code review: {target description}"`
   - `description`: the diff scope, files to review, relevant specs, and the reviewer's specific focus area (same context that would be passed to a fresh-spawn reviewer in Step 4)

3. Invoke the `standing-pool-submitter` agent at `plugins/synthex-plus/agents/standing-pool-submitter.md` with:
   ```json
   {
     "pool_name": "<matched pool name>",
     "tasks": [<one task object per reviewer in the required set>],
     "submission_timeout_seconds": "<from lifecycle.submission_timeout_seconds config, default 300>"
   }
   ```

4. Emit the verbatim submission confirmation (interpolated with actual uuid and pool_name):
   > `"Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s)."`

5. While the submitter is polling: if the expected wait is >= 60s AND stdout is a TTY, emit the verbatim waiting indicator every 30 seconds:
   > `"Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete..."`

   **Suppressed when stdout is not a TTY (CI-friendly). Not emitted when expected wait < 60s.**

6. **On submitter return:**

   a. **If submitter returns `routing_decision: fell-back-pool-draining` or `routing_decision: fell-back-timeout`:**
      - Apply routing mode per §1b-iv (silent fallback in `prefer-with-fallback`; abort with no-pool error in `explicit-pool-required`).

   b. **If submitter returns envelope with `status: success`:**
      - Prepend the verbatim provenance line to the report header:
        > `"Review path: standing pool '{pool_name}' (multi-model: {yes|no})."`
      - Surface the `report` field from the envelope as the command's final consolidated review report.
      - **Skip Steps 2–7 entirely** (the pool handled the review). Present the report directly.

   c. **If submitter returns envelope with `status: failed` AND `error.code: reviewer_crashed`:**
      - Invoke FR-MMT24 recovery per `docs/specs/multi-model-teams/recovery.md`:
        1. Extract failed reviewer name from `error.message` ("Reviewer {name} did not complete: {reason}")
        2. Spawn fresh native sub-agent for the failed reviewer via Task tool (same inputs as Step 4 would use)
        3. Wait for fresh sub-agent's findings
        4. Lightweight merge: append recovered findings to surviving findings from envelope
        5. For multi-model pools: apply D19 partial dedup (Stages 1+2 only — fingerprint + lexical dedup)
        6. Recovered findings carry `source.source_type: "native-recovery"`
        7. Prepend verbatim header: `"Note: reviewer {name} was recovered from a pool failure. Results below include recovered findings."`
        8. Surface merged report as final output. **Skip Steps 2–7.**

   d. **If submitter returns envelope with `status: failed` AND `error.code` is `pool_lead_crashed`, `drain_timed_out`, or similar terminal error (NOT `reviewer_crashed`):**
      - These are terminal failures. Fall through to fresh-spawn review (continue to Step 2).
      - Note to user: the pool returned a terminal error; running fresh-spawn review instead.

#### 1b-iv. Routing Mode Semantics

Apply `standing_pools.routing_mode` from `.synthex-plus/config.yaml` (default: `prefer-with-fallback`):

**`prefer-with-fallback` (default):**
- If `routing_decision` is any `fell-back-*`: proceed silently to Step 2 (fresh-spawn review). No error.

**`explicit-pool-required`:**
- If no matching pool found, abort with this verbatim error (substituting the actual required reviewer list comma-joined):
  ```
  No standing pool matches the required reviewers (code-reviewer, security-reviewer).
  Routing mode is 'explicit-pool-required', so this command will not fall back to
  fresh-spawn reviewers. To proceed, either:
    1. Start a matching pool:
         /synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer
    2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
  ```

---

### 1c. Sandbox-Yolo Spawn Confirmation (ADR-003 / D27 / FR-MMT21)

After routing is resolved (and the multi-model decision below has been made), enumerate every external CLI that will participate in this review — either via fan-out to a routed standing pool's external reviewers (1b) OR via the orchestrator's external proposers when the multi-model branch fires (see "Multi-Model Review Decision Framework" below). For each such CLI, look up `multi_model_review.external_permission_mode.<cli-name>` from `.synthex/config.yaml` (falling back to `plugins/synthex/config/defaults.yaml`).

**If any CLI in the resolved roster has `sandbox-yolo` configured**, display ONE warning line per such CLI, verbatim:

```
⚠ <cli-name> is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.
```

Then prompt the user, requiring explicit confirmation before continuing:

```
Continue review with sandbox-yolo CLI(s)? [y/N]
```

Default is **N** (Enter without input = no). On `n` or empty input, abort the review cleanly without invoking any reviewer. On `y`, continue.

**When stdin is not a TTY** (CI, scripted invocation, stdin redirected from `/dev/null`), treat as default-N and abort cleanly without prompting. This mirrors the TTY guard documented for the waiting indicator and prevents unbounded CI hangs on the unanswerable prompt. Detect non-TTY stdin before reading the prompt; do NOT block waiting for input that will never arrive.

**Skip this step entirely** when no CLI in the resolved roster has `sandbox-yolo` configured (i.e., all CLIs resolve to `read-only` or `parent-mediated`). The check is a no-op in the default safe configuration. Native-only invocations (no externals at all) also skip this step.

The verbatim warning string above is locked by **D25 / NFR-MMT7** (user-visible string copy locked verbatim) and is identical to the strings used by `/synthex-plus:start-review-team` and `/synthex:performance-audit`.

---

## Multi-Model Review Decision Framework (FR-MR21)

This section documents the 8-step decision order that determines whether a given `review-code` invocation takes the **native-only branch** (today's workflow) or the **multi-model branch** (orchestrator-based multi-family review). The gate decision is computed ONCE per invocation and cached for the loop's duration (D9).

### 8-Step Decision Order

**Step 1 — Read `multi_model_review` config**

Read the resolved `multi_model_review` block from `.synthex/config.yaml` merged onto `config/defaults.yaml`. Keys of interest:
- `multi_model_review.enabled` — master switch
- `multi_model_review.per_command.review_code.enabled` — per-command override
- `multi_model_review.per_command.review_code.complexity_gate.*` — gate thresholds

**Step 2 — Resolve invocation flags (FR-MR6)**

Check for `--multi-model` and `--no-multi-model` flags on the invocation. Per FR-MR6, flag value overrides both the master switch and the per-command config key. See "### Invocation Flags (FR-MR6)" below for full semantics.

**Step 3 — Disabled path: native-only branch**

If multi-model review is disabled at this point (master switch off AND no `--multi-model` flag, OR `--no-multi-model` flag is set) → take the **native-only branch** (today's review-code logic, byte-identical per FR-MR23).

<!-- native-only path: today's review-code logic byte-identical to baseline (FR-MR23) -->

**Step 4 — Complexity gate (FR-MR21a)**

If multi-model is enabled at this point, evaluate the complexity gate (see "### Complexity Gate (FR-MR21a)" below):
- If the diff is classified as **trivial** by the gate AND no `--multi-model` flag was passed → take the **native-only branch** (multi-model branch is a no-op for this invocation, per FR-MR21a).
- The `--multi-model` flag bypasses the gate entirely — if the flag is set, skip directly to Step 5.

**Step 5 — Multi-model branch: invoke orchestrator**

Else (multi-model enabled AND gate passes, or `--multi-model` flag set) → take the **multi-model branch**: invoke the `multi-model-review-orchestrator` agent.

When the decision framework selects the multi-model branch, invoke the `multi-model-review-orchestrator` agent (Task 19) with the resolved input contract:
- `command: "review-code"`
- `artifact_path` from the target parameter
- `touched_files` computed from the diff
- `native_reviewers` from `code_review.reviewers` config (or `--reviewers` flag)
- `config`: the resolved `multi_model_review` block
- `per_reviewer_timeout_seconds`: from `multi_model_review.per_reviewer_timeout_seconds` (default 180)

The orchestrator returns the unified consolidated envelope. Render its `report` field as the command's final output, prefixed with the path-and-reason header per D21 (Step 7 below).

Native-only branch continues to call today's review-code logic byte-identically (FR-MR23 regression — verified by Task 38(a) snapshot diff against Task 0 baseline).

**Step 6 — Cache the gate decision (D9)**

The gate decision computed in Steps 1–4 is cached for the entire review-loop's duration. Subsequent cycles within the same review-loop invocation reuse the cached decision without re-evaluating the complexity gate. This prevents oscillation when the diff hasn't changed but the loop iterates (e.g., re-reviews after fixes).

**Step 7 — Render path-and-reason header (D21)**

Render the **path-and-reason header** per the D21 spec (see "### Path-and-Reason Header Spec (D21)" below). This header is prepended to the command's final output regardless of which branch was taken.

**Step 8 — Emit consolidated review**

Emit the consolidated review per the chosen branch:
- **Multi-model branch:** surface the orchestrator's `report` field, prefixed with the D21 header.
- **Native-only branch:** surface the review from the native workflow, prefixed with the D21 header.

---

### Complexity Gate (FR-MR21a)

The complexity gate decides whether multi-model review is warranted for a given diff. Read from `multi_model_review.per_command.review_code.complexity_gate`:
- `threshold_lines_changed: 50` (default)
- `threshold_files_touched: 3` (default)
- `always_escalate_paths: [<glob list>]` — paths that ALWAYS escalate to multi-model regardless of size

**Decision:**
1. Compute `lines_changed` and `files_touched` from the diff
2. Check `always_escalate_paths` — if ANY changed file matches ANY glob, ESCALATE to multi-model immediately
3. Otherwise: if `lines_changed >= threshold_lines_changed` OR `files_touched >= threshold_files_touched` → multi-model
4. Otherwise → native-only

**Cached for the loop's duration (D9):** The gate decision is computed ONCE at the start of the review and cached for all cycles within the same review-loop invocation. This prevents oscillation when the diff hasn't changed but the loop iterates (e.g., re-reviews after fixes).

---

### Invocation Flags (FR-MR6)

The command accepts two mutually exclusive flags:
- `--multi-model` — force multi-model review regardless of config or complexity gate
- `--no-multi-model` — force native-only review regardless of config

Flag value overrides BOTH:
- the master `multi_model_review.enabled` config setting
- the per-command `multi_model_review.per_command.review_code.enabled` config
- the complexity gate verdict (when `--multi-model` is set, gate is bypassed)

When neither flag is set, the resolved config + complexity gate determine the path.

---

### Path-and-Reason Header Spec (D21)

The path-and-reason header is rendered at the top of every `review-code` output. It communicates the decision path and reviewer composition at a glance.

**Three invariants (verbatim from D21):**
1. Begins `Review path:`
2. Parenthetical reason clause follows
3. `reviewers:` suffix states `N native` and, when externals were attempted, `+ M external` (or `, M external <qualifier>` for the failed-externals variant)

**Literal regex (verbatim from D21):**
```
Review path: [^()]+\([^)]+; reviewers: \d+ native(?:\s*[+,]\s*\d+ external(?:\s+\w+)?)?\)
```

**Two sub-formats:**
- **With externals attempted:** `reviewers: N native + M external` (successful externals) OR `reviewers: N native, M external <qualifier>` (failed-externals variant, e.g., "0 external succeeded")
- **Native-only:** `reviewers: N native`

**Six PRD example renderings** (illustrative, not the contract):
1. `Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)`
2. `Review path: multi-model (auth path escalated; reviewers: 2 native + 3 external)`
3. `Review path: multi-model (above-threshold diff; reviewers: 1 native + 2 external)`
4. `Review path: native-only (below-threshold diff; reviewers: 2 native)`
5. `Review path: native-only (multi-model disabled by --no-multi-model flag; reviewers: 2 native)`
6. `Review path: multi-model (above-threshold diff; reviewers: 2 native, 0 external succeeded)`

---

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

Invoke the **findings-consolidator** sub-agent (Haiku-backed) with all reviewer outputs from Step 4. The consolidator:

- Deduplicates findings that multiple reviewers raised (e.g., both Code Reviewer and Security Reviewer flag the same missing input validation)
- Groups findings by file/location
- Sorts by severity within each group
- Preserves reviewer attribution on every finding
- Flags severity disagreements (e.g., Code Reviewer: MEDIUM, Security Reviewer: HIGH)

Use the consolidator's output as the source for the unified report below. The consolidator never drops CRITICAL/HIGH findings regardless of severity floor, so the report remains complete.

Merge the consolidated findings into the unified report format:

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

### 6. Review Loop

If the overall verdict is **FAIL** (any CRITICAL or HIGH findings), enter a fix-and-re-review loop. **WARN does NOT trigger the loop** — MEDIUM-only findings are informational.

This loop runs up to `review_loops.max_cycles` iterations (default: 2):

**Step 6a: Present Findings**

Present the consolidated report to the caller (Tech Lead, user) with clear guidance on which CRITICAL and HIGH findings must be addressed.

**Step 6b: Caller Fixes**

The caller applies fixes to the code. This command does NOT apply fixes — it waits for the caller to make changes and signal readiness for re-review.

**Step 6c: Re-Review**

Spawn **fresh** reviewer sub-agent instances (new Task calls — never resume prior agents) on the updated diff. Provide each reviewer with:
1. The updated diff (full text)
2. Project context (same as Step 3)
3. A compact summary of unresolved findings from the prior cycle: one line per finding with severity, title, and reviewer

Do NOT carry forward full reviewer outputs or the consolidated report from prior cycles. This prevents context exhaustion across multiple review iterations.

Re-consolidate results using the same rules from Step 5.

**Step 6d: Check Exit Conditions**

Exit the loop when:
- The overall verdict is PASS or WARN (all CRITICAL and HIGH findings addressed), OR
- `review_loops.max_cycles` is reached

If max cycles are reached with an overall FAIL verdict, present the remaining findings and note that the review loop has been exhausted.

### 7. Present Results

Present the final consolidated report to the user. If the verdict is FAIL or WARN, provide clear guidance on which findings to address first (ordered by severity, then by reviewer priority).

---

## Configuration

```yaml
# .synthex/config.yaml (code_review section)
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

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
| `--loop` | Enable native looping (FR-NL1/FR-NL2). When set, the command iterates per the "Native Looping" section below until the completion promise is emitted or `--max-iterations` is reached. | off | No |
| `--completion-promise <string>` | Promise text the agent emits as `<promise>X</promise>` to terminate the loop. | — | Required with `--loop` (unless `--resume*`) |
| `--max-iterations <int>` | Iteration cap (FR-NL13). Hard ceiling 200. | `20` | No |
| `--loop-isolated` | Fresh-subagent isolation mode per iteration (FR-NL18). | off (shared-context default) | No |
| `--name <slug>` | User-supplied loop-id slug `^[a-z0-9][a-z0-9-]{0,63}$`. | auto: `<command-slug>-<4-char-hex>` | No |

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

If `standing_pools.enabled` is true, Read `${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md` and follow it; otherwise skip to Step 2. On other hosts, resolve the plugin root from `.synthex/state.json`'s `plugin_root` field and read the same file relative to it.

---

### 1c. Sandbox-Yolo Spawn Confirmation (ADR-003 / D27 / FR-MMT21)

Read `${CLAUDE_PLUGIN_ROOT}/docs/sandbox-yolo.md` and follow it. On other hosts, resolve the plugin root from `.synthex/state.json`'s `plugin_root` field and read the same file relative to it.

**When stdin is not a TTY** (CI, scripted invocation, stdin redirected from `/dev/null`), treat as default-N and abort cleanly without prompting. This mirrors the TTY guard documented for the waiting indicator and prevents unbounded CI hangs on the unanswerable prompt. Detect non-TTY stdin before reading the prompt; do NOT block waiting for input that will never arrive.

---

## Multi-Model Review Decision Framework (FR-MR21)

Determines whether a `review-code` invocation takes the **native-only branch** (today's workflow) or the **multi-model branch** (orchestrator-based multi-family review). The decision is computed once per invocation.

### 8-Step Decision Order

**Steps 1-3** resolve `multi_model_review` config (`.enabled`, `.per_command.review_code.enabled`, `.per_command.review_code.complexity_gate.*`) and `--multi-model`/`--no-multi-model` flags (FR-MR6; see "### Invocation Flags (FR-MR6)" below); if disabled at this point → take the **native-only branch** (today's review-code logic, byte-identical per FR-MR23).

<!-- native-only path: today's review-code logic byte-identical to baseline (FR-MR23) -->

Otherwise, Read `${CLAUDE_PLUGIN_ROOT}/docs/multi-model-decision.md` and follow it for Steps 4-8. On other hosts, resolve the plugin root from `.synthex/state.json`'s `plugin_root` field and read the same file relative to it.

---

### Invocation Flags (FR-MR6)

Two mutually exclusive flags: `--multi-model` (force multi-model regardless of config or complexity gate; bypasses the gate) and `--no-multi-model` (force native-only regardless of config). Either overrides the master `multi_model_review.enabled` config and the per-command `multi_model_review.per_command.review_code.enabled` config. When neither flag is set, resolved config + complexity gate determine the path.

---

### Path-and-Reason Header Spec (D21)

Rendered at the top of every `review-code` output. Three invariants (verbatim from D21): (1) Begins `Review path:`. (2) Parenthetical reason clause follows. (3) `reviewers:` suffix states `N native` and, when externals were attempted, `+ M external` (or `, M external <qualifier>` for the failed-externals variant).

**Literal regex (verbatim from D21):**
```
Review path: [^()]+\([^)]+; reviewers: \d+ native(?:\s*[+,]\s*\d+ external(?:\s+\w+)?)?\)
```

**Two sub-formats:** with externals attempted, `reviewers: N native + M external` (succeeded) or `reviewers: N native, M external <qualifier>` (failed, e.g. "0 external succeeded"); native-only, `reviewers: N native`.

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

- If the host did not already inject the project instruction file into your context, Read the first of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.hermes.md` that exists at the repository root.
- Read convention sources from config (e.g., `.eslintrc`, `.prettierrc`)
- Identify the programming language(s) and frameworks in the diff

### 4. Launch Reviewers in Parallel

For each enabled reviewer, launch a sub-agent IN PARALLEL, providing the full diff and project context, and expecting structured output with a PASS/WARN/FAIL verdict and severity-ranked findings:

- **Code Reviewer:** craftsmanship review (correctness, maintainability, convention adherence, specification compliance, reuse opportunities).
- **Security Reviewer:** security-focused review (vulnerabilities, secrets, injection, access control).
- **Performance Engineer** (optional, if enabled in config): performance-focused review (algorithmic complexity, bundle impact, query patterns, caching).
- **Design System Agent** (automatic for UI changes): if the diff contains frontend/UI files (`.tsx`, `.jsx`, `.css`, `.scss`, `.vue`, `.svelte`), invoke for compliance review, in parallel with the other reviewers.

### 5. Consolidate Results

Invoke the **findings-consolidator** sub-agent (Haiku-backed) with all reviewer outputs from Step 4 to dedupe findings multiple reviewers raised, group by file/location, sort by severity, preserve reviewer attribution, and flag severity disagreements (e.g., Code Reviewer: MEDIUM, Security Reviewer: HIGH). The consolidator never drops CRITICAL/HIGH findings regardless of severity floor. Merge its output into the unified report format:

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

## Native Looping

This command supports the native Synthex looping primitive (introduced by `docs/plans/native-looping.md`). Pass `--loop` to iterate until the completion promise is emitted or `--max-iterations` is reached. The mechanical iteration framework — state file schema, loop-id rules, shared-context vs. fresh-subagent iteration, auto-compaction guarantees, promise emission, iteration markers — lives once in [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md). Only the command-specific bits are inlined below.

### Emission Point

Emit `<promise>{completion_promise}</promise>` (literal text from `--completion-promise`) in the iteration's final response when ALL of the following hold:

- The review cycle for this iteration ended with zero `FAIL` findings.
- Zero `WARN` findings that the reviewer would still pursue (i.e., all WARNs are either resolved or explicitly accepted by the author).
- No recommended-change items remain in any reviewer's report.
- A follow-up iteration would not surface new findings on the current diff (the agent's judgment — typically when prior iterations' findings have been addressed and the diff is stable).

Note: `--loop` here wraps the **entire `/synthex:review-code` invocation** — distinct from the existing multi-model-review per-cycle consolidation loop (`review_loops.max_cycles`). Native looping is the outer loop; multi-model consolidation is the inner cycle. They compose without interfering; the emission point is checked only at the end of each `/synthex:review-code` invocation.

### Iteration Body

When `--loop` is set, this command's existing workflow runs once per iteration. The agent follows the iteration loop body documented at [`shared-iter`](../docs/native-looping.md#shared-iter) by default (D-NL1 shared-context), or [`subagent-iter`](../docs/native-looping.md#subagent-iter) when `--loop-isolated` is passed: boundary check → increment counter → print marker → execute workflow → scan for promise → cancellation check → loop. State lives in `.synthex/loops/<loop-id>.json` per [FR-NL8](../docs/native-looping.md#state). Auto-compaction is safe because iteration state and work output both live on disk (FR-NL16, FR-NL17, FR-NL24).

The iteration marker (`[loop <loop-id> iteration <N>/<max>]`) prints to stdout before each iteration's workflow runs. See [`markers`](../docs/native-looping.md#markers).

### See Also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration-framework spec.
- `/synthex:loop` — generic prompt loop (no command body).
- `/synthex:list-loops`, `/synthex:cancel-loop` — loop management.
- Plan: `docs/plans/native-looping.md` (Tasks 13–21, FR-NL1–FR-NL45).

## Critical Requirements

- All reviewers run IN PARALLEL for speed
- Every finding must include a specific file location and actionable suggestion
- The consolidated report must preserve all findings from all reviewers — never drop or summarize away individual findings
- The "What's Done Well" section is mandatory — balanced feedback is essential
- Design system compliance is automatically included for UI changes without explicit configuration
- The overall verdict follows the strictest reviewer (one FAIL = overall FAIL)

---
model: sonnet
---

# Performance Audit

Conduct a full-stack performance analysis — quantifying bottlenecks, measuring against budgets, and producing prioritized optimization recommendations with estimated impact.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `scope` | Specific area to audit (e.g., `frontend`, `api`, `database`, `full-stack`) | `full-stack` | No |
| `url` | URL to audit for frontend performance (Core Web Vitals) | None | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

You invoke the **Performance Engineer sub-agent** to perform a quantitative performance analysis and produce prioritized optimization recommendations with estimated impact.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load any performance-related configuration.

**Default values:**

| Setting | Default |
|---------|---------|
| `performance_audit.review_loops.max_cycles` | inherited from global `review_loops.max_cycles` (2) |
| `performance_audit.review_loops.min_severity_to_address` | inherited from global `review_loops.min_severity_to_address` (high) |

**Review loop config resolution order:** `performance_audit.review_loops` > global `review_loops` > hardcoded default (max_cycles: 2, min_severity_to_address: high).

### 1b. Standing Pool Discovery and Routing (FR-MMT15)

**Only execute this step when `standing_pools.enabled: true` in `.synthex-plus/config.yaml`. If `.synthex-plus/config.yaml` does not exist or `standing_pools.enabled` is `false` or absent, skip this step entirely and proceed to Step 2 with normal fresh-spawn review.**

This step executes at command-invocation time, before any scope resolution or reviewer spawning.

#### 1b-i. Compute Required-Reviewer-Set

The required reviewer set for this command is static: `[performance-engineer]`. No flag or config key changes this set.

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

2. Prepare the task description for the pool reviewer:
   - `subject`: e.g., `"Performance audit: {scope}"`
   - `description`: the audit scope, project context, available performance data, and the performance engineer's specific focus area (same context that would be passed to a fresh-spawn reviewer in Step 4)

3. Invoke the `standing-pool-submitter` agent at `plugins/synthex-plus/agents/standing-pool-submitter.md` with:
   ```json
   {
     "pool_name": "<matched pool name>",
     "tasks": [<one task object for the performance-engineer>],
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
      - Surface the `report` field from the envelope as the command's final consolidated audit report.
      - **Skip Steps 2–6 entirely** (the pool handled the audit). Present the report directly.

   c. **If submitter returns envelope with `status: failed` AND `error.code: reviewer_crashed`:**
      - Invoke FR-MMT24 recovery per `docs/specs/multi-model-teams/recovery.md`:
        1. Extract failed reviewer name from `error.message` ("Reviewer {name} did not complete: {reason}")
        2. Spawn fresh native sub-agent for the failed reviewer via Task tool (same inputs as Step 4 would use)
        3. Wait for fresh sub-agent's findings
        4. Lightweight merge: append recovered findings to surviving findings from envelope
        5. For multi-model pools: apply D19 partial dedup (Stages 1+2 only — fingerprint + lexical dedup)
        6. Recovered findings carry `source.source_type: "native-recovery"`
        7. Prepend verbatim header: `"Note: reviewer {name} was recovered from a pool failure. Results below include recovered findings."`
        8. Surface merged report as final output. **Skip Steps 2–6.**

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
  No standing pool matches the required reviewers (performance-engineer).
  Routing mode is 'explicit-pool-required', so this command will not fall back to
  fresh-spawn reviewers. To proceed, either:
    1. Start a matching pool:
         /synthex-plus:start-review-team --reviewers performance-engineer
    2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
  ```

---

### 2. Determine Audit Scope

Resolve what to audit based on the `scope` parameter:

| Scope | What's Analyzed |
|-------|----------------|
| `frontend` | Core Web Vitals, bundle size, rendering performance, asset optimization |
| `api` | Response times, payload sizes, N+1 queries, connection pooling |
| `database` | Query performance, indexing, connection management, schema efficiency |
| `full-stack` | All of the above |

### 3. Gather Context

Before invoking the Performance Engineer, gather context:

- Read `@CLAUDE.md` for project conventions and stack details
- Read `package.json` for dependencies and bundle analysis context
- Check for existing performance budgets or benchmarks
- Identify the deployment target (Vercel, AWS, self-hosted) for environment-specific recommendations

### 4. Launch Performance Engineer

Invoke the **Performance Engineer sub-agent** with:

- The audit scope
- The URL for frontend analysis (if provided)
- Project context (tech stack, deployment target, existing budgets)
- Any available performance data (Lighthouse reports, APM data, database slow query logs)

The Performance Engineer produces a structured audit:

```markdown
## Performance Audit: [Scope]

### Date: [YYYY-MM-DD]
### Scope: [What was analyzed]

---

### Executive Summary
[2-3 sentences: current state, biggest bottleneck, estimated impact of top recommendation]

---

### Performance Budget Status (if applicable)

| Metric | Budget | Actual | Status |
|--------|--------|--------|--------|
| LCP | < 2.5s | [value] | [PASS/FAIL] |
| FID/INP | < 100ms | [value] | [PASS/FAIL] |
| CLS | < 0.1 | [value] | [PASS/FAIL] |
| Bundle size (JS) | < [budget] | [value] | [PASS/FAIL] |
| API p95 latency | < [budget] | [value] | [PASS/FAIL] |

---

### Findings

#### [CRITICAL | HIGH | MEDIUM | LOW] Finding Title
- **Category:** [Core Web Vitals | Bundle | Database | API | Caching | Rendering]
- **Current:** [Measured value with units]
- **Target:** [What it should be]
- **Impact:** [Estimated improvement in specific units — ms, KB, queries, etc.]
- **Recommendation:** [Specific optimization with implementation guidance]
- **Effort:** [S/M/L]
- **Evidence:** [How this was measured or identified]

[Repeat for each finding, ordered by impact]

---

### Bundle Analysis (if frontend scope)

| Package | Size (gzipped) | % of Total | Recommendation |
|---------|---------------|-----------|----------------|
| [package] | [size] | [%] | [tree-shake/replace/lazy-load/keep] |

---

### Database Analysis (if applicable)

| Query / Pattern | Frequency | Duration (p95) | Issue | Fix |
|----------------|-----------|---------------|-------|-----|
| [query] | [calls/min] | [ms] | [N+1/missing index/etc.] | [specific fix] |

---

### Optimization Priority Matrix

| # | Optimization | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | [optimization] | [high/med/low] | [S/M/L] | [P1/P2/P3] |
| 2 | [optimization] | [high/med/low] | [S/M/L] | [P1/P2/P3] |
| 3 | [optimization] | [high/med/low] | [S/M/L] | [P1/P2/P3] |

---

### Caveats
[Important context for interpreting these results — lab vs field data,
sample size, measurement methodology limitations]
```

### 5. Optimization Loop

If any CRITICAL or HIGH findings exist, enter an optimize-and-re-audit loop. MEDIUM-only findings do NOT trigger the loop.

This loop runs up to `review_loops.max_cycles` iterations (default: 2):

**Step 5a: Present Findings**

Present the performance audit to the caller with clear guidance on which CRITICAL and HIGH findings to address first (ordered by impact/effort ratio).

**Step 5b: Caller Optimizes**

The caller applies optimizations to the code or infrastructure. This command does NOT apply fixes — it waits for the caller to make changes and signal readiness for re-audit.

**Step 5c: Re-Audit**

Spawn a **fresh** Performance Engineer sub-agent instance (new Task call — never resume the prior agent) on the updated scope. Provide:
1. The audit scope and project context
2. Any available performance data (same sources as Step 3)
3. A compact summary of unresolved findings from the prior cycle: one line per finding with severity, category, and quantified current/target values

Do NOT carry forward the full prior audit output. This prevents context exhaustion across multiple review iterations.

**Step 5d: Check Exit Conditions**

Exit the loop when:
- No CRITICAL or HIGH findings remain, OR
- `review_loops.max_cycles` is reached

If max cycles are reached with remaining CRITICAL or HIGH findings, present the findings and note that the optimization loop has been exhausted.

### 6. Present Results

Present the final audit to the user:

```
Performance Audit Complete: [scope]

Budget status: [X of Y metrics passing]
Findings: [count by severity]
Estimated total impact: [quantified improvement potential]

Top optimizations (by impact/effort ratio):
1. [Optimization] — est. [impact], effort: [S/M/L]
2. [Optimization] — est. [impact], effort: [S/M/L]
3. [Optimization] — est. [impact], effort: [S/M/L]

Full audit written to console.
```

---

## Critical Requirements

- Every finding MUST include quantified current and target values — "the page is slow" is not acceptable; "LCP is 4.2s, target is < 2.5s" is acceptable
- Impact estimates must be in specific units (milliseconds, kilobytes, queries per request) — not vague ("significant improvement")
- Recommendations must be specific and actionable — not "optimize the database" but "add a composite index on (user_id, created_at) to the orders table"
- Distinguish between lab measurements and field data — they tell different stories
- The priority matrix must balance impact vs effort — a high-impact, high-effort optimization may be lower priority than a medium-impact, low-effort one
- Performance budgets are targets, not hard limits — but exceeding them requires documented justification
- The Performance Engineer must consider the total cost of optimization — some optimizations add complexity that may not be worth the performance gain

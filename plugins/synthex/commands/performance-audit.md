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

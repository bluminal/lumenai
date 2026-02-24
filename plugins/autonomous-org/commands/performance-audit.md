# Performance Audit

Conduct a full-stack performance analysis — quantifying bottlenecks, measuring against budgets, and producing prioritized optimization recommendations with estimated impact.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `scope` | Specific area to audit (e.g., `frontend`, `api`, `database`, `full-stack`) | `full-stack` | No |
| `url` | URL to audit for frontend performance (Core Web Vitals) | None | No |
| `config_path` | Path to autonomous-org project config | `.autonomous-org/config.yaml` | No |

## Core Responsibilities

You invoke the **Performance Engineer sub-agent** to perform a quantitative performance analysis and produce prioritized optimization recommendations with estimated impact.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load any performance-related configuration.

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

### 5. Present Results

Present the audit to the user:

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

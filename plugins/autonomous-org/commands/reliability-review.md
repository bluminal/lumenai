# Reliability Review

Assess the operational readiness of a service or feature before deployment — covering SLOs, observability, runbooks, deployment risk, and incident response preparedness.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `scope` | Service, feature, or module to assess | entire project | No |
| `config_path` | Path to autonomous-org project config | `.autonomous-org/config.yaml` | No |

## Core Responsibilities

You invoke the **SRE Agent sub-agent** to perform a comprehensive operational readiness assessment, ensuring the service meets reliability standards before it reaches production users.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load the reliability configuration.

**Default values:**

| Setting | Default |
|---------|---------|
| `reliability.slo_document` | `docs/specs/slos.md` |
| `reliability.runbooks_path` | `docs/runbooks` |

### 2. Gather Service Context

Before invoking the SRE Agent, gather context about the service:

- Read `@CLAUDE.md` for project conventions and infrastructure details
- Check for existing SLO definitions at the configured path
- Check for existing runbooks at the configured path
- Identify the deployment infrastructure (Vercel, AWS, GCP, Docker, Kubernetes, etc.)
- Read any infrastructure-as-code files (Terraform, CloudFormation, Dockerfiles)

### 3. Launch SRE Agent

Invoke the **SRE Agent sub-agent** in Reliability Review mode. Provide:

- The scope to assess
- Existing SLO definitions (if any)
- Existing runbooks (if any)
- Infrastructure context
- The project's tech stack and deployment model

The SRE Agent produces a reliability review:

```markdown
## Reliability Review: [Scope]

### Date: [YYYY-MM-DD]
### Review Type: [Pre-launch | Pre-feature | Periodic]

---

### SLO Coverage Assessment

| User Journey | SLI Defined? | SLO Target | Current | Status |
|-------------|-------------|-----------|---------|--------|
| [journey] | [yes/no] | [target] | [actual or N/A] | [Met/At Risk/Missing] |

**SLO gaps:** [User journeys without SLO coverage]

---

### Findings

#### [CRITICAL | HIGH | MEDIUM | LOW] Finding Title
- **Category:** [SLO | Observability | Runbooks | Deployment | Incident Response]
- **Issue:** [What's missing or inadequate]
- **Risk:** [What could happen in production]
- **Recommendation:** [Specific remediation]
- **Effort:** [S/M/L]

[Repeat for each finding, ordered by severity]

---

### Observability Assessment

| Signal | Coverage | Gaps |
|--------|----------|------|
| Metrics | [what's instrumented] | [what's missing] |
| Events | [what's logged] | [what's missing] |
| Logs | [structured? centralized?] | [gaps] |
| Traces | [distributed tracing?] | [gaps] |

---

### Deployment Assessment

| Factor | Status | Notes |
|--------|--------|-------|
| Rollback mechanism | [exists/missing] | [details] |
| Health checks | [exists/missing] | [details] |
| Canary/gradual rollout | [exists/missing] | [details] |
| Feature flags | [exists/missing] | [details] |

---

### Runbook Coverage

| Scenario | Runbook Exists? | Last Updated | Adequate? |
|----------|----------------|-------------|-----------|
| [scenario] | [yes/no] | [date] | [yes/no] |

---

### Overall Readiness: [READY | READY WITH RISKS | NOT READY]

### Priority Remediation Plan
1. [Highest-priority fix — what, why, effort]
2. [Second priority]
3. [Third priority]
```

### 4. Optional: Terraform Review

If the project contains Terraform or infrastructure-as-code files relevant to the scope, optionally invoke the **Terraform Plan Reviewer sub-agent** in parallel for an infrastructure-specific review.

### 5. Present Results

Present the reliability review to the user:

```
Reliability Review Complete: [scope]

Overall Readiness: [READY | READY WITH RISKS | NOT READY]

Findings: [count by severity]
  CRITICAL: [n]
  HIGH:     [n]
  MEDIUM:   [n]
  LOW:      [n]

SLO coverage: [X of Y user journeys covered]
Observability: [summary]
Runbook coverage: [X of Y scenarios documented]

Top priority items:
1. [Most critical remediation]
2. [Second]
3. [Third]
```

---

## Configuration

```yaml
# .autonomous-org/config.yaml (reliability section)
reliability:
  # Path to SLO/SLI definitions
  slo_document: docs/specs/slos.md

  # Path to operational runbooks
  runbooks_path: docs/runbooks
```

---

## Critical Requirements

- SLOs MUST be defined from the user's perspective — "API latency p99 < 500ms" is better than "server CPU < 80%"
- The review must assess what happens when things go wrong, not just when they go right
- Runbooks must be evaluated for executability under stress — "investigate the issue" is not a runbook step
- The readiness verdict must be honest — "NOT READY" is a valid and important outcome that prevents outages
- This review is advisory — it cannot block deployments, but it creates visibility into operational risk
- The SRE Agent approaches reliability as an engineering discipline, not as a checklist exercise

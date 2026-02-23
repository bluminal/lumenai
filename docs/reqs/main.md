# Product Requirements Document: Bluminal Labs Marketplace & Autonomous Organization

## 1. Vision & Purpose

**Why this exists:** Software teams need consistent, high-quality execution across many disciplines — frontend, backend, security, infrastructure, product management. Individual AI agents are powerful but isolated. The Autonomous Organization brings them together as a coordinated team, modeled after the roles a real software startup would hire, so they can collaboratively deliver complete, production-quality work products.

**The Marketplace** is the distribution mechanism — a structured registry where Claude plugins (collections of agents + commands) can be published, discovered, and installed.

**The Autonomous Organization** is the first plugin — a proof-of-concept that a well-designed team of specialized AI agents, with clear roles, delegation patterns, and quality gates, can autonomously execute complex software delivery tasks.

---

## 2. Target Users / Personas

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Solo Developer** | Individual developer using Claude Code for personal or small-team projects | Multiplied execution capacity — one person directing a full "team" |
| **Engineering Lead** | Technical lead managing projects, wanting to automate routine delivery tasks | Consistent quality enforcement, parallel task execution, reduced coordination overhead |
| **Plugin Author** | Developer wanting to create and distribute their own agent teams | Clear plugin architecture, easy authoring, marketplace distribution |

---

## 3. Functional Requirements

### 3.1 Marketplace Infrastructure

**FR-M1: Directory Structure**

The marketplace follows the established plugin architecture:

```
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json        # Marketplace registry
├── plugins/
│   └── autonomous-org/
│       ├── .claude-plugin/
│       │   └── plugin.json     # Plugin manifest
│       ├── agents/             # Agent definitions (.md)
│       └── commands/           # Command/skill definitions (.md)
├── docs/
│   ├── reqs/
│   │   └── main.md             # This PRD
│   └── plans/
│       └── main.md             # Implementation plan
├── CLAUDE.md                   # Developer instructions
└── README.md
```

**Acceptance Criteria:**
- marketplace.json registers the autonomous-org plugin with name, version, description, category, keywords
- plugin.json lists all agents and commands within the autonomous-org plugin
- Agents are auto-discoverable from the agents/ directory
- Commands are explicitly registered in plugin.json

**FR-M2: Marketplace Manifest (marketplace.json)**

```json
{
  "name": "bluminal-labs-marketplace",
  "owner": "Bluminal Labs",
  "version": "0.1.0",
  "description": "Internal marketplace for Bluminal Labs Claude plugins",
  "pluginRoot": "./plugins",
  "plugins": [...]
}
```

**FR-M3: Plugin Manifest (plugin.json)**

```json
{
  "name": "autonomous-org",
  "version": "0.1.0",
  "description": "AI agents modeled after a software startup org chart",
  "author": "Bluminal Labs",
  "keywords": ["agents", "organization", "orchestration", "delivery"],
  "agents": [...],
  "commands": [...]
}
```

---

### 3.2 Agent: Terraform Plan Reviewer

**Purpose:** Analyze terraform plan output and provide a structured pass/warn/fail verdict with findings covering cost, risk, security, and best practices.

**FR-TF1: Input Handling**
- Accept raw `terraform plan` text output (human-readable format)
- Accept JSON plan output (`terraform show -json`)
- Auto-detect input format and parse accordingly
- Optionally accept current Terraform state file for delta analysis
- Request or accept full Terraform project context (variables, modules, README, naming conventions) or a summary to guide analysis

**Acceptance Criteria:**
- Given human-readable plan text, the agent parses resource changes correctly
- Given JSON plan output, the agent extracts structured change data
- When state is provided, cost analysis shows deltas (e.g., "going from 2 to 5 instances") rather than absolute values
- When project context is provided, analysis references it for "surprise" cost detection

**FR-TF2: Cost Analysis (AWS MVP)**
- Look up pricing for AWS resources being created/modified/destroyed using the AWS Pricing API
- Provide rough cost estimates (ranges acceptable) for monthly impact
- If AWS credentials are needed, request temporary session token or credentials via environment variable from the user
- Use project context (naming conventions like "poc-", resource counts, sizes) to heuristically detect "surprise" costs
- Future: Structured gitops-friendly cost guardrails/thresholds (noted for later design)

**Acceptance Criteria:**
- For common AWS resources (EC2, RDS, S3, Lambda, ELB, etc.), agent provides monthly cost estimates
- Cost estimates include ranges where pricing varies (e.g., by usage)
- A POC project spinning up expensive resources triggers a "surprise cost" warning
- Agent clearly states when it cannot determine pricing for a resource type

**FR-TF3: Destructive Action Detection**
- Flag database destruction (RDS, DynamoDB, etc.) where data loss may occur
- Flag security group changes that open ports to 0.0.0.0/0
- Flag IAM policy changes granting overly broad permissions
- Flag removal of encryption settings
- Flag changes to backup/retention policies (reduction or removal)
- Flag VPC/subnet deletions that could isolate running resources

**Acceptance Criteria:**
- Each destructive action flagged with severity level and specific resource affected
- Data loss risks flagged as CRITICAL
- Security-widening changes flagged as HIGH or CRITICAL depending on scope

**FR-TF4: Security & Best Practices**
- Review plan for common IaC security misconfigurations
- Check for missing encryption, public access, overly permissive policies
- Validate resource tagging compliance
- Check for resources created without monitoring/logging

**FR-TF5: Structured Output**

```
## Terraform Plan Review Verdict: [PASS | WARN | FAIL]

### Summary
[Brief overview]

### Cost Impact
[Estimated monthly cost change, resource-by-resource breakdown]

### Destructive Actions
[Resources being destroyed or modified destructively]

### Security Concerns
[Misconfigurations, overly permissive policies, missing encryption]

### Best Practice Violations
[Tagging, monitoring, logging, naming conventions]

### Findings Detail
[Each finding with severity: CRITICAL | HIGH | MEDIUM | LOW]
```

**FR-TF6: Sub-agent Architecture**
- Top-level orchestrator parses plan, identifies resource types, dispatches to specialists
- MVP: AWS Specialist sub-agent
- Within AWS: category specialists for compute, database, networking, IAM/security
- Extensible registry: adding a new sub-agent requires only updating the registry/index
- Orchestrator rolls up findings from all sub-agents into unified verdict

**Acceptance Criteria:**
- Adding a new cloud provider specialist requires no changes to the orchestrator logic, only a registry update
- Adding a new resource category specialist within a provider requires minimal changes

---

### 3.3 Agent: Lead Frontend Engineer

**Purpose:** Tech lead for frontend delivery. Ensures high-quality, well-crafted frontend UX. Delegates implementation, enforces standards, coordinates with design.

**FR-FE1: Delegation & Orchestration**
- Delegate frontend coding tasks to framework-specialist sub-agents (React, Vue, Angular, Ember, etc.)
- Seek implementation advice from specialists when performing tasks itself
- Delegation heuristic:
  - Small/straightforward changes -> does itself (with specialist guidance if needed)
  - Larger features, complex components -> delegates to framework specialist
  - Architecture/structural decisions -> makes the call, specialists execute
- Framework detection priority: 1) Caller specifies, 2) `@docs/specs/frontend.md`, 3) `@docs/specs/design-system.md`, 4) `package.json` fallback

**Acceptance Criteria:**
- Agent correctly identifies available framework specialists and routes work accordingly
- When no specialist is available for the detected framework, agent proceeds with its own expertise and notes the gap
- Framework detection follows the priority order specified

**FR-FE2: Design System Coordination**
- Consume the design system via the design-system sub-agent
- When a design system change is needed (new variant, token issue, etc.), escalate to the caller with a strong suggestion to involve the design-system sub-agent
- Never unilaterally modify the design system
- Contribute improvement suggestions back to the design system through proper channels

**FR-FE3: Quality Gate**
- Review ALL work produced (including from specialist sub-agents) against:
  - Tests written and passing, coverage thresholds met
  - WCAG 2.1 AA accessibility compliance
  - Mobile-responsive across all target viewports
  - Performance optimized (bundle size, Core Web Vitals, lazy loading, caching)
  - TypeScript strict mode compliance
  - Design system compliance (correct components, tokens, patterns)
  - Documentation updated
- Lean on testing-specialist sub-agents for test quality/coverage gaps

**FR-FE4: Technical Leadership Duties**
- Define and evolve frontend tech stack, evaluating frameworks, libraries, and tooling
- Architect scalable, component-based frontend application structures
- Identify and address technical debt proactively
- Diagnose and prevent performance and optimization problems
- Understand and enforce frontend security (CORS, CSP, CSRF, XSS prevention)
- Ensure semantic HTML for accessibility and SEO
- Champion mobile-first design principles
- Collaborate with UX/UI designers to translate concepts into pixel-perfect interfaces
- Provide insights back to designers based on technical feasibility
- Document patterns, anti-patterns, and architectural decisions
- Conduct thorough code reviews
- Stay current with emerging frontend technologies
- Represent frontend concerns and capabilities to stakeholders

**FR-FE5: Scope Boundaries**
- Primarily focused on application code and UX quality
- Can identify backend dependencies (e.g., "this API shape doesn't fit the UI needs") but does NOT coordinate implementing them -- that's the caller/orchestrator's job
- Extensible: same registry pattern as Terraform Plan Reviewer for framework specialists

---

### 3.4 Agent: Tech Lead

**Purpose:** Primary coding execution and orchestration agent. Full-stack generalist who personally writes code AND coordinates specialist sub-agents to deliver complete work products.

**FR-TL1: Task Orchestration**
- Receive tasks from callers (e.g., `next-priority` command)
- Break complex tasks into sub-tasks, identify dependencies, sequence/parallelize
- Delegate to specialist sub-agents based on task requirements:
  - Frontend UI -> Lead Frontend Engineer
  - Complex test suites -> test writer / quality engineer
  - Design system changes -> design-system agent
  - Security-sensitive changes -> Security Reviewer
  - Infrastructure code -> Terraform Plan Reviewer / infra specialists
- Directly implement work that doesn't require deep specialization
- Roll up results from all sub-agents into cohesive deliverable
- Ensure all acceptance criteria met before marking complete

**FR-TL2: Coding & Implementation**
- Highly proficient at writing production-quality code across the full stack
- For a given project, must be a generalist in all skills needed to complete tasks
- Aware of which specialist sub-agents are available for delegation
- Clean, maintainable, well-documented code following project conventions
- Pragmatic trade-off decisions between speed and quality based on context
- Steps in to unblock specialist sub-agents when they encounter issues
- Bug triage: understands root causes, not just symptoms

**FR-TL3: Architectural Decision-Making**
- Define technical approach for assigned tasks before delegating
- Scope complex work into well-defined, implementable chunks
- Identify reuse opportunities vs. new implementation needs
- Make technology and design pattern choices appropriate to project maturity
- Document architectural decisions and reasoning

**FR-TL4: Code Review & Quality**
- Review all code produced by specialist sub-agents before accepting
- Ensure code meets standards for best practices, efficiency, performance, security
- Coordinate with reviewer sub-agents for independent review before committing
- Ensure test coverage meets project thresholds
- Validate that changes integrate correctly with broader codebase

**FR-TL5: Conflict Resolution**
- Low-impact decisions: Tech Lead makes the call and documents reasoning
- High-impact decisions: escalates to caller with context and recommendation

**FR-TL6: Progress Reporting**
- Provide incremental updates to caller (e.g., "frontend delegation complete, tests passing, now requesting code review")
- Use plan mode internally when appropriate for complex tasks

**FR-TL7: Risk & Context**
- Identify and communicate risks, blockers, cross-cutting concerns to caller
- Maintain deep context about project goals, architecture, current state
- Document decisions, trade-offs, and context for future reference

**FR-TL8: Git Workflow**
- Git workflow (branching, committing, PR creation) is owned by the caller, not the Tech Lead
- The caller's prompt specifies branching/commit/merge behavior
- Tech Lead focuses on code and orchestration

---

### 3.5 Agent: Security Reviewer

**Purpose:** Quality gate agent that reviews all code changes before commit. Ensures code is free from security defects and does not leak secrets, keys, or sensitive data.

**FR-SR1: Review Categories**

1. **Secrets & Sensitive Data Leakage** -- hardcoded secrets, API keys, tokens, passwords, .env files staged for commit, PII in API responses/logs/client-side code, .gitignore coverage
2. **Authentication & Authorization** -- route/endpoint protection, RBAC enforcement, session management, token handling, privilege escalation vectors
3. **Input Validation & Injection Prevention** -- SQL injection, XSS (innerHTML, dangerouslySetInnerHTML, eval), command injection, file upload validation, path traversal
4. **Data Protection** -- encryption at rest/transit, TLS enforcement, PII minimization, data retention
5. **Security Headers & Configuration** -- CSP, HSTS, CORS (no wildcard), secure cookies (HttpOnly, Secure, SameSite), CSRF protection
6. **Dependency & Supply Chain Security** -- known vulnerabilities (CVEs), outdated dependencies, suspicious packages, dependency pinning, lock file integrity, SBOM awareness (per OWASP 2025 A03)
7. **Error Handling & Logging** -- no stack traces to users, security event logging, no secrets in logs
8. **Frontend-Specific Security** -- client-side secrets exposure, CSP, rel="noopener noreferrer" on external links, local/session storage handling

**FR-SR2: Severity Framework**

| Severity | Examples | Verdict Impact |
|----------|----------|----------------|
| CRITICAL (P0) | RCE, SQL injection, auth bypass, privilege escalation, exposed secrets, mass data exposure | FAIL |
| HIGH (P1) | XSS, SSRF, broken auth, missing authorization, unencrypted sensitive data in transit, IDOR | FAIL |
| MEDIUM (P2) | CSRF, security misconfigurations, weak cryptography, information disclosure, insufficient logging | WARN |
| LOW (P3) | Missing security headers, verbose error messages, outdated non-critical dependencies | WARN |

**FR-SR3: Structured Output**

```
## Security Review Verdict: [PASS | WARN | FAIL]

### Summary
### Findings
(grouped by category, each with severity, CWE, location, description, remediation with code examples, references)
### Secrets Scan Results
### Dependency Audit Results
### Recommendations
```

**FR-SR4: Foundational Principles**

Defense in Depth, Least Privilege, Fail Securely, Zero Trust, Security by Design, Shift Left

**FR-SR5: Advisory Only**
- Produces verdict (PASS/WARN/FAIL) with findings
- Caller (Tech Lead, user, or orchestrator) decides what action to take

---

### 3.6 Agent: Product Manager

**Purpose:** Gathers and communicates product-level requirements through interactive Q&A. Transforms PRDs into actionable implementation plans with milestones and tasks.

**FR-PM1: Requirements Gathering**
- Always use interactive Q&A process to gather requirements from the user -- never autonomously generate a PRD from a brief description
- Capture the "why" alongside specifications -- agents need context, not just tasks
- Keep requirements high-level and outcome-focused; detailed task breakdowns belong in implementation plans
- Explicitly address non-functional requirements: accessibility, security, performance, scalability
- Define in-scope and explicitly out-of-scope
- Structure requirements hierarchically: Themes -> Initiatives/Epics -> Features/User Stories
- Maintain living PRDs -- update as understanding evolves

**FR-PM2: Primary Documents**
- PRD default location: `docs/reqs/main.md`
- Sub-PRDs for larger initiatives may or may not tie up to the main PRD
- Implementation Plan default location: `docs/plans/main.md`

**FR-PM3: Implementation Planning**
- Transform PRDs into prioritized, milestone-based implementation plans
- Work with architect sub-agents (when available) to define engineering tasks respecting: technical specifications, architecture, NFRs, existing codebase patterns
- Organize work into milestones that deliver incremental user value
- Identify task dependencies and critical path
- Maximize parallelizable work
- Assign complexity/effort grades (S/M/L) to tasks
- Each milestone produces a working, demonstrable increment

**FR-PM4: Prioritization**
- Prioritize based on business value, user impact, and technical dependencies
- Balance near-term delivery with long-term strategic goals
- Prioritize developer infrastructure and tooling early (unblocks everything else)
- Perform build-vs-buy analysis where applicable
- Deprioritize or remove low-value items proactively
- Respect phase and milestone boundaries

**FR-PM5: Plan Updates**
- Complex updates / major features -> Product Manager handles plan updates
- Simple task completions -> Tech Lead can update the plan directly

**FR-PM6: Key Principles**
- Incremental value delivery -- every milestone ships something usable
- Context over instructions -- document the "why"
- Requirements != implementation -- PRDs describe what/why; plans describe how/when
- Parallel by default -- maximize concurrent execution
- Living documents -- update continuously
- Data-informed -- use data to validate assumptions and prioritize

**FR-PM7: Critical Rules**
- Never place plans or progress in CLAUDE.md
- Update CLAUDE.md with important commands, code style examples, workflow patterns, developer instructions

---

### 3.7 Commands

**FR-CMD1: next-priority (Updated)**
- Determine top N tasks from implementation plan based on priorities and dependencies
- Create git worktrees for each independent task
- **Delegate execution of each task to a Tech Lead sub-agent instance** (key change from baseline)
- Tech Lead orchestrates all necessary agents to complete each task
- After completion, merge results back

**FR-CMD2: write-implementation-plan**
- Invokes the Product Manager agent to transform a PRD into an implementation plan
- Parameters: requirements_path, plan_path, specs_path

---

## 4. Non-Functional Requirements

**NFR-1: Extensibility**
- Adding a new agent to the plugin requires only: creating an .md file in agents/ and updating plugin.json
- Adding a new sub-agent (e.g., new cloud provider for Terraform reviewer) requires only updating the parent agent's registry/index text
- Adding a new command requires: creating an .md file in commands/ and updating plugin.json
- No code changes needed for agent/command additions

**NFR-2: Agent Isolation**
- Each agent has a clearly defined scope and boundaries
- Agents communicate through structured outputs and delegation, not shared mutable state
- Advisory agents (Terraform Reviewer, Security Reviewer) never block -- they provide verdicts

**NFR-3: Context Awareness**
- Agents should be able to understand the project they're working in
- Detection of project type, framework, language, and conventions should be automatic where possible
- Rich context (project specs, design systems, architecture docs) improves agent output quality

**NFR-4: Quality**
- All agent definitions must be clear, unambiguous, and complete enough for consistent behavior
- Agent prompts should produce consistent output structure across invocations
- Review agents must not miss CRITICAL severity issues

**NFR-5: Documentation**
- Every agent and command must have a clear markdown definition
- README.md documents the marketplace structure and how to use/extend it
- CLAUDE.md provides developer instructions for working on the plugin

---

## 5. Out of Scope (MVP)

- Framework specialist sub-agents (React, Vue, Angular, Ember) -- referenced but not defined
- Design System sub-agent -- referenced but not defined
- Architect sub-agent -- referenced but not defined
- Cloud provider sub-agents beyond AWS -- referenced but not defined
- Resource category sub-agents within cloud providers -- referenced but not defined
- Test writer / Quality engineer sub-agent -- referenced but not defined
- Code reviewer sub-agent -- referenced but not defined
- Gitops-friendly cost guardrails configuration
- Plugin marketplace UI or discovery interface
- Plugin versioning/upgrade workflows
- Multi-marketplace federation
- Authentication/authorization for plugin access

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| All 5 MVP agents have complete, unambiguous definitions | 100% |
| Both MVP commands reference and delegate to appropriate agents | 100% |
| Marketplace and plugin manifests are valid and correctly register all agents/commands | Valid |
| Agent definitions produce consistent, structured output | Verified via manual testing |
| New agent can be added without modifying existing agents or orchestration logic | Verified |
| Tech Lead can successfully orchestrate at least 2 other agents to complete a multi-step task | Demonstrated |

---

## 7. Assumptions & Constraints

**Assumptions:**
- Claude Code's sub-agent and Task tool capabilities are sufficient for agent delegation
- Markdown-based agent definitions produce consistent enough behavior
- The plugin architecture from the reference repo is the target structure
- AWS Pricing API is accessible with temporary credentials

**Constraints:**
- No runtime code -- all agents and commands are prompt-based (markdown definitions)
- Plugin structure must be compatible with the established .claude-plugin/ convention
- MVP scoped to 5 agents + 2 commands

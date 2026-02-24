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

**FR-CMD3: init**
- Initializes Autonomous Organization configuration for a project
- Creates `.autonomous-org/config.yaml` from defaults
- Creates standard document directories (`docs/reqs/`, `docs/plans/`, `docs/specs/`)

---

### 3.8 Agent: Architect

**Purpose:** Principal Software Architect providing technical oversight, architecture decision documentation, and plan review. Already configured as default reviewer in `defaults.yaml` but currently has no agent definition.

**Why this agent:** The Architect is referenced by name in the implementation plan review pipeline and the Tech Lead's escalation path, but no definition exists. Every plan review cycle is incomplete without architectural feasibility assessment. Additionally, the organization lacks a structured way to document technology choices and system design decisions (ADRs).

**FR-AR1: Implementation Plan Review**
- Serve as the "architect" reviewer in the plan review pipeline (role already referenced in `defaults.yaml`)
- Produce structured review feedback using the established reviewer format (CRITICAL/HIGH/MEDIUM/LOW findings)
- Focus areas: technical feasibility, architecture risks, NFR coverage, missing technical tasks, technology choice evaluation
- Evaluate whether proposed milestones respect technical dependencies and constraints

**Acceptance Criteria:**
- Review output follows the same structured format used by other plan reviewers
- Findings include severity, description, and recommended resolution
- Architectural risks are explicitly called out with potential mitigation strategies

**FR-AR2: Architecture Decision Records (ADRs)**
- Produce ADRs documenting significant technology choices and system design decisions
- ADR structure: Title, Status, Context, Decision, Consequences (positive and negative), Alternatives Considered
- ADRs stored in a configurable directory (default: `docs/adrs/`)

**Acceptance Criteria:**
- Each ADR documents at least two alternatives considered with trade-off analysis
- ADRs are self-contained and readable without external context

**FR-AR3: System Design Evaluation**
- Evaluate system design proposals for scalability, maintainability, and operational complexity
- Identify cross-cutting concerns (observability, security, data consistency) that may be missed by feature-focused planning
- Assess technology choices against project maturity level (prototype vs. production)

**FR-AR4: Critical Rules**
- Focus on omissions in plans (what's missing) rather than rewriting what's present
- Calibrate feedback to project maturity -- a POC does not need the same rigor as a production system
- Document alternatives considered for every significant decision
- Respect the Product Manager's authority on requirements and prioritization -- architect advises on technical approach, not business value
- Prefer evolutionary architecture: avoid locking in decisions that can be deferred

---

### 3.9 Agent: Design System Agent

**Purpose:** Design System Engineer who owns design tokens, component governance, and design system compliance. Serves as the "designer" reviewer in the plan review pipeline.

**Why this agent:** Both the Tech Lead and Lead Frontend Engineer have explicit escalation rules for design system changes, but there is no destination agent to receive those escalations. The plan review pipeline includes a "designer" reviewer role (configured in `defaults.yaml`) that has no backing agent. Without this agent, design consistency degrades as the organization grows.

**FR-DS1: Design Token Ownership**
- Define and maintain design tokens: colors, spacing, typography scales, border radii, shadows, breakpoints, motion/animation timing
- Every token must include: name, value, semantic meaning, and usage examples
- Tokens are the contract -- all components and agents must reference tokens, never hardcoded values

**Acceptance Criteria:**
- Token definitions are structured, machine-readable, and documented with usage examples
- Any hardcoded style value in reviewed code triggers a compliance finding

**FR-DS2: Component Governance**
- Evaluate proposals for new components: does a similar component already exist? Can an existing one be extended?
- New components must justify their existence against existing component inventory
- Define component API contracts (props, variants, states) before implementation

**Acceptance Criteria:**
- Component proposals include justification and comparison to existing inventory
- Component specs define props, variants, accessibility requirements, and responsive behavior

**FR-DS3: Compliance Review**
- Audit frontend code for design system compliance: correct token usage, approved component patterns, consistent spacing/typography
- Produce structured compliance verdict (PASS/WARN/FAIL) with specific findings
- Output format matches advisory agent conventions (severity-graded findings with locations and remediation)

**FR-DS4: Plan Review (Designer Role)**
- Serve as the "designer" reviewer in the plan review pipeline
- Focus areas: design task completeness, UX impact assessment, visual/interaction design clarity, accessibility coverage
- Identify milestones or tasks that will impact the user interface but lack design consideration

**FR-DS5: Critical Rules**
- Tokens are the contract: no hardcoded values, no exceptions
- New components must justify existence against the current inventory
- Accessibility is non-negotiable: every component must meet WCAG 2.1 AA
- Document every token with usage examples and anti-patterns
- Design system changes require version documentation (what changed, why, migration path)

---

### 3.10 Agent: Code Reviewer

**Purpose:** Senior Code Reviewer focused on software craftsmanship. Provides mentorship-oriented code review covering correctness, maintainability, convention adherence, and reuse opportunities.

**Why this agent:** The Security Reviewer covers security concerns, but the organization has no agent focused on code quality, maintainability, or craftsmanship. Code review is one of the highest-leverage quality practices in software engineering, and without a dedicated reviewer, the Tech Lead carries the full burden of quality assessment alongside execution duties.

**FR-CR1: Review Categories**

1. **Correctness** -- logic errors, edge cases, error handling, null/undefined safety, race conditions
2. **Maintainability** -- readability, naming clarity, function/module cohesion, appropriate abstraction levels
3. **Performance** -- obvious inefficiencies, unnecessary re-renders, N+1 queries, missing indexes, unbounded operations
4. **Convention** -- adherence to project conventions (from CLAUDE.md, linter config, existing patterns), consistency with surrounding code
5. **Duplication** -- copy-paste code, missed reuse opportunities from existing codebase, utility extraction candidates
6. **Testing** -- test presence and quality, edge case coverage, test naming and organization, assertion specificity
7. **Documentation** -- missing/outdated comments, unclear interfaces, public API documentation

**Acceptance Criteria:**
- Findings are grouped by category with severity (CRITICAL/HIGH/MEDIUM/LOW)
- Every finding includes: location (file:line), description, code example of the issue, suggested fix with code example, explanation of "why" this matters
- The review searches the existing codebase for reuse opportunities before suggesting new abstractions

**FR-CR2: Structured Output**

```
## Code Review Verdict: [PASS | WARN | FAIL]

### Summary
[Brief assessment of overall code quality]

### Findings by Category
#### Correctness
#### Maintainability
#### Performance
#### Convention
#### Duplication
#### Testing
#### Documentation

### Reuse Opportunities
[Existing code that could be leveraged]

### Commendations
[Things done well -- reinforces good practices]
```

**FR-CR3: Review Methodology**
- Read CLAUDE.md and project conventions before beginning any review
- Limit review scope to 200-300 lines of changed code per review pass (request split if larger)
- Search the codebase for existing patterns, utilities, and components before flagging duplication
- Treat review as mentorship: explain the "why" behind every finding, not just the "what"
- Include commendations for well-written code (reinforces good practices per Google review culture)

**FR-CR4: Critical Rules**
- Always read CLAUDE.md before reviewing to understand project conventions
- Limit to 200-300 LOC per pass -- request the diff be split if larger
- Every finding needs a code example (both the issue and the suggested fix)
- Explain the "why" -- a finding without reasoning is not actionable
- Search the codebase for reuse opportunities before suggesting new abstractions
- Advisory only: produces verdict, caller decides action

---

### 3.11 Agent: Quality Engineer

**Purpose:** Senior Quality Engineer responsible for test strategy, test writing, coverage gap analysis, and shift-left testing practices.

**Why this agent:** The Tech Lead already routes "complex test suites, E2E scenarios, test infrastructure" to this agent, but no definition exists. Testing is consistently the most under-invested area of software delivery, and a dedicated agent ensures test quality receives first-class attention rather than being an afterthought of implementation.

**FR-QE1: Test Strategy Design**
- Define test strategy appropriate to project scope: unit, integration, E2E, contract, snapshot, visual regression
- Map testing pyramid to project architecture (what to test at each layer)
- Identify appropriate test tooling for the project's stack
- Recommend coverage targets by module/layer (not a single global number)

**Acceptance Criteria:**
- Test strategy documents specify what is tested at each pyramid layer and why
- Coverage targets are differentiated by module criticality, not uniform

**FR-QE2: Test Writing**
- Write production-quality tests following existing project patterns and conventions
- Tests must target behaviors and outcomes, not implementation details
- Test code quality matters: clear naming, minimal setup, focused assertions, no test interdependence
- Apply the Arrange/Act/Assert (AAA) pattern consistently

**Acceptance Criteria:**
- Tests follow existing patterns (framework, naming, directory structure) in the project
- Each test case has a clear, descriptive name that documents the expected behavior
- Tests are deterministic: no flakiness from timing, ordering, or shared state

**FR-QE3: Coverage Gap Analysis**
- Analyze existing test suite against codebase to identify uncovered areas
- Prioritize gaps by risk: untested error paths, security-sensitive code, complex business logic
- Produce structured gap analysis report with specific recommendations

**FR-QE4: Critical Rules**
- Test behaviors, not implementation: tests should survive refactoring
- Follow existing test patterns in the project before introducing new ones
- Escalate to the caller when acceptance criteria are too vague to write meaningful tests
- Coverage is a metric, not a goal: 100% coverage with shallow assertions is worse than 80% with meaningful ones
- Test code quality matters: it is production code that validates production code

---

### 3.12 Agent: UX Researcher

**Purpose:** UX Researcher specializing in research planning, persona development, journey mapping, and opportunity identification. Prevents the "feature factory" anti-pattern by grounding product decisions in user research.

**Why this agent:** The Product Manager gathers requirements from stakeholders, but there is no agent that systematically represents the end user's perspective through research artifacts. Without a UX Researcher, the organization risks building features that stakeholders request rather than features users need -- the classic "feature factory" failure mode.

**FR-UX1: Research Planning**
- Design research plans appropriate to the question being answered (generative vs. evaluative)
- Define research questions, methodology, participant criteria, and success metrics
- Recommend lightweight research methods that fit the project's constraints (time, budget, access)

**Acceptance Criteria:**
- Research plans specify clear research questions that tie to product decisions
- Methodology is appropriate to the question type (exploratory vs. validation)

**FR-UX2: Persona Development**
- Create evidence-based personas (or assumption-based personas when research is unavailable, clearly labeled as such)
- Personas include: demographics, goals, frustrations, behaviors, context of use, and quotes
- Personas are living documents: updated as new evidence emerges

**FR-UX3: Journey Mapping**
- Map user journeys for key scenarios: stages, actions, thoughts, emotions, pain points, opportunities
- Identify moments of truth (high-impact touchpoints) and moments of friction
- Connect journey stages to product features and identify gaps

**FR-UX4: Opportunity Solution Trees**
- Apply Teresa Torres' Opportunity Solution Tree framework from Continuous Discovery Habits
- Structure: Desired Outcome -> Opportunities -> Solutions -> Experiments
- OSTs must connect to measurable outcomes, not feature requests
- Use OSTs to evaluate competing solution approaches

**FR-UX5: Heuristic Evaluation**
- Evaluate interfaces against established heuristic frameworks (Nielsen's 10, Shneiderman's 8 Golden Rules)
- Produce structured findings with severity, heuristic violated, location, and recommendation
- Distinguish between heuristic violations and user research findings

**FR-UX6: Critical Rules**
- Never substitute assumptions for research -- clearly label assumption-based artifacts
- OSTs must connect to measurable outcomes, not feature wish lists
- Use established heuristic frameworks, not ad-hoc criteria
- Distinguish stated preferences from observed behavior (what users say vs. what they do)
- Always produce actionable recommendations, not just observations

---

### 3.13 Agent: Technical Writer

**Purpose:** Senior Technical Writer producing API documentation, user guides, migration guides, changelogs, and READMEs.

**Why this agent:** No existing agent owns documentation as a first-class output. Documentation is currently a side-effect of implementation (at best), which leads to missing, outdated, or inconsistent docs. A dedicated writer ensures documentation quality matches code quality.

**FR-TW1: Documentation Types**
- API documentation: endpoint specs, request/response examples, authentication, error codes
- User guides: task-oriented documentation for end-user workflows
- Migration guides: step-by-step instructions for breaking changes or version upgrades
- Changelogs: structured change history following Keep a Changelog conventions
- READMEs: project/module overviews with quickstart, prerequisites, and usage examples
- Developer guides: onboarding documentation, architecture overviews, contribution guidelines

**Acceptance Criteria:**
- API docs include working request/response examples for every endpoint
- Migration guides include before/after code examples and explicit steps
- Changelogs categorize changes: Added, Changed, Deprecated, Removed, Fixed, Security

**FR-TW2: Documentation Standards**
- Documentation must be verifiable against the actual code (no aspirational docs)
- Follow "show, then explain" pattern: lead with examples, follow with details
- Write for the reader's context: API docs assume developer familiarity, user guides assume none
- Every breaking change requires a migration guide
- Co-locate documentation with code when possible (inline docs, README per module)

**FR-TW3: Critical Rules**
- Documentation must be verifiable against code: if the code does X, the docs must say X
- Write for the reader's context, not the author's
- Show then explain: examples first, explanation second
- Every breaking change requires a migration guide, no exceptions
- Co-locate docs with code when possible (reduces drift)

---

### 3.14 Agent: SRE Agent

**Purpose:** Site Reliability Engineer providing operational readiness assessment, observability strategy, SLO/SLI definition, runbooks, and blameless postmortem facilitation.

**Why this agent:** The organization currently has zero operational capability. Every agent focuses on building features, but none considers how those features will behave in production. Without an SRE perspective, the organization ships code without observability, without defined reliability targets, and without incident response procedures.

**FR-SRE1: SLO/SLI Definition**
- Define Service Level Objectives from the user's perspective (not internal system metrics)
- Map SLOs to measurable Service Level Indicators with specific thresholds
- Establish error budgets and policies for when budgets are exhausted
- SLOs should be achievable, meaningful, and tied to user-visible behavior

**Acceptance Criteria:**
- SLOs are expressed in user-facing terms (e.g., "99.9% of page loads complete in under 2 seconds")
- Each SLO has a corresponding SLI with a specific measurement methodology
- Error budget policies define actions when budget is exhausted

**FR-SRE2: Observability Strategy**
- Design observability using the MELT framework: Metrics, Events, Logs, Traces
- Identify critical paths that require instrumentation
- Recommend appropriate tooling for the project's infrastructure
- Define alerting strategy: what to alert on, thresholds, escalation paths

**FR-SRE3: Runbook Authoring**
- Produce operational runbooks for common failure scenarios
- Runbooks must be executable under stress: clear steps, no ambiguity, copy-pasteable commands
- Include escalation criteria (when to wake someone up, when to declare an incident)

**FR-SRE4: Blameless Postmortems**
- Facilitate blameless postmortem documentation following the established format: Timeline, Impact, Root Cause, Contributing Factors, Action Items
- Focus on systemic improvements, not individual blame
- Action items must be specific, owned, and timeboxed

**FR-SRE5: Deployment Risk Assessment**
- Review deployments for operational risk: rollback plan, feature flags, canary strategy
- Identify deployments that change system behavior in ways that affect reliability
- Recommend deployment strategies appropriate to the risk level

**FR-SRE6: Critical Rules**
- SLOs from the user's perspective, not the system's -- "API latency p99 < 200ms" is an SLI, "users can complete checkout in under 3 seconds" is an SLO
- Postmortems are blameless, always
- Error budgets are real: when the budget is spent, reliability work takes priority over features
- Observability is not optional for production: if you cannot observe it, you cannot operate it
- Runbooks must be executable under stress: no jargon, no ambiguity, copy-paste commands

---

### 3.15 Agent: Performance Engineer

**Purpose:** Performance Engineer providing quantitative, full-stack performance analysis with a focus on measurable impact.

**Why this agent:** Performance problems are consistently discovered too late in the delivery cycle. The Lead Frontend Engineer checks Core Web Vitals as part of a broad quality gate, but the organization lacks an agent that provides deep, quantitative performance analysis across the full stack. Performance work requires a different mindset than feature work: measurement, baselines, budgets, and trade-off analysis.

**FR-PE1: Full-Stack Performance Analysis**
- Analyze performance across all layers: frontend (Core Web Vitals, bundle size, render performance), backend (API latency, query performance, caching effectiveness), infrastructure (resource utilization, scaling behavior)
- Every finding must be quantified: bytes, milliseconds, percentiles, request counts
- Distinguish theoretical analysis from measured data -- clearly label each

**Acceptance Criteria:**
- Every performance finding includes a quantified measurement or estimate
- Analysis covers at least frontend and backend layers (infrastructure when applicable)
- Theoretical vs. measured findings are clearly distinguished

**FR-PE2: Performance Budgets**
- Define specific, measurable performance budgets: bundle size limits, LCP/FID/CLS targets, API latency percentiles, query execution times
- Budgets must be specific (e.g., "JavaScript bundle under 150KB gzipped") not vague ("keep bundle small")
- Track budget adherence over time

**FR-PE3: Optimization Recommendations**
- Prioritize optimizations by user-perceived impact (not just technical severity)
- Consider the total cost of optimization: implementation effort, maintenance burden, code complexity
- Recommend specific techniques with estimated impact ranges

**FR-PE4: Critical Rules**
- Quantify everything: findings without numbers are opinions, not analysis
- Distinguish theoretical from measured: "this query plan suggests O(n^2)" vs. "this query takes 340ms at 10K rows"
- Prioritize user-perceived performance: a 50ms API improvement matters less than a 50ms LCP improvement
- Consider total cost of optimization: a 10% improvement that doubles code complexity may not be worth it
- Performance budgets must be specific and measurable, not aspirational

---

### 3.16 Agent: Metrics Analyst

**Purpose:** Engineering Metrics Analyst tracking DORA metrics, HEART framework metrics, and product metrics to close the feedback loop between planning and outcomes.

**Why this agent:** The organization plans and executes but has no systematic way to measure whether its execution is effective. Without metrics, retrospectives are opinion-based, prioritization is gut-driven, and improvement is anecdotal. The Metrics Analyst provides the quantitative foundation for continuous improvement.

**FR-MA1: DORA Metrics**
- Track the five DORA metrics (including 2024's Deployment Rework Rate):
  1. Deployment Frequency
  2. Lead Time for Changes
  3. Change Failure Rate
  4. Time to Restore Service
  5. Deployment Rework Rate
- Provide trend analysis: improving, stable, or declining
- Benchmark against DORA's published elite/high/medium/low classifications

**Acceptance Criteria:**
- All five DORA metrics are defined with specific measurement methodologies
- Trend analysis covers at least 3 data points (cycles/sprints)
- Benchmarks reference published DORA classifications

**FR-MA2: HEART Framework**
- Apply Google's HEART framework for product metrics: Happiness, Engagement, Adoption, Retention, Task Success
- For each dimension: define specific metrics, measurement methodology, and targets
- Connect HEART metrics to product goals and user outcomes

**FR-MA3: Product Metrics (AARRR/Pirate Metrics)**
- Track acquisition, activation, retention, referral, and revenue metrics where applicable
- Identify metric gaps: which stages of the funnel are unmeasured?
- Recommend instrumentation for unmeasured stages

**FR-MA4: OKR Tracking**
- Track progress against defined OKRs with specific key results
- Provide confidence ratings for key result achievement
- Identify at-risk OKRs early and recommend corrective actions

**FR-MA5: Critical Rules**
- Metrics are for learning, not judgment: never use metrics to blame individuals or teams
- Always provide context alongside numbers: a metric without context is misleading
- Distinguish leading indicators (predictive) from lagging indicators (retrospective)
- Recommend one change at a time: changing multiple variables makes measurement impossible
- Vanity metrics (those that only go up) are worse than no metrics: focus on actionable metrics

---

### 3.17 Agent: Retrospective Facilitator

**Purpose:** Retrospective Facilitator conducting structured retrospectives with planned-vs-actual analysis and improvement tracking.

**Why this agent:** Without retrospectives, the organization cannot learn from its own execution. Improvement items from previous cycles go untracked, the same mistakes recur, and there is no mechanism for the team (of agents and humans) to adapt its process. The Retrospective Facilitator creates the continuous improvement loop that makes the organization better over time.

**FR-RF1: Retrospective Formats**
- Support multiple retrospective formats:
  - Start/Stop/Continue (default for regular cadence)
  - 4Ls: Liked, Learned, Lacked, Longed For (for reflective retros)
  - Sailboat: Wind (accelerators), Anchor (drag), Rocks (risks), Island (goals)
- Select format based on team context and cycle characteristics

**FR-RF2: Planned-vs-Actual Analysis**
- Compare implementation plan (what was planned) against actual execution (what was delivered)
- Quantify: tasks completed vs. planned, time estimates vs. actuals, scope changes
- Identify patterns: consistently over-estimated? under-estimated? scope creep?

**Acceptance Criteria:**
- Analysis includes specific numbers: X of Y tasks completed, N tasks added mid-cycle, M tasks deferred
- Patterns across multiple cycles are identified when previous retro data is available

**FR-RF3: Improvement Item Tracking**
- Every improvement item must be: specific (not vague), owned (assigned to someone or some agent), and timeboxed (due date or cycle target)
- Track follow-through from previous retrospectives: were previous improvement items completed?
- Limit to 2-3 improvement items per cycle (more than that means nothing gets done)

**FR-RF4: Structured Output**

```
## Retrospective: [Cycle/Sprint Name]

### Format: [Start/Stop/Continue | 4Ls | Sailboat]

### Planned vs. Actual
[Quantified comparison]

### Previous Improvement Items Follow-up
[Status of items from last retro]

### Discussion
[Structured by chosen format]

### Improvement Items (max 3)
| Item | Owner | Due | Success Criteria |
|------|-------|-----|-----------------|
```

**FR-RF5: Critical Rules**
- Blameless framing: focus on process and systems, not individuals
- Every improvement item must be specific, owned, and timeboxed
- Track follow-through from previous retros: untracked improvements are theater
- Limit to 2-3 improvements per cycle: focus beats breadth
- Balance quantitative data (metrics, planned-vs-actual) with qualitative data (team sentiment, pain points)

---

### 3.18 New Commands

**FR-CMD4: review-code**
- Orchestrate comprehensive code review by invoking Code Reviewer + Security Reviewer in parallel, with Performance Engineer as an optional third reviewer
- Deduplicate overlapping findings across reviewers (e.g., both flag the same issue from different angles)
- Synthesize a unified review report with all findings sorted by severity
- Parameters: `diff_source` (git diff, file path, or PR reference), `include_performance` (boolean, default false), `config_path` (optional path to project config)

**Acceptance Criteria:**
- All invoked reviewers run in parallel, not sequentially
- Duplicate findings are merged with the most severe rating preserved
- Unified report clearly attributes findings to the originating reviewer

**FR-CMD5: write-adr**
- Guide creation of an Architecture Decision Record through interactive discussion with the Architect agent
- Facilitate structured exploration: context gathering, alternative identification, trade-off analysis, decision documentation
- Store completed ADR in configurable directory (default: `docs/adrs/`)
- Parameters: `decisions_path` (directory for ADRs, default `docs/adrs/`), `title` (optional starting title)

**Acceptance Criteria:**
- Interactive flow: the Architect asks clarifying questions before drafting
- Final ADR includes at least two alternatives with trade-off analysis
- ADR is numbered and stored in the configured directory

**FR-CMD6: test-coverage-analysis**
- Invoke Quality Engineer to analyze the existing test suite and identify coverage gaps
- Two modes: `analyze` (report only) and `fix` (report + write missing tests)
- Optionally focus analysis on specific modules or directories
- Parameters: `mode` (analyze | fix, default analyze), `focus` (optional path or module name)

**Acceptance Criteria:**
- Analysis mode produces a structured gap report without modifying any files
- Fix mode writes tests following existing project patterns and conventions
- Gap report prioritizes by risk (security-sensitive code, complex logic, error paths)

**FR-CMD7: design-system-audit**
- Invoke Design System Agent to audit frontend code for design system compliance
- Scan specified directories for hardcoded values, non-standard components, token violations
- Parameters: `design_system_spec` (path to design system definition), `scan_paths` (directories to audit)

**Acceptance Criteria:**
- Audit identifies hardcoded color/spacing/typography values that should use tokens
- Audit flags components that duplicate existing design system components
- Report includes specific file locations and suggested token replacements

**FR-CMD8: retrospective**
- Facilitate structured retrospective by invoking Metrics Analyst (for quantitative data) and Retrospective Facilitator (for structured discussion and output)
- Automatically compare implementation plan against actual execution
- Parameters: `plan_path` (implementation plan to compare against), `cycle` (cycle/sprint identifier), `previous_retro` (optional path to previous retrospective for follow-up tracking), `output_path` (where to store the retrospective document)

**Acceptance Criteria:**
- Planned-vs-actual analysis is automatically generated from the implementation plan
- Previous retro improvement items are tracked for follow-through (when provided)
- Output follows the Retrospective Facilitator's structured format

**FR-CMD9: reliability-review**
- Invoke SRE Agent to review operational readiness for a system or feature
- Assess: SLO coverage, observability gaps, runbook completeness, deployment risk
- Parameters: `specs_path` (technical specs or architecture docs), `include_infra` (boolean, include infrastructure review)

**Acceptance Criteria:**
- Review covers SLO/SLI definitions, observability instrumentation, and operational runbooks
- Gaps are identified with specific recommendations and priority levels
- When `include_infra` is true, review extends to infrastructure configuration

**FR-CMD10: write-rfc**
- Guide creation of an RFC (Request for Comments) through interactive discussion with Architect and Product Manager
- After drafting, route RFC through structured review: Tech Lead + Security Reviewer (mandatory) + SRE Agent (optional, for operational impact)
- Parameters: `rfcs_path` (directory for RFCs, default `docs/rfcs/`), `title` (optional starting title)

**Acceptance Criteria:**
- Interactive drafting phase with both Architect (technical) and PM (product) perspectives
- Review phase invokes reviewers in parallel with structured feedback
- Final RFC incorporates reviewer feedback or documents why feedback was deferred

**FR-CMD11: performance-audit**
- Invoke Performance Engineer for full-stack performance analysis and budget definition
- Optionally focus on specific areas: frontend, backend, database, or infrastructure
- Parameters: `focus` (optional: frontend | backend | database | infra | all, default all), `budget_path` (optional path to existing performance budget for comparison)

**Acceptance Criteria:**
- Audit produces quantified findings across all specified focus areas
- When an existing budget is provided, audit reports budget adherence/violations
- Recommendations are prioritized by user-perceived impact

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
- Advisory agents (Terraform Reviewer, Security Reviewer, Code Reviewer, Performance Engineer, etc.) never block -- they provide verdicts
- Execution agents (Tech Lead, Lead Frontend Engineer, Quality Engineer, Technical Writer, etc.) produce artifacts but do not autonomously commit or deploy

**NFR-3: Context Awareness**
- Agents should be able to understand the project they're working in
- Detection of project type, framework, language, and conventions should be automatic where possible
- Rich context (project specs, design systems, architecture docs) improves agent output quality
- Agents that review (Code Reviewer, Design System Agent) must read CLAUDE.md and project conventions before producing output

**NFR-4: Quality**
- All agent definitions must be clear, unambiguous, and complete enough for consistent behavior
- Agent prompts should produce consistent output structure across invocations
- Review agents must not miss CRITICAL severity issues

**NFR-5: Documentation**
- Every agent and command must have a clear markdown definition
- README.md documents the marketplace structure and how to use/extend it
- CLAUDE.md provides developer instructions for working on the plugin

**NFR-6: Parallel Execution**
- Commands that invoke multiple advisory agents (e.g., `review-code`, `write-rfc` review phase) must invoke them in parallel, not sequentially
- Agent definitions must be designed so that advisory agents can operate independently on the same input without coordination
- Commands must handle deduplication when multiple agents produce overlapping findings

**NFR-7: Consistent Output Contracts**
- All advisory agents (Code Reviewer, Security Reviewer, Performance Engineer, Design System Agent, SRE Agent) must use a consistent verdict format: structured header, severity-graded findings, and summary
- All planning agents (Architect, UX Researcher, Retrospective Facilitator) must produce structured, section-based documents with clear headings
- Consistent formatting enables downstream tooling and automated processing

**NFR-8: Graceful Degradation**
- Commands must function correctly when optional agents are unavailable (e.g., `review-code` without Performance Engineer should still produce Code Review + Security Review)
- Plan review must function when some configured reviewers are not yet defined (skip unavailable reviewers, note the gap)
- Agents that reference sub-agents should degrade gracefully if the sub-agent is not available, noting the gap in their output

**NFR-9: Configuration-Driven Behavior**
- Agent and command behavior that varies by project context should be configurable via `.autonomous-org/config.yaml`
- New configurable settings must include sensible defaults in `defaults.yaml` so that the zero-config experience remains functional
- Configuration changes should not require modifying agent definitions

---

## 5. Out of Scope

**Still out of scope (not planned for current expansion):**
- Framework specialist sub-agents (React, Vue, Angular, Ember) -- referenced by Lead Frontend Engineer but not defined; the Lead FE handles all frameworks directly for now
- Cloud provider sub-agents beyond AWS -- Terraform Plan Reviewer references extensibility to GCP/Azure but only AWS is defined
- Resource category sub-agents within cloud providers -- referenced in Terraform Reviewer's sub-agent architecture but not individually defined
- Gitops-friendly cost guardrails configuration for Terraform Plan Reviewer
- Plugin marketplace UI or discovery interface
- Plugin versioning/upgrade workflows
- Multi-marketplace federation
- Authentication/authorization for plugin access
- Real-time collaboration between agents (agents communicate via structured outputs, not live channels)
- Agent memory/learning across sessions (each invocation is stateless)

---

## 6. Success Metrics

### 6.1 Foundation Metrics (MVP)

| Metric | Target |
|--------|--------|
| All 5 MVP agents have complete, unambiguous definitions | 100% |
| All 3 MVP commands reference and delegate to appropriate agents | 100% |
| Marketplace and plugin manifests are valid and correctly register all agents/commands | Valid |
| Agent definitions produce consistent, structured output | Verified via manual testing |
| New agent can be added without modifying existing agents or orchestration logic | Verified |
| Tech Lead can successfully orchestrate at least 2 other agents to complete a multi-step task | Demonstrated |

### 6.2 Expanded Organization Metrics

| Metric | Target |
|--------|--------|
| All 15 agents have complete, unambiguous definitions | 100% |
| All 11 commands reference and delegate to appropriate agents | 100% |
| Architect and Design System Agent fill their reviewer roles in the plan review pipeline | Verified: plan review invokes both and incorporates their feedback |
| Code Reviewer + Security Reviewer produce non-overlapping, complementary findings | Verified: review-code command deduplicates correctly |
| Advisory agents produce consistent verdict format (PASS/WARN/FAIL with severity-graded findings) | Verified across all 7 advisory agents |
| Commands with parallel agent invocation correctly execute in parallel | Verified: review-code, write-rfc review phase |
| Quality Engineer writes tests that follow existing project patterns | Verified: generated tests match project conventions |
| Graceful degradation: commands function when optional agents are unavailable | Verified: review-code without Performance Engineer still produces useful output |
| Retrospective Facilitator tracks improvement items across cycles | Verified: previous retro follow-up is included when provided |
| All new agents pass Layer 1 (schema) and Layer 2 (behavioral) tests | 100% |

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
- Full organization: 15 agents + 11 commands (5 MVP agents + 10 expansion agents; 3 MVP commands + 8 expansion commands)

# Agent Interaction Map

This document describes how the 15 agents in the Synthex interact with each other, the commands that orchestrate them, and the user. It serves as a reference for understanding delegation patterns, quality gates, and information flow across the organization.

---

## Organization Topology

```
                              USER
                                |
                ----------------+----------------
                |               |               |
             Commands      Direct Invoke    Plan Review
                |               |               |
      +---------+---------+     |     +---------+---------+
      |                   |     |     |                   |
      v                   v     v     v                   v
   ORCHESTRATION LAYER
   +------------------+  +------------------+  +------------------+
   | Tech Lead        |  | Lead Frontend    |  | Product Manager  |
   | (execution +     |  | Engineer         |  | (planning +      |
   |  orchestration)  |  | (execution +     |  |  strategy)       |
   |                  |  |  delegation)     |  |                  |
   +--------+---------+  +--------+---------+  +--------+---------+
            |                      |                      |
            v                      v                      v
   SPECIALIST LAYER
   +---------------+ +---------------+ +------------------+
   | Code Reviewer | | Quality Eng.  | | Design System    |
   | Security Rev. | | Performance   | | Architect        |
   | Terraform Rev.| | SRE Agent     | | Technical Writer |
   +---------------+ +---------------+ +------------------+

   RESEARCH & ANALYSIS LAYER
   +---------------+ +---------------+ +------------------+
   | UX Researcher | | Metrics       | | Retrospective    |
   |               | | Analyst       | | Facilitator      |
   +---------------+ +---------------+ +------------------+
```

---

## Interaction Matrix

### Who Invokes Whom

| Invoker | Invokes | When |
|---------|---------|------|
| **Tech Lead** | Lead Frontend Engineer | Frontend UI work, UX-critical features |
| **Tech Lead** | Quality Engineer | Complex test suites, E2E scenarios, test infrastructure |
| **Tech Lead** | Design System Agent | Design system changes, new component variants, token updates |
| **Tech Lead** | Security Reviewer | Security-sensitive changes (review gate) |
| **Tech Lead** | Terraform Plan Reviewer | Infrastructure-as-code changes |
| **Tech Lead** | Product Manager | Requirements clarification, plan updates |
| **Tech Lead** | Code Reviewer | Independent code review before accepting work |
| **Tech Lead** | Performance Engineer | Performance analysis of implemented code |
| **Tech Lead** | SRE Agent | Operational readiness for new services |
| **Tech Lead** | Technical Writer | Documentation for implemented features |
| **Lead Frontend Engineer** | Quality Engineer | Frontend test writing (component tests, interaction tests) |
| **Lead Frontend Engineer** | Design System Agent | Design system consultation, compliance questions |
| **Product Manager** | UX Researcher | User research to inform product decisions |
| **Product Manager** | Metrics Analyst | Product metrics to inform roadmap decisions |

### Who Reviews Whose Work

| Reviewer | Reviews | Context |
|----------|---------|---------|
| **Code Reviewer** | Tech Lead's code, Lead FE's code | Craftsmanship, correctness, specification compliance |
| **Security Reviewer** | Tech Lead's code, Lead FE's code | Security vulnerabilities, secrets, access control |
| **Performance Engineer** | Tech Lead's code, Lead FE's code | Performance impact, algorithmic complexity |
| **Design System Agent** | Lead FE's code | Design token compliance, component usage |
| **Architect** | Implementation plans | Technical feasibility, NFR coverage |
| **Design System Agent** | Implementation plans | Design tasks, UX impact (as "designer" reviewer) |

### Who Provides Data to Whom

| Provider | Consumer | Data |
|----------|----------|------|
| **Metrics Analyst** | Retrospective Facilitator | Quantitative data for retrospectives (DORA, planned vs actual) |
| **Metrics Analyst** | Product Manager | Product metrics (HEART, AARRR) for roadmap decisions |
| **UX Researcher** | Product Manager | Personas, journey maps, research findings for PRDs |
| **SRE Agent** | Tech Lead | SLO/SLI definitions, operational requirements |

---

## Command Orchestration Flows

### `write-implementation-plan`

```
User → PM drafts plan → Reviewers (in parallel):
                          ├── Architect (feasibility, NFRs, architecture)
                          ├── Design System Agent (design tasks, UX impact)
                          └── Tech Lead (task clarity, parallelizability)
                       → PM addresses feedback → Re-review if needed → Final plan
```

### `next-priority`

```
User → Analyze plan → Select top tasks → For each task (in parallel):
                                           └── Tech Lead instance
                                                ├── May delegate to Lead FE
                                                ├── May delegate to Quality Eng.
                                                ├── May request Security Review
                                                └── May request Design System review
                                         → Validate → Merge → Update plan
```

### `review-code`

```
User → Determine scope → Launch reviewers (in parallel):
                          ├── Code Reviewer (craftsmanship, specs)
                          ├── Security Reviewer (vulnerabilities)
                          ├── Performance Engineer (optional)
                          └── Design System Agent (if UI changes)
                       → Consolidate → Unified PASS/WARN/FAIL verdict
```

### `write-adr`

```
User → Architect (interactive session):
         ├── Clarify context
         ├── Explore alternatives (min 2)
         ├── Guide decision
         └── Document consequences
       → Write ADR document
```

### `write-rfc`

```
User → PM provides product context
     → Architect leads technical design (interactive)
     → Review loop (in parallel):
         ├── Architect (self-review)
         ├── PM (product alignment)
         ├── Tech Lead (implementation feasibility)
         └── Security Reviewer (security implications)
     → Address feedback → Write RFC document
```

### `test-coverage-analysis`

```
User → Run coverage report → Quality Engineer:
                               ├── Coverage analysis
                               ├── Gap identification (P1/P2/P3)
                               ├── Test quality assessment
                               └── Strategy recommendations
                             → Optionally: Write tests for P1 gaps → Verify tests pass
```

### `design-system-audit`

```
User → Locate design system spec → Design System Agent:
                                      ├── Token violation scan
                                      ├── Component usage audit
                                      ├── Accessibility check (WCAG 2.1 AA)
                                      └── Recommendations
                                    → Compliance report (PASS/WARN/FAIL)
```

### `retrospective`

```
User → Metrics Analyst gathers quantitative data
     → Review previous retrospective improvement items
     → Retrospective Facilitator (interactive):
         ├── Previous improvement follow-up
         ├── Planned vs actual analysis
         ├── Format session (Start/Stop/Continue | 4Ls | Sailboat)
         ├── Pattern recognition
         ├── Improvement items (max 2-3)
         └── Celebration
     → Write retrospective document
```

### `reliability-review`

```
User → Gather service context → SRE Agent:
                                  ├── SLO coverage assessment
                                  ├── Observability audit (MELT)
                                  ├── Deployment assessment
                                  ├── Runbook coverage
                                  └── Incident response readiness
                                → Optional: Terraform Plan Reviewer (if IaC exists)
                                → Readiness verdict (READY / READY WITH RISKS / NOT READY)
```

### `performance-audit`

```
User → Determine scope (frontend/api/database/full-stack)
     → Performance Engineer:
         ├── Core Web Vitals (if frontend)
         ├── Bundle analysis (if frontend)
         ├── Database query analysis (if applicable)
         ├── API performance assessment
         ├── Caching analysis
         └── Optimization priority matrix
     → Quantified findings with impact estimates
```

---

## Escalation Patterns

### Design System Changes

```
Tech Lead or Lead FE identifies design system change needed
  → Escalates to Design System Agent (NEVER modifies design system unilaterally)
    → Design System Agent evaluates impact
      → If breaking change: escalates to user with migration plan
      → If non-breaking: approves and documents change
```

### Untestable Requirements

```
Quality Engineer receives vague acceptance criteria
  → Escalates to caller (Tech Lead or Lead FE) with specific questions
    → Caller escalates to PM if requirements need clarification
      → PM clarifies or revises requirements
```

### Architecture Concerns

```
Any agent identifies significant architecture risk
  → Escalates to Architect
    → Architect assesses and recommends (ADR if decision needed)
      → Tech Lead implements architectural changes
```

### Recurring Retrospective Items

```
Retrospective Facilitator identifies item appearing 2+ times
  → Escalates with different approach recommendation
    → Either drop the item (not important enough) or address systemic blocker
```

---

## Quality Gate Pattern

All advisory agents follow the same quality gate pattern:

1. **Receive work product** for review (code, plan, design, etc.)
2. **Analyze** against their domain expertise
3. **Produce findings** ranked by severity (CRITICAL / HIGH / MEDIUM / LOW)
4. **Render verdict** (PASS / WARN / FAIL)
5. **Return to caller** — the caller decides what to do with the findings

**Advisory agents never block.** They provide informed recommendations. The orchestrating agent (Tech Lead, PM, or command) makes the ship/no-ship decision.

**Verdict rules across all advisory agents:**
- **FAIL** = Any CRITICAL or HIGH finding present
- **WARN** = Only MEDIUM findings present (no CRITICAL or HIGH)
- **PASS** = Only LOW/Nit findings or no findings

---

## Agent Type Classification

| Type | Agents | Behavior |
|------|--------|----------|
| **Execution + Orchestration** | Tech Lead | Writes code AND delegates to specialists |
| **Execution + Delegation** | Lead Frontend Engineer | Writes code AND delegates to specialists |
| **Execution** | Quality Engineer, Technical Writer | Produces artifacts (test code, documentation) |
| **Advisory (PASS/WARN/FAIL)** | Code Reviewer, Security Reviewer, Terraform Plan Reviewer, Performance Engineer | Reviews work, produces verdicts |
| **Advisory** | Metrics Analyst, Design System Agent (compliance mode), SRE Agent | Provides analysis and recommendations |
| **Planning + Strategy** | Product Manager | Gathers requirements, creates plans |
| **Planning + Advisory** | Architect, UX Researcher, Retrospective Facilitator, Design System Agent (plan review mode) | Designs approaches, provides structured guidance |

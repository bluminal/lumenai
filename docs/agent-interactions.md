# Agent Interaction Map

This document describes how the 19 agents in the Synthex interact with each other, the commands that orchestrate them, and the user. It serves as a reference for understanding delegation patterns, quality gates, and information flow across the organization.

Agents are organized into four layers: **Orchestration** (drive commands and delegate), **Specialist** (produce domain-specific analysis and work), **Research & Analysis** (inform strategy with evidence), and **Utility** (narrow-scope Haiku-backed helpers that let expensive agents delegate mechanical work).

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

   UTILITY LAYER (Haiku-backed helpers)
   +------------------+ +------------------+ +------------------+
   | Findings         | | Plan Linter      | | Plan Scribe      |
   | Consolidator     | | (structural      | | (applies PM's    |
   | (dedup N reviews)| |  pre-review)     | |  edits to plan)  |
   +------------------+ +------------------+ +------------------+
   +-------------------------+
   | Commit Message Author   |
   | (detects project        |
   |  convention; defaults   |
   |  to Conventional        |
   |  Commits 1.0.0)         |
   +-------------------------+
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
| **Tech Lead** | Commit Message Author | Authoring the commit message when the caller requests a commit (Haiku, detects project convention, defaults to Conventional Commits 1.0.0) |
| **Lead Frontend Engineer** | Quality Engineer | Frontend test writing (component tests, interaction tests) |
| **Lead Frontend Engineer** | Design System Agent | Design system consultation, compliance questions |
| **Lead Frontend Engineer** | Commit Message Author | Authoring the commit message when the caller requests a commit |
| **Product Manager** | UX Researcher | User research to inform product decisions |
| **Product Manager** | Metrics Analyst | Product metrics to inform roadmap decisions |
| **Product Manager** | Plan Scribe | Mechanical application of PM's decided edits to the plan document |
| **`write-implementation-plan` command** | Plan Linter | Pre-review structural audit (once per draft cycle) |
| **`write-implementation-plan` command** | Findings Consolidator | Dedup/group/sort reviewer findings before PM reads them |
| **`review-code` command** | Findings Consolidator | Dedup/group/sort findings from Code Reviewer, Security Reviewer, Performance Engineer, Design System Agent |
| **`refine-requirements` command** | Findings Consolidator | Dedup/group/sort PRD reviewer findings before PM triages them |
| **`write-rfc` command** | Findings Consolidator | Dedup/group/sort findings from Architect, PM, Tech Lead, Security Reviewer |

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
User → PM drafts plan → Plan Linter (structural audit, Haiku)
                       → PM addresses structural findings
                       → Reviewers (in parallel):
                          ├── Architect (feasibility, NFRs, architecture)
                          ├── Design System Agent (design tasks, UX impact)
                          └── Tech Lead (task clarity, parallelizability)
                       → Findings Consolidator (dedup/group/sort, Haiku)
                       → PM addresses consolidated findings (delegates writes to Plan Scribe)
                       → Re-review if needed → Plan Scribe writes final plan
```

### `next-priority`

```
User → Analyze plan → Select top tasks → For each task (in parallel):
                                           └── Tech Lead instance
                                                ├── May delegate to Lead FE
                                                ├── May delegate to Quality Eng.
                                                ├── May request Security Review
                                                ├── May request Design System review
                                                └── Commit Message Author (Haiku) per commit
                                         → Validate → Merge → Update plan
```

### `review-code`

```
User → Determine scope → Launch reviewers (in parallel):
                          ├── Code Reviewer (craftsmanship, specs)
                          ├── Security Reviewer (vulnerabilities)
                          ├── Performance Engineer (optional)
                          └── Design System Agent (if UI changes)
                       → Findings Consolidator (dedup/group/sort, Haiku)
                       → Unified PASS/WARN/FAIL verdict
                       → If FAIL: Review Loop (up to review_loops.max_cycles):
                           Caller fixes → Re-review all → Re-consolidate → Check exit
                       → Present final results
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
     → Review loop (up to review_loops.max_cycles, in parallel):
         ├── Architect (self-review)
         ├── PM (product alignment)
         ├── Tech Lead (implementation feasibility)
         └── Security Reviewer (security implications)
     → Findings Consolidator (dedup/group/sort across 4 reviewers, Haiku)
     → Architect addresses CRITICAL/HIGH → Re-review if needed → Write RFC document
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
                                    → If FAIL: Compliance Loop (up to review_loops.max_cycles):
                                        Caller fixes → Re-audit → Check exit
                                    → Present final results
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
                                → If NOT READY: Remediation Loop (up to review_loops.max_cycles):
                                    Caller remediates → Re-review → Check exit
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
     → If CRITICAL/HIGH findings: Optimization Loop (up to review_loops.max_cycles):
         Caller optimizes → Re-audit → Check exit
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
| **Utility (Haiku-backed)** | Findings Consolidator, Plan Linter, Plan Scribe, Commit Message Author | Narrow-scope helpers that let expensive agents delegate mechanical work (deduplication, structural audit, document rewriting, commit-message authoring) |

---

## Per-Agent Interaction Tables (Task 16 / FR-HM6)

Moved verbatim from each specialist's `## Interaction with Other Agents` section (removed from the agent .md files to shrink per-spawn prompt size). Only specialists that had this section are listed; `security-reviewer` and `terraform-plan-reviewer` never had one.

### Architect

| Agent | Interaction |
|-------|------------|
| **Product Manager** | PM invokes you for feasibility consultation. You provide technical analysis; PM makes the scope decision. |
| **Tech Lead** | Tech Lead invokes you for architectural decisions. You provide guidance; Tech Lead implements. |
| **Security Reviewer** | You may identify architectural security gaps (missing auth layer, insecure service communication). Flag them and recommend involving the Security Reviewer for detailed analysis. |
| **Terraform Plan Reviewer** | For infrastructure architecture concerns, recommend involving the Terraform Plan Reviewer for implementation-level analysis. |
| **SRE Agent** | For reliability and observability architecture, recommend involving the SRE Agent when available. |

### Code Reviewer

| Agent | Interaction |
|-------|------------|
| **Security Reviewer** | You both review code but with different lenses. Your findings may overlap. The `review-code` command deduplicates. |
| **Tech Lead** | Tech Lead invokes you as a quality gate. You provide the verdict; Tech Lead decides. |
| **Lead Frontend Engineer** | Lead FE invokes you for frontend code review. Same relationship as with Tech Lead. |
| **Quality Engineer** | If you identify test quality issues, the Quality Engineer can be invoked to address them. |

### Quality Engineer

| Agent | Interaction |
|-------|------------|
| **Tech Lead** | Tech Lead delegates test writing to you and may ask for coverage analysis before accepting work. |
| **Lead Frontend Engineer** | Lead FE delegates frontend test writing (component tests, interaction tests) to you. |
| **Code Reviewer** | Code Reviewer may flag test quality issues; you are the expert who addresses them. |
| **Product Manager** | PM defines acceptance criteria. If they are too vague, you escalate for clarification. |

### Design System Agent

| Agent | Interaction |
|-------|------------|
| **Tech Lead** | Tech Lead escalates design system changes to you. You own the decision. |
| **Lead Frontend Engineer** | Lead FE consults you on component usage, requests new components, and coordinates integration. |
| **Product Manager** | You may be consulted on design feasibility during requirements gathering. |
| **UX Researcher** | Research findings may inform design system evolution (e.g., usability issues with existing components). |

### Performance Engineer

| Agent | Interaction |
|-------|------------|
| **Tech Lead** | Tech Lead invokes you for performance review. You provide quantified findings; Tech Lead decides what to optimize. |
| **Lead Frontend Engineer** | Lead FE invokes you for frontend-specific performance analysis. You provide Core Web Vitals assessment and bundle analysis. |
| **Code Reviewer** | Code Reviewer may flag obvious performance concerns. You provide the deep analysis. |
| **SRE Agent** | Your latency findings may impact SLOs. Coordinate on performance-related reliability concerns. |
| **Architect** | Architect may consult you on performance implications of architectural decisions (caching strategies, database choices, service boundaries). |

### SRE Agent

| Agent | Interaction |
|-------|------------|
| **Tech Lead** | Tech Lead invokes you for reliability review. You provide findings; Tech Lead addresses them. |
| **Terraform Plan Reviewer** | You identify infrastructure reliability concerns; Terraform Reviewer handles infrastructure implementation details. |
| **Security Reviewer** | Security and reliability overlap (e.g., DDoS resilience). Coordinate when both perspectives are needed. |
| **Metrics Analyst** | Metrics Analyst tracks DORA metrics that complement your SLO tracking. |
| **Performance Engineer** | Performance findings may impact SLOs. Coordinate on latency-related concerns. |

### Technical Writer

| Agent | Interaction |
|-------|------------|
| **Tech Lead** | Tech Lead invokes you after implementation to update docs. You read the code they wrote to understand what to document. |
| **Product Manager** | PM invokes you for user-facing content. PM provides the product context; you structure it as documentation. |
| **Architect** | Architect's ADRs are a form of documentation. You may be asked to integrate ADR summaries into architecture documentation. |
| **Code Reviewer** | Code Reviewer may flag documentation gaps. You are the expert who fills them. |

### UX Researcher

| Agent | Interaction |
|-------|------------|
| **Product Manager** | PM invokes you for research. Your findings feed into PRDs and requirements. PM makes product decisions based on your evidence. |
| **Design System Agent** | Your usability findings may reveal issues with design system components. Share findings for component improvement. |
| **Metrics Analyst** | The Metrics Analyst provides quantitative behavioral data that complements your qualitative research. |
| **Lead Frontend Engineer** | Your heuristic evaluations may identify UX issues in the frontend that need engineering fixes. |

### Metrics Analyst

| Agent | Interaction |
|-------|------------|
| **Retrospective Facilitator** | You provide quantitative data; Retrospective Facilitator synthesizes it with qualitative observations. |
| **Product Manager** | PM requests product metrics to inform roadmap decisions. You provide data; PM interprets strategically. |
| **SRE Agent** | SRE Agent tracks SLOs/SLIs (reliability metrics). You track DORA metrics (engineering process metrics). These complement each other. |
| **Tech Lead** | Your DORA metrics may surface engineering process issues (slow reviews, long lead times) that the Tech Lead can address. |

### Retrospective Facilitator

| Agent | Interaction |
|-------|------------|
| **Metrics Analyst** | You request quantitative data (DORA metrics, product metrics). Metrics Analyst provides the numbers; you synthesize them with qualitative observations. |
| **Product Manager** | Your retrospective findings may inform product process improvements. PM may attend retrospectives for product-engineering alignment insights. |
| **Tech Lead** | Your improvement items may require technical changes (e.g., "improve CI pipeline speed"). Tech Lead implements; you track follow-through. |
| **SRE Agent** | Post-incident retrospectives may overlap with the SRE Agent's postmortem process. Coordinate to avoid duplication. |


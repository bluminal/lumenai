# Research Sources & Design Rationale

This document catalogs the research, methodologies, and industry practices that informed the design of each agent in the Autonomous Organization. Every behavioral rule, output format, and interaction pattern traces back to established frameworks and proven practices.

---

## Product Discovery & Strategy

### Teresa Torres — Continuous Discovery Habits

**Applied to:** UX Researcher, Product Manager

- **Opportunity Solution Trees (OSTs):** The UX Researcher produces OSTs that connect desired outcomes to user opportunities to potential solutions. This prevents "solution-first" thinking and grounds product decisions in validated user understanding.
- **Continuous interviewing:** The UX Researcher's research plans emphasize ongoing weekly interviews rather than batch research phases.
- **Assumption mapping:** Research plans include explicit assumption identification and prioritized testing.

**Source:** Torres, T. (2021). *Continuous Discovery Habits*. Product Talk LLC.

### Marty Cagan — Empowered Product Teams

**Applied to:** Product Manager, UX Researcher, Architect

- **Outcome over output:** The Product Manager focuses on measurable outcomes (North Star metrics, OKRs) rather than feature checklists. The Metrics Analyst tracks outcomes, not vanity metrics.
- **Dual-track agile:** Discovery (UX Researcher) and delivery (Tech Lead) operate as complementary tracks, not sequential phases.
- **Product Trio:** PM + Designer + Engineer collaborate on discovery. The organization's plan review loop (PM + Design System Agent + Architect + Tech Lead) embodies this pattern.
- **Feature factory anti-pattern:** The UX Researcher explicitly prevents the "build whatever stakeholders request" pattern by grounding decisions in user evidence.

**Source:** Cagan, M. (2018). *Inspired: How to Create Tech Products Customers Love*. Wiley. Also: Cagan, M. (2020). *Empowered: Ordinary People, Extraordinary Products*. Wiley.

---

## Engineering Excellence

### Google Code Review Standards

**Applied to:** Code Reviewer

- **Core principle:** The purpose of code review is to ensure that code changes improve the overall code health of the codebase while enabling developers to make progress. Approve code that improves the system, even if imperfect.
- **Reviews as mentorship:** Every finding includes the "why" — reviewers teach, not gatekeep.
- **"Nit:" prefix:** Low-severity observations use "Nit:" to signal they're optional suggestions, not blockers.
- **Objectivity:** Focus on facts and standards, not personal style preferences. "This violates the project's established pattern in X" is objective; "I prefer it the other way" is not.

**Source:** Google Engineering Practices Documentation. https://google.github.io/eng-practices/review/reviewer/standard.html

### Google / Shopify / Stripe Code Review Practices

**Applied to:** Code Reviewer, `review-code` command

- **200-300 LOC limit:** Large diffs produce lower-quality reviews. The `review-code` command warns when diffs exceed 300 lines (configurable via `max_diff_lines`).
- **4-hour turnaround target:** Reviews should be fast to avoid blocking developers.
- **Parallel review:** Multiple reviewers operate independently and in parallel, then findings are consolidated.

**Sources:**
- Shopify Engineering Blog — Code review practices
- Stripe Engineering Blog — Code review culture
- Google Engineering Practices — Review speed guidelines

### Shift-Left Testing

**Applied to:** Quality Engineer

- **Requirements-phase involvement:** The Quality Engineer flags untestable requirements and suggests testable acceptance criteria during the planning phase, not after implementation.
- **Test behaviors, not implementation:** Tests that verify public API behavior survive refactoring; tests coupled to internal implementation details create maintenance burden.
- **Testing pyramid:** Many unit tests (60-70%), fewer integration tests (20-30%), minimal E2E tests (5-10%). The Quality Engineer enforces this ratio.
- **Coverage is a metric, not a goal:** Prioritize testing high-risk code paths (auth, payments, data mutations) over achieving an arbitrary coverage percentage.

**Sources:**
- Humble, J. & Farley, D. (2010). *Continuous Delivery*. Addison-Wesley.
- Fowler, M. (2012). "TestPyramid." martinfowler.com
- Google Testing Blog — "Test Sizes" classification

---

## Metrics & Measurement

### DORA Research Program

**Applied to:** Metrics Analyst

- **Five key metrics (2024):** Deployment Frequency, Lead Time for Changes, Mean Time to Recovery, Change Failure Rate, and the 2024 addition: Deployment Rework Rate.
- **Elite/High/Medium/Low benchmarks:** The Metrics Analyst classifies team performance against DORA benchmarks, providing trend direction alongside absolute values.
- **Metrics for learning, not judgment:** DORA metrics show system health, not individual performance. The Metrics Analyst NEVER frames metrics in a way that evaluates specific people.
- **Leading vs lagging indicators:** The Metrics Analyst distinguishes between predictive metrics (lead time, deployment frequency) and confirmatory metrics (change failure rate, incidents).

**Source:** Forsgren, N., Humble, J., & Kim, G. (2018). *Accelerate: The Science of Lean Software and DevOps*. IT Revolution Press. Also: DORA State of DevOps Reports (2018-2024).

### Google HEART Framework

**Applied to:** Metrics Analyst

- **Five dimensions:** Happiness (user satisfaction), Engagement (interaction depth), Adoption (new user activation), Retention (users returning), Task Success (goal completion).
- **Used for product health measurement:** The Metrics Analyst applies HEART when answering "Are users having a good experience?"

**Source:** Rodden, K., Hutchinson, H., & Fu, X. (2010). "Measuring the User Experience on a Large Scale." Google Research.

### AARRR / Pirate Metrics

**Applied to:** Metrics Analyst

- **Growth funnel:** Acquisition → Activation → Retention → Referral → Revenue.
- **Used for growth analysis:** The Metrics Analyst applies AARRR when answering "Is our product growing?"

**Source:** McClure, D. (2007). "Startup Metrics for Pirates." 500 Startups.

---

## Team Dynamics & Culture

### Google Project Aristotle

**Applied to:** All reviewer agents, Retrospective Facilitator, SRE Agent

- **Psychological safety as #1 predictor:** The most important factor in team effectiveness is whether team members feel safe to take risks and be vulnerable. This directly informed:
  - All reviewer agents provide constructive, specific, actionable feedback with code examples
  - All reviewer agents explain the "why" behind findings (reviews as mentorship, not gatekeeping)
  - The "What's Done Well" section is mandatory in all review outputs
  - Postmortems (SRE Agent) are blameless — focus on systems, not individuals
  - Retrospectives (Retrospective Facilitator) are blameless — observations about processes, never people
  - The Celebration section is mandatory in retrospectives

**Source:** Google re:Work — "Guide: Understand team effectiveness." https://rework.withgoogle.com/guides/understanding-team-effectiveness/

### Blameless Postmortem Culture

**Applied to:** SRE Agent, Retrospective Facilitator

- **Systems thinking:** "The review process took longer than expected" — NOT "The reviewer was slow"
- **Root cause analysis:** Five Whys, fishbone diagrams, contributing factor analysis
- **Action items, not blame:** Every postmortem produces specific, owned, timeboxed action items
- **Recurring item escalation:** Items appearing in 2+ retrospectives without resolution must be escalated — either the item isn't important (drop it) or there's a systemic blocker (address that instead)

**Sources:**
- Beyer, B., et al. (2016). *Site Reliability Engineering: How Google Runs Production Systems*. O'Reilly.
- Allspaw, J. (2012). "Blameless PostMortems and a Just Culture." Etsy Engineering Blog.

---

## Site Reliability Engineering

### Google SRE Principles

**Applied to:** SRE Agent

- **SLOs from user perspective:** "API latency p99 < 500ms" is meaningful; "server CPU < 80%" is not. SLOs must reflect what users experience.
- **Error budgets:** The difference between 100% and the SLO target is the error budget. It's a real budget that can be spent on innovation or risk-taking.
- **MELT observability:** Metrics, Events, Logs, Traces — all four signal types are needed for effective observability. The SRE Agent assesses coverage across all four.
- **Runbooks executable at 3 AM:** Runbooks must be specific enough to execute under stress. "Investigate the issue" is not a runbook step.
- **Toil reduction:** Operational work that is manual, repetitive, automatable, and scales linearly with service size is toil. The SRE Agent identifies and recommends reducing it.

**Sources:**
- Beyer, B., et al. (2016). *Site Reliability Engineering*. O'Reilly.
- Beyer, B., et al. (2018). *The Site Reliability Workbook*. O'Reilly.
- Murphy, N.R., et al. (2020). "Implementing SLOs." Google Cloud.

---

## Architecture & Technical Design

### Architecture Decision Records (ADRs)

**Applied to:** Architect, `write-adr` command

- **Institutional memory:** ADRs capture the context and reasoning behind decisions so future team members understand not just what was decided, but why.
- **Alternatives considered:** Every ADR must document genuine alternatives (not straw-man options) to demonstrate the decision was carefully evaluated.
- **Immutable record:** ADRs are never deleted, only superseded. The historical record of decisions is preserved.

**Sources:**
- Nygard, M. (2011). "Documenting Architecture Decisions." Cognitect Blog.
- ThoughtWorks Technology Radar — ADR recommendation

### RFC Process

**Applied to:** Architect, `write-rfc` command

- **Written proposals before implementation:** For significant changes, writing forces clarity of thought that verbal discussion often lacks.
- **Structured review:** Multiple perspectives (product, architecture, security, implementation) review the proposal before commitment.
- **Incremental delivery:** The migration strategy section ensures big-bang deployments are identified and avoided.

**Sources:**
- AWS RFC process documentation
- Google Design Documents practice
- Stripe RFC process (engineering blog)

### Evolutionary Architecture

**Applied to:** Architect

- **Calibrated advice:** The Architect calibrates recommendations to project maturity. Suggesting microservices for a prototype is a CRITICAL finding; for a scaled production system, it may be appropriate.
- **Fitness functions:** Architectural decisions should be validated with automated tests that verify architectural constraints are maintained.
- **Last responsible moment:** Defer architectural decisions until the cost of not deciding exceeds the cost of deciding with incomplete information.

**Source:** Ford, N., Parsons, R., & Kua, P. (2017). *Building Evolutionary Architectures*. O'Reilly.

---

## Multi-Agent System Design

### MetaGPT

**Applied to:** Overall organization structure

- **Standardized Operating Procedures (SOPs):** Each agent has a clearly defined output format and workflow, reducing ambiguity in multi-agent collaboration.
- **Role specialization:** Agents have distinct expertise domains with minimal overlap, preventing conflicting outputs.
- **Structured communication:** Agents communicate through defined artifacts (review findings, coverage reports, ADRs) rather than free-form messages.

**Source:** Hong, S., et al. (2023). "MetaGPT: Meta Programming for Multi-Agent Collaborative Framework." arXiv:2308.00352.

### CrewAI

**Applied to:** Overall organization structure

- **Hierarchical leadership:** The Tech Lead serves as the primary orchestrator, routing work to specialists. This mirrors CrewAI's finding that hierarchical leadership improves efficiency ~30% over flat structures.
- **Clear delegation heuristics:** The Tech Lead's delegation table provides explicit rules for when to do work personally vs. delegate.
- **Parallel execution:** Independent reviewers and specialists run in parallel (e.g., `review-code` launches all reviewers simultaneously).

**Source:** CrewAI documentation and research. https://docs.crewai.com/

---

## Design Systems

### Design System as Product

**Applied to:** Design System Agent

- **Tokens as contracts:** UI code references design tokens, not raw values. This is the fundamental contract that enables consistency at scale.
- **Component governance:** New components must justify their existence — can the desired UI be achieved by composing existing components or adding a variant?
- **Accessibility built-in:** If design system components are accessible, consumers inherit accessibility by default. WCAG 2.1 AA compliance is non-negotiable in design system components.
- **Breaking change management:** Design system changes are treated with the same severity as breaking API changes — migration paths required.

**Sources:**
- Frost, B. (2016). *Atomic Design*. Brad Frost Web.
- Shopify Polaris Design System documentation
- Material Design system documentation

---

## Performance Engineering

### Core Web Vitals

**Applied to:** Performance Engineer

- **LCP < 2.5s, FID/INP < 100ms, CLS < 0.1:** Google's Core Web Vitals provide user-centric performance thresholds that correlate with actual user experience.
- **Performance budgets:** Quantified thresholds (bytes, milliseconds, queries) that the Performance Engineer measures against.
- **Lab vs field data:** The Performance Engineer distinguishes between controlled measurements (Lighthouse) and real-user data (RUM), noting their different applications.

**Sources:**
- Google Web Vitals documentation. https://web.dev/vitals/
- Grigorik, I. (2013). *High Performance Browser Networking*. O'Reilly.

---

## Retrospective Practices

### Structured Retrospective Formats

**Applied to:** Retrospective Facilitator

- **Start/Stop/Continue:** Simple, action-oriented format suitable for most teams.
- **4Ls (Liked/Learned/Lacked/Longed For):** Reflective format that emphasizes learning.
- **Sailboat:** Visual metaphor format (wind, anchors, rocks, island) that surfaces risks alongside retrospective content.
- **Improvement item limits:** Maximum 2-3 items per cycle. More than 3 competing for attention means none get done.
- **Follow-through tracking:** The #1 failure mode of retrospectives is writing improvement items that are never acted upon. The Retrospective Facilitator tracks follow-through religiously.

**Sources:**
- Derby, E. & Larsen, D. (2006). *Agile Retrospectives: Making Good Teams Great*. Pragmatic Bookshelf.
- Kerth, N. (2001). *Project Retrospectives: A Handbook for Team Reviews*. Dorset House.

---

## Anti-Pattern Recognition

Each agent includes explicit anti-pattern detection drawn from industry experience:

| Agent | Anti-Patterns Detected | Source |
|-------|----------------------|--------|
| **Architect** | Distributed monolith, shared mutable database, premature optimization, resume-driven development | Ford (2017), Fowler (2014) |
| **Code Reviewer** | God objects, feature envy, primitive obsession, shotgun surgery | Fowler (2018) *Refactoring* |
| **Metrics Analyst** | Velocity worship, hero culture, review bottleneck, testing theater, metric gaming | DORA Research, Forsgren (2018) |
| **Retrospective Facilitator** | Complaint session, Groundhog Day, improvement graveyard, happy talk, blame game | Derby & Larsen (2006) |
| **SRE Agent** | Heroics culture, alert fatigue, manual toil, SLO-less operation | Google SRE Book (2016) |
| **Performance Engineer** | Premature optimization, theoretical-only analysis, optimizing wrong bottleneck | Knuth (1974), Google Web Vitals |

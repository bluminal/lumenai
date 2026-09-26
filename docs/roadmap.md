# Roadmap: Future Considerations

This document collects the `## Future Considerations` sections that used to live in each specialist agent's own `.md` file. They were moved here per Task 16 (FR-HM6) to shrink the per-spawn prompt size of each specialist -- the content is unchanged, only its location. These are not commitments; they are ideas an agent author flagged as worth considering later.

---

## Architect

- **Threat modeling integration** -- Accept threat model documents as input context to focus architectural review on identified threat surfaces
- **Architecture fitness functions** -- Define automated checks that verify architectural properties are maintained as the system evolves
- **Cross-project architecture governance** -- When multiple projects share infrastructure, coordinate architectural decisions across them

## Code Reviewer

- **Automated pre-checks** -- Integrate with linting/formatting tools to run automated checks before the human-like review, so you can focus on logic and architecture rather than style
- **Review history tracking** -- Track recurring findings across reviews to identify systemic patterns (e.g., "this team consistently misses error handling for async operations")
- **Specification drift detection** -- Proactively scan for code that has drifted from specifications without the specification being updated

## Security Reviewer

These are noted for future development and do not affect current behavior:

- **SAST integration** -- Integrate with static analysis tools (Semgrep, CodeQL, Bandit) to augment manual review with automated pattern detection.
- **DAST coordination** -- Coordinate with dynamic analysis tools for runtime vulnerability detection on deployed preview environments.
- **Compliance mapping** -- Map findings to compliance frameworks (SOC 2, PCI DSS, HIPAA, GDPR) when project compliance requirements are specified.
- **Threat modeling integration** -- Accept threat model documents as input context to focus review on identified threat surfaces.
- **Security regression tracking** -- Track findings across reviews to detect recurring patterns and systemic security weaknesses.

## Terraform Plan Reviewer

These are noted for future development and do not affect current behavior:

- **Gitops-friendly cost guardrails** -- A configuration file (e.g., `.terraform-review.yml`) in the repository that defines cost thresholds, required tags, allowed instance types, and other policy rules. The reviewer would evaluate the plan against these user-defined guardrails in addition to its built-in checks.
- **Azure Specialist** -- Extend the sub-agent registry with an Azure provider specialist covering `azurerm_*` resources with Azure-specific pricing, security, and best practice knowledge.
- **GCP Specialist** -- Extend the sub-agent registry with a GCP provider specialist covering `google_*` resources with GCP-specific pricing, security, and best practice knowledge.
- **Multi-provider plans** -- Handle plans that span multiple providers in a single review, with cross-provider findings (e.g., networking between AWS and GCP).
- **Historical trend analysis** -- Compare the current plan against previous reviews to detect cost drift over time.

## Quality Engineer

- **AI-assisted test generation** -- Generate test cases from requirements using LLM analysis of acceptance criteria
- **Mutation testing** -- Evaluate test suite effectiveness by introducing mutations and checking detection rate
- **Flaky test detection** -- Identify and quarantine tests that pass/fail non-deterministically
- **Test impact analysis** -- Determine which tests need to run based on which code changed (skip irrelevant tests for faster CI)
- **Property-based testing** -- Generate random inputs to find edge cases (Hypothesis, fast-check)

## Design System Agent

- **Automated compliance scanning** -- CI integration that runs design system compliance checks on every PR
- **Design token transformation** -- Generate platform-specific token files (CSS variables, Tailwind config, Swift/Kotlin tokens) from a single source
- **Visual regression testing** -- Automated screenshot comparison for design system components
- **Usage analytics** -- Track which design system components are most/least used to inform evolution priorities

## Performance Engineer

- **Automated performance regression detection** -- CI integration that compares performance metrics against previous builds
- **Real User Monitoring (RUM) integration** -- Analyze actual user performance data alongside synthetic analysis
- **Performance anomaly detection** -- ML-based detection of performance degradation in production
- **Carbon-aware optimization** -- Consider energy efficiency alongside performance (green computing)

## SRE Agent

- **Chaos engineering framework** -- Structured experiments that inject failures to validate resilience assumptions
- **On-call rotation management** -- Define and manage on-call schedules, escalation policies
- **Incident classification taxonomy** -- Standardized incident types for trend analysis
- **Toil tracking** -- Measure and reduce operational toil (repetitive manual work that should be automated)
- **Capacity planning** -- Predict resource needs based on growth trends and SLO requirements

## Technical Writer

- **Automated documentation testing** -- CI checks that verify code examples in documentation actually compile/run
- **Documentation coverage metrics** -- Track what percentage of public APIs have documentation
- **Interactive documentation** -- Runnable code examples (like Jupyter notebooks or Storybook) embedded in documentation
- **Localization** -- Multi-language documentation support

## UX Researcher

- **Research repository** -- Centralized storage of all research findings, tagged by theme, persona, and product area, so insights can be rediscovered and built upon
- **Automated feedback analysis** -- NLP-based analysis of support tickets and user feedback for theme extraction at scale
- **Research democratization** -- Enable non-researchers (engineers, PMs) to conduct lightweight research with templates and guidance

## Metrics Analyst

- **Automated metric collection** -- CI/CD integration that automatically tracks DORA metrics from pipeline data
- **Predictive analytics** -- Use historical trends to predict future metric trajectories
- **Benchmark comparison** -- Compare team metrics against industry benchmarks from DORA reports
- **Developer experience correlation** -- Correlate SPACE framework metrics with DORA metrics to find DevEx improvements that drive delivery improvements

## Retrospective Facilitator

- **Cross-team retrospectives** -- Facilitate retrospectives that span multiple teams working on shared projects
- **Retrospective analytics** -- Track improvement velocity: how quickly does the team implement improvement items?
- **Mood tracking** -- Longitudinal team mood data to correlate with process changes and incidents
- **Automated pattern detection** -- Identify recurring themes across retrospective documents using text analysis


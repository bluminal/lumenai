# ADR-001: Model Selection for Synthex Agents and Commands

## Status
Accepted

## Date
2026-04-21

## Context

Every sub-agent definition in `plugins/synthex/agents/` and every slash command in `plugins/synthex/commands/` is a markdown file that may declare a `model:` field in YAML frontmatter. When the field is omitted, the agent or command inherits the session's default model, which is typically the largest and most expensive model available (Opus).

Before this decision, **none** of Synthex's 15 agents or 12 commands specified a model. Every invocation -- from `init` scaffolding directories to the Code Reviewer applying a rubric to a diff -- ran on Opus. This produced three problems:

1. **Cost.** Opus pricing is roughly 5x Sonnet and 15x Haiku per token. Commands like `init`, `write-adr`, and `retrospective` do almost no reasoning at the top-level agent -- they orchestrate sub-agents, parse user input, or perform mechanical file I/O. Running these on Opus is pure waste.
2. **Latency.** Haiku and Sonnet return tokens noticeably faster than Opus. For low-stakes commands used many times per day, the latency tax is user-visible.
3. **Undifferentiated capacity.** Using Opus everywhere erases the signal that some work is genuinely high-stakes (architecture review, PRD synthesis, SLO design) while other work is routine (documentation, metrics aggregation, rubric application).

The agent and command set spans a wide range of cognitive demands -- from creative strategic planning to mechanical templating. Treating them uniformly leaves both cost and quality on the table.

## Decision

Assign each agent and command an explicit `model:` in its YAML frontmatter, calibrated to the cognition its role actually requires. The three buckets and their rationale:

**Opus (deep reasoning, novel judgment, strategic planning)** -- used where the agent or command must synthesize ambiguous inputs, catch what is *missing* rather than what is present, or produce creative/strategic artifacts.

**Sonnet (experienced engineering judgment, orchestration, rubric + reasoning)** -- used where the work blends applying known patterns with contextual tradeoffs, or where a smaller model might miss important nuance but novel strategy isn't required.

**Haiku (rubric application, templating, mechanical orchestration)** -- used where the work is dominated by applying well-defined rules, generating from a template, or chaining sub-agents together with minimal reasoning at the orchestration layer.

### Agent Assignments

| Agent | Model | Primary Justification |
|-------|-------|----------------------|
| `product-manager` | **opus** | Creative PRD synthesis, interactive Q&A, scope and sequencing tradeoffs -- strategic |
| `architect` | **opus** | Plan review depends on catching omissions; ADR authoring requires long-horizon reasoning |
| `ux-researcher` | **opus** | Research design, persona synthesis, Opportunity Solution Trees -- creative and novel |
| `sre-agent` | **opus** | SLO definition and postmortem root-cause synthesis require systemic reasoning |
| `tech-lead` | **sonnet** | Primary coder and orchestrator; follows plans authored by PM + Architect |
| `lead-frontend-engineer` | **sonnet** | Frontend orchestrator; applies known quality gates (a11y, perf, design system) |
| `security-reviewer` | **sonnet** | Threat modeling is partly creative; security is too costly to fail on |
| `terraform-plan-reviewer` | **sonnet** | Cost and blast-radius tradeoffs require contextual judgment |
| `performance-engineer` | **sonnet** | Root-cause tracing across layers; quantified analysis |
| `quality-engineer` | **sonnet** | Risk-based test prioritization; writes production-quality test code |
| `design-system-agent` | **sonnet** | Governance rules + judgment on component-vs-variant calls |
| `retrospective-facilitator` | **sonnet** | Pattern recognition across cycles, systemic analysis |
| `code-reviewer` | **haiku** | Rubric-driven review against Google standards and project specs |
| `technical-writer` | **haiku** | Template-based documentation (six defined doc types) |
| `metrics-analyst` | **haiku** | Aggregation and reporting against known frameworks (DORA, HEART, AARRR, OKRs) |

### Command Assignments

Commands only orchestrate sub-agents, parse user input, manage review loops, and write files. The heavy cognition happens inside the sub-agents they invoke, which have their own `model:` set independently.

| Command | Model | Primary Justification |
|---------|-------|----------------------|
| `next-priority` | **opus** | Leading execution command; task selection, dependency analysis, worktree/merge orchestration at scale |
| `write-implementation-plan` | **opus** | Authors the project's implementation plan -- a foundational artifact; PM + Architect + Tech Lead review cycle |
| `refine-requirements` | **opus** | Primary PRD-evolution command; PRDs define product scope and direction -- highest-leverage document we produce |
| `write-adr` | **opus** | Architecture decisions persist for years and shape every downstream choice; interactive session with Architect |
| `write-rfc` | **opus** | Technical research and design for significant proposals; multi-agent review loop over novel technical direction |
| `review-code` | **sonnet** | Parallel reviewer launch, severity consolidation, fix-and-re-review loop |
| `design-system-audit` | **sonnet** | Audit + compliance loop management |
| `reliability-review` | **sonnet** | SRE review + optional Terraform review + remediation loop |
| `performance-audit` | **sonnet** | Performance Engineer invocation + optimization loop |
| `init` | **haiku** | Scaffolds files, asks one question, updates `.gitignore` -- purely mechanical |
| `test-coverage-analysis` | **haiku** | Loads config, invokes Quality Engineer -- sub-agent does the work |
| `retrospective` | **haiku** | Chains Metrics Analyst to Retrospective Facilitator |

**Note on Opus-tier commands.** Five commands run on Opus. Four of them (`write-implementation-plan`, `refine-requirements`, `write-adr`, `write-rfc`) produce the project's foundational strategic and architectural artifacts -- plans, PRDs, ADRs, and RFCs. These documents shape every downstream decision, so we pay for the strongest reasoning at the top level even though each command also invokes Opus sub-agents (Product Manager, Architect). The top-level command is not just glue: it drives the interactive flow, interprets ambiguous user input, synthesizes reviewer feedback across cycles, and writes the final document. Using Sonnet or Haiku here would bottleneck the foundational artifacts on a weaker model than the sub-agents producing their content. The fifth, `next-priority`, is the leading execution command and does non-trivial dependency reasoning itself.

### Guiding Heuristics

For future additions and revisions, apply these heuristics in order:

1. **Planning or creative synthesis → Opus.** If the agent or command must produce a novel artifact (PRD, ADR, RFC design, SLO target, research plan, personas), the cost of a worse answer exceeds the marginal token cost.
2. **Rubric or template application → Haiku.** If the work is dominated by checking inputs against a well-defined set of rules, or generating output against a fixed template, Haiku is sufficient.
3. **Orchestration of sub-agents with minimal reasoning at the top level → Haiku.** If the command's job is to invoke a sub-agent and write a file, the sub-agent's model choice dominates; the command does not need to be smart.
4. **Everything in the middle → Sonnet.** Most engineering execution (code review that requires contextual judgment, test writing, code generation following a plan, multi-agent review loops) lives here.
5. **When in doubt, match the *hardest thing the agent must do* rather than the modal task.** A code reviewer that occasionally needs to catch subtle threading bugs still benefits more from being cheap and fast on the 95% simple case -- if the 5% case matters, invoke a more expensive agent explicitly.
6. **Security and reliability deserve upgrades, not downgrades.** When uncertain between Haiku and Sonnet for the Security Reviewer or SRE Agent, pick the larger model. The cost of a missed finding is asymmetric.
7. **Foundational artifacts deserve the strongest model at every layer.** When a command produces a PRD, implementation plan, ADR, RFC, or vision statement -- artifacts that shape many downstream decisions -- run Opus at both the command level and the sub-agent level, even if the command's literal job looks like orchestration. The command still drives the interactive flow and synthesizes the final output; a weaker model at the top bottlenecks the whole pipeline.

## Consequences

### Positive

- **Lower cost.** Cheaper models for routine work reduce per-invocation cost significantly. For repeated commands like `review-code` and `next-priority`, this compounds quickly.
- **Faster responses.** Haiku and Sonnet return tokens faster than Opus. Low-stakes commands (`init`, `test-coverage-analysis`, `retrospective`) feel snappier.
- **Capacity is now a signal.** When a user sees that `architect` or `product-manager` runs on Opus while `code-reviewer` runs on Haiku, the model assignment communicates the cognitive weight of the role. The system becomes more legible.
- **Opus stays available for the work that needs it.** Strategic planning, architecture review, and reliability design still get the most capable model.

### Negative

- **Occasional quality regressions on borderline cases.** A Haiku-backed Code Reviewer may miss findings that an Opus-backed one would catch. The mitigation is to escalate by invocation (not default): if deeper review is needed for a high-risk change, users can invoke a dedicated review with a stronger model rather than pay Opus prices on every PR.
- **Model availability coupling.** Synthex now assumes Haiku, Sonnet, and Opus are all accessible in the user's environment. If a user configures their Claude Code installation to restrict model access, some agents may fail to spawn until they fall back to an available model.
- **Calibration is a judgment call.** Several assignments (Code Reviewer to Haiku, SRE to Opus, Next Priority command to Opus) are defensible in either direction. Future evidence -- agent output quality, user complaints, cost data -- may move individual entries between tiers.

### Neutral

- **Frontmatter is now non-empty for every agent and command.** Previously these files had no frontmatter. Future additions must include a `model:` field, which is a small authoring cost but also an intentional forcing function.
- **No change to test infrastructure.** Layer 1 schema tests validate output structure and are model-agnostic. Layer 2 and 3 tests (behavioral and semantic) invoke agents as configured; if model choice changes an agent's behavior, those tests will surface it.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| **Status quo: inherit session model everywhere** | Zero configuration. Every agent gets the strongest model by default. | High cost on routine work. Latency tax on low-stakes commands. No signal about cognitive weight across the agent set. | The cost and latency problems compound quickly in a plugin designed to be used on every PR and every task. |
| **Opus for every agent, Haiku/Sonnet only for commands** | Agents do the "real" thinking, so keep them strong. Commands are orchestration-only. | Overpays massively for rubric-driven agents (Code Reviewer, Technical Writer, Metrics Analyst). Misses the main cost driver. | Agents are the primary cost sink -- they produce the long outputs. Leaving them all on Opus misses the opportunity. |
| **Sonnet as the universal default** | Simpler mental model. Good-enough reasoning for almost every role. | Wastes Haiku's cost advantage on genuinely mechanical work. Wastes Opus's reasoning on PM, Architect, SRE, UX Researcher -- roles where omissions and creative synthesis matter. | Sonnet is the right default for the middle of the distribution but is a poor choice for either tail. |
| **Per-invocation model override via command parameters** | Users pick the model at call time. Maximum flexibility. | Pushes cost-optimization decision onto every user. Most users will leave the default and the default ends up dominating cost. Increases cognitive load on the user. | Defaults drive real-world cost. The right place to encode model choice is in the agent definition, not in every invocation. |
| **One ADR per agent/command** | Fine-grained record of each individual choice. | 27 ADRs for a single-theme decision. Noise dominates signal. | The per-role justifications are tightly linked -- they share a common framework. One ADR with a table captures the coupling correctly. |

## References

- Synthex agents: `plugins/synthex/agents/` (15 agents)
- Synthex commands: `plugins/synthex/commands/` (12 commands)
- Agent interaction map: `docs/agent-interactions.md`
- Claude Code plugin reference (agent and command frontmatter supports `model:` with values `haiku` / `sonnet` / `opus`)

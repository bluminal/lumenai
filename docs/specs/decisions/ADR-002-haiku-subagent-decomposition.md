# ADR-002: Haiku Sub-Agent Decomposition for Opus Agents

## Status
Accepted

## Date
2026-04-22

## Context

ADR-001 established per-agent model assignments. Under that framework, several agents run on Opus (Product Manager, Architect, UX Researcher, SRE Agent) and several commands run on Opus (`write-implementation-plan`, `refine-requirements`, `write-adr`, `write-rfc`, `next-priority`). That calibration is correct for the strategic reasoning these agents and commands perform.

However, reviewing the actual work these agents do revealed a pattern: a meaningful fraction of an Opus agent's token output is *not* strategic reasoning -- it is mechanical work that would produce the same result at a fraction of the cost on a smaller model. Three examples:

1. **After the Product Manager decides which reviewer findings to accept**, the PM rewrites the implementation plan to apply those decisions. The decision is Opus-worthy; the rewrite is not. Applying an edit to a section of a markdown document -- "add this task with these acceptance criteria to Milestone 2.1" -- is a templating operation that Haiku handles fluently.

2. **When multiple reviewers return findings on the same artifact** (implementation plan, code diff, PRD, RFC), the PM or consuming agent reads three-to-five overlapping reports, deduplicates in its head, groups by section, and sorts by severity before actually reasoning about how to respond. The reasoning about *how to respond* is Opus-worthy; the dedup-and-sort is not.

3. **Before sending a draft plan to expensive reviewers** (Architect on Opus, Tech Lead and Design System Agent on Sonnet), many of the findings those reviewers would raise are structural: "Task 7 is missing acceptance criteria", "Milestone 2 has no parallelizability note", "dependency references Task 12 which does not exist". These findings are determinable from a deterministic rubric and do not need judgment. They waste expensive reviewer tokens when they could be caught by a cheap pre-review linter.

The unifying theme: the *decision* is hard (Opus); the *execution* of the decision on the document is not (Haiku). Running both on the same model conflates two very different workloads and overpays for the cheaper one.

Before this decision, Opus agents did all of this work in-line. Every PM re-draft, every reviewer-output consolidation, every structural check -- all billed at Opus rates on both input and output.

## Decision

Introduce a **Utility Layer** of narrow-scope Haiku-backed sub-agents that Opus agents and commands delegate mechanical work to. Three initial utility agents:

| Agent | Purpose | Invoked by |
|-------|---------|-----------|
| `findings-consolidator` | Dedup, group, and sort findings from N reviewers; preserve attribution; flag severity disagreements | `write-implementation-plan`, `review-code`, `write-rfc`, `refine-requirements` commands |
| `plan-linter` | Structural audit of implementation plan drafts against a deterministic rubric (required sections, typed acceptance criteria, task table structure, dependency validity) | `write-implementation-plan` command (between PM draft and peer review) |
| `plan-scribe` | Apply PM's decided edits to the plan document mechanically; handle renumbering; validate template compliance after edits | Product Manager agent |

All three run on Haiku (`model: haiku`). They have narrow, well-defined input/output contracts and strict scope boundaries -- they never judge, never invent, never second-guess the caller.

### Integration points

1. **`write-implementation-plan` command** gains a new Step 5.5 (Plan Linter pass) between the PM's initial draft and the peer review loop. Step 6c now invokes Findings Consolidator before the PM reads reviewer outputs.

2. **`review-code`, `write-rfc`, `refine-requirements` commands** add Findings Consolidator between reviewer return and consumer triage.

3. **`product-manager` agent** gains a "Delegating Mechanical Edits to Plan Scribe" section instructing the PM to hand off plan rewrites to Plan Scribe after making strategic decisions, and to delegate the compactness pass's text rewriting while retaining the strategic "what to tighten" call.

### Guiding pattern for future utility agents

When evaluating whether a new utility agent is worth creating, apply this test: *is there a workload currently billed to Opus that (a) follows deterministic rules or applies explicit instructions, (b) has a clear input/output contract, and (c) is invoked frequently enough that the decomposition overhead is worthwhile?* If all three are true, a utility agent is justified. If only one or two, keep the work on the Opus agent.

Candidates we deliberately did **not** decompose in this pass (flagged for later if usage justifies):

- **ADR Scribe** -- The Architect could delegate template-filling for ADRs. Low volume (`write-adr` runs rarely); deferred.
- **RFC Scribe** -- Same as above; RFCs are even lower volume.
- **Runbook Scribe** for SRE Agent; **Persona/Journey Scribe** for UX Researcher -- too specialized, too infrequent.
- **PRD Linter** analogous to Plan Linter -- plausible; deferred until we see whether PRDs show the same structural failure modes implementation plans do.

## Consequences

### Positive

- **Reduced cost per run of Opus commands.** The expected savings on `write-implementation-plan` for a simple project is 35-40% (~$1.65-2.00 per run against a ~$4.87 baseline). The savings scale with plan size and number of review cycles.
- **Findings Consolidator compounds across commands.** Because it plugs into four commands including `review-code` (which runs on every PR in projects that adopt it), it is the single highest-leverage utility agent in this decision.
- **Expensive reviewers focus on substance.** Plan Linter catches structural issues before the Architect sees the plan, so Architect's tokens go to architectural judgment rather than "you forgot to tag this criterion [T]".
- **Cleaner abstractions.** The separation between "decide" (Opus) and "execute on the document" (Haiku) makes each agent's scope tighter and more testable. Plan Scribe has a narrow contract that can be schema-validated independently of PM's reasoning quality.
- **Legibility for future maintainers.** The Utility Layer signals clearly that these agents are not first-class roles -- they are internal tooling that exists to optimize the expensive agents' work.

### Negative

- **More agents to maintain.** Three additional agent definitions, each requiring eventual schema validators, fixtures, and behavioral tests to match the existing test pyramid (Layer 1 / Layer 2 / Layer 3). Test work is deferred but tracked.
- **Context loss risk.** Every delegation boundary is an opportunity for misinterpretation. Plan Scribe must receive sufficient context (the plan + the explicit edits) to apply them correctly. Mitigations: Plan Scribe's contract requires explicit edit lists rather than ambiguous instructions; "Could not apply" is a first-class return state.
- **Serialized latency.** Plan Linter runs synchronously before peer reviewers can start; Findings Consolidator runs between reviewers returning and PM starting. Each adds a Haiku-latency step to the pipeline. For `write-implementation-plan` this is acceptable (it is a low-frequency command); for high-frequency commands like `review-code`, the Consolidator's latency is offset by its savings on PM reading time.
- **Risk of over-decomposition.** Adding too many scribes and linters would re-introduce coordination overhead. The "Guiding pattern" above is meant to prevent this. We explicitly deferred four plausible candidates in this pass.
- **Measurement gap.** We do not currently have telemetry wired up to measure the savings empirically. Cost estimates in this ADR are analytic. Actual measurement was deferred in favor of landing the change; ADR-003 (if written) would document a telemetry approach.

### Neutral

- **Haiku quality is the new floor.** The decomposition assumes Haiku can reliably apply edits, dedupe findings, and check a rubric. If Haiku quality degrades or the rubric becomes more nuanced than Haiku can handle, these utility agents will need to move to Sonnet -- at which point the savings shrink. Monitoring behavioral tests (Layer 2) and semantic tests (Layer 3) for quality regressions is the safeguard.
- **Test infrastructure eventually expands.** Each utility agent should get a schema validator and fixtures matching the pattern in `tests/schemas/`. This is follow-up work, not blocking.
- **The pattern is extensible.** If future Opus agents (e.g., a future `vision-writer` or `spec-author`) exhibit the same reasoning-vs-execution split, they can adopt the same delegation pattern without changing the framework.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| **Leave all work on Opus agents (status quo)** | Simple; no new agents to maintain. Every agent reasons end-to-end. | Overpays on mechanical work. PM spends ~60% of output tokens re-drafting; reviewers waste tokens on structural nits. | Clear cost waste that compounds across commands and review cycles. |
| **Split Product Manager into `product-strategist` (Opus) + `product-writer` (Haiku)** | Cleanest structural split; the PM's two workloads become separate agents. | Highly invasive -- every command that invokes PM must orchestrate two agents. Harder to maintain and reason about. Cross-plugin coupling increases. | The scribe-delegation pattern captures most of the cost savings with much less structural change. PM still exists; it just delegates writes. |
| **One generic `document-scribe` used by PM, Architect, SRE, UX Researcher** | Single agent to maintain. Maximum reuse. | Generic agents are hard to get right. Each consumer would need to encode its template rules in the prompt, bloating the caller side. Testing a generic scribe requires covering every template type. | Specific scribes (Plan Scribe today; ADR Scribe, Runbook Scribe later if justified) have clearer contracts and easier quality assurance. |
| **Add the linter and consolidator to the Opus agents' prompts without creating new agents** ("PM, first run this checklist...") | Zero new agents. Zero delegation overhead. | Burns Opus tokens on rubric-application work. Also bloats the Opus agents' system prompts with rubric content, consuming context capacity. | Defeats the entire cost-saving purpose. The mechanical work still runs on Opus. |
| **Build all utility agents; skip integration into commands/PM** | Smaller change surface; agents available for future use. | Zero cost savings today. Agents atrophy without callers. | The point of this decision is to realize the savings. Building them without wiring them up is half the work for none of the value. |
| **Measure first, decompose second** (ADR-003 style: OTel + baseline before any change) | Grounds the decision in real numbers. | Blocks cost savings on a meaningful instrumentation investment we are not ready to make. Savings estimates in this ADR are reasoned and likely directionally correct. | User explicitly asked to proceed without measurement for now; measurement deferred as known follow-up. |

## References

- ADR-001: Model Selection for Synthex Agents and Commands (`docs/specs/decisions/ADR-001-model-selection.md`)
- New utility agents: `plugins/synthex/agents/findings-consolidator.md`, `plan-linter.md`, `plan-scribe.md`
- Modified commands: `plugins/synthex/commands/write-implementation-plan.md`, `review-code.md`, `write-rfc.md`, `refine-requirements.md`
- Modified agent: `plugins/synthex/agents/product-manager.md`
- Interaction map updates: `docs/agent-interactions.md`

# ADR-plus-001: Read-on-Spawn Teammate Identity Resolution

## Status
Proposed

## Date
2026-02-26

## Context

Synthex+ extends Synthex with teams-optimized orchestration for sustained multi-agent collaboration via Claude Code's experimental Agent Teams API. When a team is created, each teammate needs an identity -- the specialized role definition that governs its expertise, output format, behavioral rules, and interaction patterns.

Synthex already maintains 14 agent definitions as markdown files in `plugins/synthex/agents/`. These definitions range from 198 to 327 lines (median ~247 lines, total 3,730 lines across all agents). They are the canonical, tested, and version-controlled source of truth for each agent's behavior.

The Synthex+ implementation plan (D2 in `docs/plans/plus.md`) originally called for **hand-authored compact role identities** (~10-15 lines each) embedded directly in team templates. These condensed summaries would capture each agent's core expertise, output format, and key behavioral rules in a structured format defined by `_identity-format.md`. The implementation plan allocated 9 dedicated tasks (Tasks 14-18, 39-40, 45-46) at Medium complexity each for authoring these identities, plus a structural anchor task (Task 6) for the identity format specification.

This approach created several concerns:

1. **Maintenance burden.** Nine compact identities must be kept in sync with nine Synthex agent definitions. Every change to a Synthex agent's behavioral rules, output format, or scope boundaries requires a corresponding update to the compact identity in Synthex+. There is no automated mechanism to detect when they drift apart.

2. **Fidelity loss.** A 10-15 line summary of a 200-300 line agent definition necessarily discards nuance. The Code Reviewer's 247-line definition includes a detailed severity framework, specification compliance workflow, sub-agent registry, and 12 behavioral rules grounded in Google's code review standards. A 10-15 line summary cannot faithfully represent this. The teammate becomes a diluted approximation of the agent it is supposed to embody.

3. **Cross-plugin coupling.** Synthex+ explicitly avoids modifying Synthex (FR-CX1). Yet compact identities create a semantic dependency: they encode Synthex agent behavior in Synthex+ files. When Synthex agents evolve, Synthex+ identities silently become stale. The plugin boundary that keeps the code separate does not keep the semantics separate.

4. **Authoring cost.** Nine compact identities at Medium complexity each represents significant implementation effort for artifacts whose primary purpose is to approximate content that already exists in complete form.

## Decision

Replace hand-authored compact role identities with a **read-on-spawn** approach. Instead of embedding condensed identity content in team templates, teammate spawn prompts instruct each teammate to read the full Synthex agent definition file as its first action and adopt that identity.

A teammate spawn prompt under this approach takes the form:

```
You are the Tech Lead. Read your full agent definition at
plugins/synthex/agents/tech-lead.md and adopt it as your identity.

Additionally:
- Use the shared task list for all task coordination (claim tasks, report completion, flag blockers)
- Communicate with teammates via mailbox messages, not direct mentions
- Summarize progress every 3-5 completed tasks to manage context
- [Other team-specific behavioral overlay as defined by the template]
```

The template retains its structural role: it defines the team composition (roles table), communication patterns (mailbox usage, task list conventions), task decomposition guidance, quality gates, and "when to use / when NOT to use" thresholds. What it no longer contains is the identity content for each role. That content is resolved at runtime by the teammate reading its own agent definition.

### Mapping to the Agent Definitions

| Template Role | Agent Definition File | Lines |
|---------------|----------------------|-------|
| Tech Lead | `plugins/synthex/agents/tech-lead.md` | 214 |
| Lead Frontend Engineer | `plugins/synthex/agents/lead-frontend-engineer.md` | 203 |
| Quality Engineer | `plugins/synthex/agents/quality-engineer.md` | 217 |
| Code Reviewer | `plugins/synthex/agents/code-reviewer.md` | 247 |
| Security Reviewer | `plugins/synthex/agents/security-reviewer.md` | 256 |
| Performance Engineer | `plugins/synthex/agents/performance-engineer.md` | 214 |
| Design System Agent | `plugins/synthex/agents/design-system-agent.md` | 247 |
| Product Manager | `plugins/synthex/agents/product-manager.md` | 315 |
| Architect | `plugins/synthex/agents/architect.md` | 222 |

### Impact on the Implementation Plan

This decision eliminates the following tasks from the plan:

- **Task 6** (`_identity-format.md` structural anchor) -- No longer needed. There is no compact identity format to standardize.
- **Tasks 14-18** (compact identities for Tech Lead, Lead FE, QE, Code Reviewer, Security Reviewer) -- Replaced by file path references in the template.
- **Tasks 39-40** (compact identities for Performance Engineer, Design System Agent) -- Same.
- **Tasks 45-46** (compact identities for Product Manager, Architect) -- Same.

Total: 11 tasks eliminated (1 Small + 10 Medium complexity).

Template authoring tasks (Tasks 19, 41, 47) are simplified: they no longer depend on compact identity tasks and no longer contain inline identity content. Their dependency chains shorten significantly.

Testing tasks (Task 54) shift focus: instead of validating that compact identities follow `_identity-format.md` structure, schema validators verify that templates reference valid Synthex agent file paths that exist in the plugin's agents directory.

## Consequences

### Positive

- **Zero maintenance overhead.** Teammate identities are always exactly the Synthex agent definitions. No synchronization required. No drift possible. When a Synthex agent definition is improved, every Synthex+ team that spawns that role immediately benefits.
- **Full behavioral fidelity.** Teammates operate with the complete agent definition, including severity frameworks, sub-agent registries, behavioral rules, output format specifications, and scope boundaries. The Code Reviewer teammate IS the Code Reviewer, not a summary of it.
- **Reduced implementation scope.** Eleven tasks (10 Medium, 1 Small) are eliminated from the plan, representing approximately 25-30% of the Phase 2 and Phase 4 template work.
- **Cleaner templates.** Templates focus on what they are uniquely responsible for: team composition, communication patterns, task coordination, and quality gates. They no longer duplicate content that belongs to Synthex.
- **Natural plugin dependency semantics.** If Synthex is not installed, the agent definition files do not exist. The failure mode is clean and obvious: "File not found at `plugins/synthex/agents/tech-lead.md`." This aligns with Synthex+'s existing dependency check in `team-init` (FR-CF2).
- **Single source of truth.** The Synthex agent definitions are the authoritative identity source for both subagent invocations (Synthex) and teammate spawning (Synthex+). No parallel identity system to govern.

### Negative

- **Runtime context consumption.** Each teammate consumes ~200-300 lines of context reading its agent definition at spawn time. For a 4-member implementation team, this is approximately 800-1,000 lines of additional context across the team. For a 5-member review team, approximately 1,000-1,250 lines. This is meaningful but bounded -- it is a one-time read at spawn, not a recurring cost, and is small relative to the total context each teammate will accumulate during a session (codebase files, task descriptions, inter-teammate messages).
- **File path coupling.** Templates must reference correct file paths into the Synthex plugin directory. If Synthex reorganizes its `agents/` directory structure or renames agent files, Synthex+ templates break. This is a tighter coupling than compact identities, which had no runtime file dependency. Mitigation: Synthex agent file paths have been stable since the plugin's creation and are unlikely to change without a major version bump. Layer 1 schema tests validate that referenced paths resolve to existing files.
- **Non-atomic identity resolution.** The teammate must perform a file read as its first action. If the read fails (file permissions, corrupted path, Synthex not installed), the teammate starts without an identity. The compact identity approach had the identity inlined -- it could not fail to load. Mitigation: `team-init` already validates Synthex installation (FR-CF2). Template instructions make the file read mandatory before any other action. Failure to read should be treated as a spawn failure.
- **Agent definitions may contain Synthex-specific context.** Some agent definitions reference Synthex-specific concepts (e.g., "the `review-code` command", "the `next-priority` command") that do not directly apply in a teams context. The team-specific behavioral overlay in the spawn prompt addresses this by layering teams-specific instructions on top of the base identity, but there is a theoretical risk of behavioral confusion if an agent definition strongly assumes the subagent invocation model.

### Neutral

- **Template structure changes.** The `_skeleton.md` structural anchor no longer includes a "Compact Role Identities" section. It retains all other sections (Purpose, Roles Table, Communication Patterns, Task Decomposition Guidance, Quality Gates, When to Use / When NOT to Use). This is a structural simplification, neither clearly positive nor negative.
- **Testing approach shifts.** Layer 1 schema validators for templates move from validating identity content structure to validating agent file path references. The total testing effort is comparable but targets different properties.
- **If Synthex agent definitions grow significantly** (e.g., doubling to 400-600 lines each), the per-teammate context cost increases proportionally. This is a scaling property to monitor but not an immediate concern at current definition sizes.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| **Compact role identities** (original plan, D2) | Minimal context consumption (~10-15 lines per role). No runtime file dependency. Templates are self-contained. | 9 identities to maintain in sync with 9 agent definitions. Fidelity loss from 200-300 lines compressed to 10-15. Drift risk across plugin boundary. 11 implementation tasks. | Maintenance burden and drift risk are ongoing costs that compound over time. The fidelity loss means teammates are approximations of agents rather than the agents themselves. |
| **Full agent definition inlining** | Always current (copied at template authoring time). No runtime file dependency. Full fidelity at authoring time. | Templates balloon to 2,000+ lines (9 agents x ~250 lines each inlined). Extremely difficult to read, review, or maintain. Still drifts if Synthex agents are updated after inlining. | The template becomes unreadable. The drift problem remains (just on a different timeline). The maintenance cost shifts from keeping summaries current to re-inlining after every Synthex agent update. |
| **Reference by name only** ("You are the Tech Lead") | Simplest possible spawn prompt. Zero maintenance. Zero context overhead. | Relies entirely on the LLM's pre-trained knowledge of what a "Tech Lead" does. Non-deterministic -- different models or model versions may interpret the role differently. Cannot encode project-specific behavioral rules, output formats, or scope boundaries. | Synthex's value proposition is precisely that agent definitions encode specific, tested behavioral rules. Discarding those definitions and relying on generic role understanding undermines the entire system. |
| **Auto-summarization** (LLM generates compact identities from full definitions) | Could theoretically maintain freshness by re-summarizing on each invocation. | Adds LLM cost per spawn. Summary quality is non-deterministic. Loses the "tested and version-controlled" property. Introduces a failure mode (bad summary = bad teammate). Cannot be schema-tested because output varies. | Non-determinism in identity resolution is unacceptable for a system that values consistent, predictable agent behavior. The summaries would need their own quality assurance, creating a meta-problem. |

## References

- Synthex+ PRD: `docs/reqs/plus.md` (FR-SP2 for role identity requirements, FR-CX1 for Synthex non-modification constraint)
- Synthex+ Implementation Plan: `docs/plans/plus.md` (D2 for original compact identity decision, Tasks 6, 14-18, 39-40, 45-46 for affected tasks)
- Synthex agent definitions: `plugins/synthex/agents/` (14 agents, 198-327 lines each, 3,730 total lines)
- Plugin configuration defaults: `plugins/synthex/config/defaults.yaml`

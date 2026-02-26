# Teams vs. Subagents Decision Guide

> Concrete guidance for choosing between Synthex+ (persistent teams) and standard Synthex (ephemeral subagents). Reference: FR-CG1.

## Quick Decision

Use **Synthex (subagents)** by default. Switch to **Synthex+ (teams)** only when the work meets multiple criteria in the "Teams" column below. Teams cost approximately 5-8x more tokens than subagents (see Cost Model below), so the benefits must justify the overhead.

---

## Factor Table

| Factor | Synthex (Subagents) | Synthex+ (Teams) | Threshold |
|--------|---------------------|-------------------|-----------|
| **Task duration** | Single focused task, under 30 minutes | Multi-step work exceeding 1 hour of estimated effort | 1 hour estimated effort |
| **Communication needs** | One-way reporting to caller is sufficient; agents work independently | Cross-agent discussion needed; agents must share discoveries, coordinate on integration points, or alert each other to cross-domain issues | 2+ agents need to exchange information |
| **Context continuity** | Fresh context per invocation is acceptable; no iterative refinement | Maintaining context across iterations is valuable; reviewers or implementers build on prior cycle knowledge | 2+ review/implementation cycles expected |
| **Parallelism needs** | Independent tasks with no coordination; can run sequentially or in parallel worktrees without communication | Parallel tasks with integration points; agents need to coordinate on shared interfaces, dependencies, or concurrent file access | 2+ agents working on interdependent tasks |
| **Review depth** | Standard review of under 500 lines of changed code; single-concern changes | Deep review of 500+ lines, security-critical changes, or multi-module changesets where cross-domain discovery matters | 500 lines changed OR security-critical |
| **Cost sensitivity** | Budget-constrained; minimize token usage | Quality and thoroughness over cost for critical work | Team multiplier (~5-8x) is acceptable |

### Reading the table

Count how many factors fall in the "Teams" column for your specific task:

- **0-1 factors:** Use Synthex subagents. Teams add overhead without proportional benefit.
- **2-3 factors:** Consider teams. Evaluate whether the specific factors that apply are high-impact for your use case.
- **4+ factors:** Use Synthex+ teams. The coordination, context, and parallelism benefits justify the cost.

---

## Decision Matrix by Command

| Scenario | Subagent Command | Team Command | Use Teams When |
|----------|-----------------|--------------|----------------|
| **Implementation** | `next-priority` | `team-implement` | Work spans 3+ files across 2+ system layers AND exceeds 4 hours of estimated effort AND specialists need real-time coordination |
| **Code review** | `review-code` | `team-review` | Diff exceeds 500 lines OR changes are security-critical OR changes span 5+ files across multiple modules |
| **Planning** | `write-implementation-plan` | `team-plan` | PRD contains 10+ requirements OR plan spans multiple phases OR significant architectural decisions require concurrent evaluation from multiple perspectives |

### Implementation: `next-priority` vs. `team-implement`

**Use subagents when:**
- Single focused task under 30 minutes
- Work is confined to a single domain (frontend-only or backend-only)
- Pure refactoring or documentation with no integration points

**Use teams when:**
- Changes span frontend + backend + tests simultaneously
- Multiple specialists need real-time coordination (e.g., frontend implementer and test writer working on the same component)
- The milestone has 5+ interdependent tasks that benefit from shared context

### Code Review: `review-code` vs. `team-review`

**Use subagents when:**
- Diff is under 200 lines with a single concern
- Routine bug fixes confined to 1-2 files
- Documentation-only or configuration-only changes

**Use teams when:**
- Diff exceeds 500 lines of changed code
- Changes touch authentication, authorization, cryptography, or API surface
- Pre-release review requiring multi-perspective sign-off
- You need cross-domain discovery (e.g., code reviewer spotting security issues and alerting the security reviewer directly)

### Planning: `write-implementation-plan` vs. `team-plan`

**Use subagents when:**
- Planning a single feature or small scope change
- Updating an existing plan with incremental changes
- PRD is straightforward with fewer than 10 requirements

**Use teams when:**
- PRD contains 10+ requirements spanning multiple implementation phases
- Architecture, design, and implementation concerns are deeply intertwined
- Cross-domain feedback is expected (architecture decisions affecting design patterns, sequencing affecting task breakdown)
- You need reviewers to maintain context across multiple review cycles rather than starting fresh each time

---

## Cost Model

Teams spawn persistent agent instances that maintain context across the entire session. This provides coordination and continuity benefits but costs more tokens than ephemeral subagents.

### Approximate formulas

```
subagent_cost = num_tasks * 20,000 tokens
team_cost     = (num_teammates * 50,000) + (num_tasks * num_teammates * 20,000)
multiplier    = team_cost / subagent_cost
```

### Typical multipliers by command

| Command | Teammates | Typical Tasks | Multiplier | Justification |
|---------|-----------|---------------|------------|---------------|
| `team-implement` | 5 (Lead, Frontend, Quality, Reviewer, Security) | 8-15 | ~5.6-5.8x | Specialists only work on role-relevant tasks, so actual cost is lower than the formula suggests |
| `team-review` | 2-4 (Lead, Craftsmanship, Security, +optional Performance/Design) | 2-4 | ~6.0-8.0x | Each reviewer examines the full scope, so estimate is closer to actual |
| `team-plan` | 4 (PM, Architect, Designer, Implementer) | 3 per cycle | ~7.3x | All reviewers examine the full plan; multiple cycles increase total cost |

### When the cost is worth it

The team multiplier is justified when:

1. **Cross-domain discovery** catches issues that isolated reviewers would miss (team-review)
2. **Context continuity** produces higher-quality feedback in later review cycles (team-plan)
3. **Parallel coordination** eliminates the integration overhead of sequential, context-unaware subagents (team-implement)
4. **Quality gates with full context** catch more issues because reviewers understand the broader work being done (all commands)

The multiplier is NOT justified when the work is small, single-domain, or low-risk -- in those cases, subagents deliver equivalent quality at a fraction of the cost.

### Cost configuration

The pre-creation cost estimate can be disabled for users who have already accepted the cost model:

```yaml
# .synthex-plus/config.yaml
cost_guidance:
  show_cost_comparison: false  # Skip estimate and confirmation prompt
```

See the canonical cost estimate display format in `plugins/synthex-plus/docs/output-formats.md`.

---

## Decision Flowchart

```
START: You have work to do
  |
  v
Is the work a single task under 30 minutes? ----YES----> Use Synthex subagents
  |
  NO
  |
  v
Does it require cross-agent communication? -----NO-----> Use Synthex subagents
  |
  YES
  |
  v
Will agents benefit from persistent context? ---NO-----> Use Synthex subagents
  |                                                       (parallel worktrees
  YES                                                      may suffice)
  |
  v
Is the ~5-8x token cost acceptable? ------------NO-----> Use Synthex subagents
  |
  YES
  |
  v
Use Synthex+ teams
  |
  v
Which command?
  |
  |--- Implementation (multi-step, multi-layer) --> team-implement
  |--- Code review (large diff, high-risk)      --> team-review
  |--- Planning (complex PRD, multi-phase)      --> team-plan
```

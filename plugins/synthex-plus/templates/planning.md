# Planning Team Template

> Collaborative implementation planning where architect, designer, and tech lead contribute simultaneously rather than reviewing sequentially -- teams-optimized equivalent of Synthex's `write-implementation-plan` command.

## Purpose

- Enables concurrent plan review across architecture, design, and implementation perspectives with persistent context, unlike the sequential subagent review loop in `write-implementation-plan` where reviewers lose all context between cycles.
- Optimized for large PRDs and multi-phase plans where cross-domain feedback (e.g., architecture decisions affecting design patterns, sequencing concerns affecting task breakdown) needs real-time coordination between reviewers rather than isolated reports aggregated by the PM.
- Review quality improves across cycles because reviewers persist and maintain awareness of what they flagged previously, what the PM changed, and how their feedback was addressed -- no context reset between iterations.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | `plugins/synthex/agents/product-manager.md` | Yes | Mailbox: sends plan drafts to reviewers; receives feedback from all roles; asks user for guidance when requirements are ambiguous. Task list: creates one review task per reviewer with the plan draft (or reference to it), the reviewer's focus area, and the minimum severity to address. Reporting: produces the final implementation plan. Authority: PM has final say on requirements content (consistent with Synthex convention); when feedback conflicts between reviewers, PM decides. |
| Architect | `plugins/synthex/agents/architect.md` | Yes | Mailbox: sends findings to Lead (PM); messages Implementer when sequencing concerns affect task breakdown; messages Designer when architecture decisions affect design patterns. Task list: claims architecture review tasks. Focus: technical feasibility, architecture risks, alternative approaches, system boundary decisions. Defers to PM on requirements scope -- only advises on feasibility. |
| Designer | `plugins/synthex/agents/design-system-agent.md` | Yes | Mailbox: sends findings to Lead (PM); messages Implementer when design tasks need specific acceptance criteria. Task list: claims design review tasks. Focus: missing UX tasks, accessibility coverage, design system compliance, component-level acceptance criteria gaps. |
| Implementer | `plugins/synthex/agents/tech-lead.md` | Yes | Mailbox: sends findings to Lead (PM); messages Architect when dependency chains have errors or task complexity estimates seem wrong. Task list: claims implementation review tasks. Focus: task clarity, complexity grading, parallelizability, dependency accuracy, estimation realism. |

### Spawn Pattern (read-on-spawn)

Each teammate's spawn prompt follows this structure:

1. **Identity:** "Read your full agent definition at `{agent file path}` and adopt it as your identity"
   - The teammate reads the complete Synthex agent markdown file as its first action
   - This gives the teammate full behavioral fidelity: expertise, output format, severity frameworks, behavioral rules
   - No condensed summaries or inline identities -- the canonical agent file IS the identity

2. **Overlay:** Team-specific behavioral instructions from the overlay column above
   - Mailbox usage conventions (when to send messages, to whom, expected format)
   - Task list conventions (how to claim tasks, report completion, flag blockers)
   - Communication patterns (who this role coordinates with directly, reporting cadence)
   - These overlay instructions layer ON TOP of the base agent identity -- they do not replace it

3. **Context:** Planning-specific context
   - CLAUDE.md and project-level conventions
   - The PRD being planned against (requirements path)
   - The current plan draft (provided by the PM at each review cycle)
   - Review focus area and minimum severity threshold from configuration

## Communication Patterns

- PM creates the initial plan draft and shares it via task descriptions (inline for small plans, file reference for large ones). Each reviewer receives a dedicated review task containing the draft, their focus area, and the severity threshold from `review_loops.min_severity_to_address`.
- Reviewers (Architect, Designer, Implementer) execute their reviews concurrently and post structured findings to the shared task list with severity levels (CRITICAL/HIGH/MEDIUM/LOW). Findings are posted as task completion notes on their respective review tasks.
- Cross-concern findings are messaged directly between reviewers using SendMessage (type: "message"). Examples: Architect messages Implementer about a sequencing concern that affects task breakdown; Designer messages Implementer when design tasks need specific acceptance criteria; Architect messages Designer when an architecture decision constrains design patterns.
- PM addresses consolidated feedback after all reviewers complete their cycle. PM iterates on the plan, then creates new review tasks for the next cycle if unresolved findings remain above the severity threshold. Reviewers persist across cycles -- they are not re-spawned.

## Task Decomposition Guidance

- PM creates one review task per active reviewer per review cycle. Each task description includes: the plan draft (or file path reference), the reviewer's specific focus area, and the minimum severity to address (from config `review_loops.min_severity_to_address`, default: high).
- No dependency chains between reviewer tasks within a cycle -- all three reviewers work in parallel. Cross-cycle dependencies are implicit: cycle N+1 review tasks are created only after PM incorporates cycle N feedback.
- Task descriptions follow the `references` context mode (pointers to the plan file, relevant specs, PRD sections). Reviewers read referenced files when they claim the task. PM includes specific guidance on what changed since the last cycle to focus reviewer attention.
- Reviewers claim tasks via TaskUpdate (status: "in_progress", owner: reviewer name). Completion includes structured findings with severity levels. PM monitors task list for all three reviewers to complete before starting the next iteration.
- Discovered concerns outside a reviewer's focus area are reported via SendMessage to the relevant reviewer, not added to their own findings. Example: if Designer discovers a potential architecture risk, they message Architect rather than including it in their design findings.

## Quality Gates

- Review cycle counting enforced against `review_loops.max_cycles` (default 3 for planning, per config `implementation_plan.review_loops.max_cycles`). PM tracks the current cycle number and stops initiating new cycles after the limit.
- PM must address all findings at or above `review_loops.min_severity_to_address` (default: high). CRITICAL and HIGH findings require explicit resolution in the plan or documented rationale for deferral. MEDIUM and LOW findings are addressed at PM discretion.
- After max cycles, any unresolved findings are documented in the plan's Open Questions section with the original severity, reviewer attribution, and PM rationale for deferral. No TaskCompleted hook -- planning review is coordinated by the PM via task list management, not hook-driven.

## When to Use / When NOT to Use

**Use this template when:**

- The PRD contains 10+ requirements or the plan will span multiple implementation phases
- The project involves significant architectural decisions where feasibility, design impact, and implementation complexity need concurrent evaluation
- Cross-domain feedback is expected -- architecture decisions affect design patterns, sequencing affects task breakdown, or design requirements affect complexity estimates

**Do NOT use this template when:**

- Planning a single feature or small scope change (use Synthex `write-implementation-plan` instead)
- Updating an existing implementation plan with incremental changes (use Synthex `write-implementation-plan` instead)
- The PRD is straightforward with fewer than 10 requirements and no significant architectural decisions (use Synthex `write-implementation-plan` instead)

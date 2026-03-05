# Refine Team Template

> Collaborative PRD refinement where product manager, tech lead, and designer review requirements simultaneously with persistent context -- teams-optimized equivalent of Synthex's `refine-requirements` command.

## Purpose

- Enables concurrent PRD review across product, engineering, and design perspectives with persistent context, unlike the sequential subagent review loop in `refine-requirements` where reviewers lose all context between cycles.
- Optimized for large or complex PRDs where cross-perspective feedback (e.g., product scope affecting technical feasibility, engineering constraints informing design decisions) needs real-time coordination between reviewers.
- Review quality improves across cycles because reviewers persist and maintain awareness of what they flagged previously, how the orchestrator addressed it, and what the user clarified -- no context reset between iterations.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | `plugins/synthex/agents/product-manager.md` | Yes | Mailbox: shares current PRD with reviewers; receives findings from all roles; triages findings (answerable from context vs. needs user input); asks user for guidance via AskUserQuestion when needed. Task list: creates one review task per reviewer with the PRD (or reference to it), the reviewer's focus area, and the minimum severity to address. Reporting: writes the refined PRD. Authority: PM has final say on requirements content; when feedback conflicts between reviewers, PM decides. Key difference from planning template: output is the updated PRD, not an implementation plan. |
| Engineer | `plugins/synthex/agents/tech-lead.md` | Yes | Mailbox: sends findings to Lead (PM); messages Designer when engineering constraints affect UX requirements; messages Lead when implicit technical assumptions need to be made explicit in the PRD. Task list: claims engineering review tasks. Focus: technical clarity, implicit assumptions that should be explicit, NFR targets (performance, scale, security), missing requirements that would surface during implementation, edge cases for core flows. |
| Designer | `plugins/synthex/agents/lead-frontend-engineer.md` | Yes | Mailbox: sends findings to Lead (PM); messages Engineer when UX requirements imply technical constraints; messages Lead when interaction patterns or user flows are incomplete. Task list: claims design review tasks. Focus: UX clarity, interaction pattern completeness, responsive/accessibility requirements, visual/interaction design decisions needed before implementation, user flow completeness (error states, empty states, loading states). |

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

3. **Context:** Refine-specific context
   - CLAUDE.md and project-level conventions
   - The PRD being refined (requirements path)
   - Technical context (specs, codebase state) so reviewers understand what's already documented
   - Review focus area and minimum severity threshold from configuration

## Communication Patterns

- PM shares the PRD via task descriptions (inline for small PRDs, file reference for large ones). Each reviewer receives a dedicated review task containing the PRD, their focus area, and the severity threshold from `review_loops.min_severity_to_address`.
- Reviewers (Engineer, Designer) execute their reviews concurrently and post structured findings to the shared task list with severity levels (CRITICAL/HIGH/MEDIUM/LOW). Each finding includes a specific question and suggestion for how the PRD could be improved.
- Cross-concern findings are messaged directly between reviewers using SendMessage (type: "message"). Examples: Engineer messages Designer when a technical constraint affects UX requirements; Designer messages Engineer when an interaction pattern implies engineering complexity.
- PM triages findings after all reviewers complete their cycle: answers from context are applied directly to the PRD; questions requiring user judgment are batched and asked via AskUserQuestion. PM then creates new review tasks for the next cycle if unresolved findings remain.

## Task Decomposition Guidance

- PM creates one review task per active reviewer per review cycle. Each task description includes: the PRD (or file path reference), the reviewer's specific focus area, the minimum severity to address (from config `review_loops.min_severity_to_address`, default: high), and technical context references.
- No dependency chains between reviewer tasks within a cycle -- both reviewers work in parallel. Cross-cycle dependencies are implicit: cycle N+1 review tasks are created only after PM triages cycle N findings and updates the PRD.
- Task descriptions follow the `references` context mode (pointers to the PRD file, relevant specs, CLAUDE.md). Reviewers read referenced files when they claim the task. PM includes specific guidance on what changed since the last cycle to focus reviewer attention.
- Reviewers claim tasks via TaskUpdate (status: "in_progress", owner: reviewer name). Completion includes structured findings with severity levels, questions, and suggestions. PM monitors task list for both reviewers to complete before triaging findings.
- Discovered concerns outside a reviewer's focus area are reported via SendMessage to the relevant reviewer, not added to their own findings. Example: if Engineer discovers a UX gap, they message Designer rather than including it in their engineering findings.

## Quality Gates

- Review cycle counting enforced against `review_loops.max_cycles` (default 2 for refine, per global config). PM tracks the current cycle number and stops initiating new cycles after the limit.
- PM must address all findings at or above `review_loops.min_severity_to_address` (default: high). CRITICAL and HIGH findings require explicit resolution in the PRD or documented rationale for deferral. MEDIUM and LOW findings are addressed at PM discretion.
- After max cycles, any unresolved findings are added to an "Open Questions" section at the end of the PRD with the original severity, reviewer attribution, and PM rationale for deferral. No TaskCompleted hook -- refine review is coordinated by the PM via task list management, not hook-driven.

## When to Use / When NOT to Use

**Use this template when:**

- The PRD is large (20+ requirements) or spans multiple product areas
- Cross-perspective feedback is expected -- engineering constraints affect product scope, UX requirements imply technical complexity, or design decisions need product validation
- Multiple review cycles are likely needed and reviewer context persistence across cycles is valuable

**Do NOT use this template when:**

- Refining a small or focused PRD (fewer than 10 requirements) -- use Synthex `refine-requirements` instead
- Quick spot-check of a single section -- use Synthex `refine-requirements` instead
- The PRD is well-understood and only needs minor polish -- use Synthex `refine-requirements` instead

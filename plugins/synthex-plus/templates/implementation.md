# Implementation Team Template

> Sustained feature development requiring parallel coding, design coordination, and quality assurance -- teams-optimized equivalent of Synthex's `next-priority` command.

## Purpose

- Enables parallel implementation across frontend, backend, and test layers with persistent context and cross-team communication, unlike sequential subagent invocations.
- Optimized for multi-component features where specialists need to coordinate on integration points, shared state, and cross-cutting concerns in real time.
- Quality is embedded in the workflow through dedicated reviewer teammates who receive completed work via TaskCompleted hooks, not bolted on after implementation.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | `plugins/synthex/agents/tech-lead.md` | Yes | Mailbox: sends task assignments and status requests to teammates; receives completion reports and blocker notifications. Task list: creates all tasks with descriptions, acceptance criteria, and blockedBy dependencies; assigns tasks based on role match; monitors progress. Reporting: produces progress reports (per `docs/output-formats.md`) at natural checkpoints (every 3-5 completed tasks). |
| Frontend | `plugins/synthex/agents/lead-frontend-engineer.md` | Yes | Mailbox: messages Lead when blocked or discovering cross-cutting concerns; messages Quality when implementation ready for test writing. Task list: claims frontend tasks, reports completion with files modified, flags blockers with reason. Communication: coordinates directly with Quality on component testability. |
| Quality | `plugins/synthex/agents/quality-engineer.md` | Yes | Mailbox: messages Lead when discovering test gaps or coverage concerns; receives notifications from Frontend when components ready for testing. Task list: claims test-writing tasks, reports completion with coverage delta. Communication: can request clarification from Lead or Frontend on acceptance criteria. |
| Reviewer | `plugins/synthex/agents/code-reviewer.md` | Yes | Mailbox: receives review assignments from TaskCompleted hook routing; sends review verdicts (PASS/WARN/FAIL) to Lead with findings. Task list: claims review tasks created by the hook system. Communication: if FAIL verdict, messages the original implementer (Lead or Frontend) with specific findings and required changes. |
| Security | `plugins/synthex/agents/security-reviewer.md` | Yes | Mailbox: receives review assignments alongside Reviewer for all task types; sends security-specific verdicts to Lead. Task list: claims security review tasks. Communication: if security finding overlaps with code quality, messages Reviewer to cross-reference. |

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

3. **Context:** Milestone/project context
   - CLAUDE.md and project-level conventions
   - Relevant specifications and design documents
   - Implementation plan (milestone scope, task dependencies, acceptance criteria)
   - Any task-specific context the lead provides at assignment time

## Communication Patterns

- Lead creates initial task decomposition on the shared task list and assigns tasks by role. Teammates are notified via task list updates. Lead monitors progress by periodically checking TaskList.
- Frontend and Quality use SendMessage (type: "message") to notify the Lead when blocked. Include the task ID, blocker description, and suggested resolution. Lead responds via SendMessage or by updating the task description.
- When Frontend completes a component, it messages Quality directly (SendMessage, type: "message") with the file paths and component description so Quality can begin test writing without waiting for Lead routing.
- The TaskCompleted hook routes completed implementation tasks to Reviewer and Security for review. If review returns FAIL, the hook blocks task completion (exit code 2) and the findings are fed back to the implementer.
- Escalation: if a teammate is blocked for longer than `lifecycle.stuck_task_timeout_minutes` (default 30 minutes), Lead intervenes -- reassigns the task or unblocks the dependency.

## Task Decomposition Guidance

- Lead maps each implementation plan task to one or more shared task list items using TaskCreate. Each task description includes: CLAUDE.md reference, relevant spec links, acceptance criteria from the plan, and inter-task integration points.
- Dependencies use `addBlockedBy` to enforce ordering. Example: "Write login component tests" is blockedBy "Implement login component". Parallel tasks within the same layer (e.g., two independent frontend components) have no dependencies.
- Task descriptions follow the `references` context mode by default (pointers to files/specs, not full inline content). This keeps task list token cost low. Teammates read referenced files when they claim the task.
- Teammates claim tasks via TaskUpdate (status: "in_progress", owner: teammate name). Only claim unblocked, pending tasks matching their role. Mark completed via TaskUpdate (status: "completed") with a brief completion note.
- Discovered work (tasks not in the original plan) is reported to the Lead via SendMessage. Lead creates new tasks on the shared task list and, if significant, notes them for the implementation plan update.

## Quality Gates

- TaskCompleted hook fires on every task completion. The `task-completed-gate.sh` shim routes to appropriate reviewers based on task type: code tasks to code-reviewer + security-reviewer, frontend tasks to code-reviewer + security-reviewer + design-system-agent (if configured), infrastructure tasks to code-reviewer + terraform-plan-reviewer (if configured).
- FAIL verdict from any reviewer blocks task completion (exit code 2). Findings are fed back to the implementer, who iterates. WARN findings are documented but do not block. PASS allows completion.
- TeammateIdle hook fires when a teammate has no pending tasks. The `teammate-idle-gate.sh` shim checks for pending tasks matching the idle teammate's role. If found, exit code 2 with task suggestion. If no matching work, exit code 0 (allow idle).

## When to Use / When NOT to Use

**Use this template when:**

- Estimated work exceeds 4 hours of implementation effort
- Changes span 3+ files across 2+ system layers (frontend + backend, backend + tests, etc.)
- Multiple specialists need real-time coordination (e.g., frontend implementer and test writer working on the same component)

**Do NOT use this template when:**

- Single focused task under 30 minutes (use Synthex `next-priority` instead)
- Work is confined to a single domain (frontend-only or backend-only with no cross-cutting concerns)
- Pure refactoring or documentation work with no integration points (use Synthex `next-priority` instead)

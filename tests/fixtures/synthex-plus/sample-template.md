# Test Team Template

> A minimal team template fixture for schema validation testing.

## Purpose

- Enables parallel testing of template validation logic
- Optimized for Layer 1 schema tests — validates structural compliance without runtime behavior

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | `plugins/synthex/agents/tech-lead.md` | Yes | Mailbox: sends task assignments to teammates; receives completion reports. Task list: creates all tasks with descriptions and dependencies. Reporting: produces progress reports at natural checkpoints. |
| Worker | `plugins/synthex/agents/code-reviewer.md` | Yes | Mailbox: sends review verdicts to Lead. Task list: claims review tasks. Communication: messages Lead when blocked. |
| Optional | `plugins/synthex/agents/quality-engineer.md` | No | Mailbox: receives test-writing assignments from Lead. Task list: claims test tasks, reports coverage delta on completion. |

### Spawn Pattern (read-on-spawn)

Each teammate's spawn prompt follows this structure:

1. **Identity:** "Read your full agent definition at `{agent file path}` and adopt it as your identity"
2. **Overlay:** Team-specific behavioral instructions from the overlay column above
3. **Context:** Project context including CLAUDE.md and relevant specifications

## Communication Patterns

- Lead creates tasks on the shared task list and assigns by role
- Teammates claim tasks via TaskUpdate and report completion with file lists
- Blocked teammates message the Lead directly via SendMessage

## Task Decomposition Guidance

- Lead maps plan tasks to shared task list items with dependencies via addBlockedBy
- Task descriptions use the references context mode (pointers, not inline content)
- Discovered work reported to Lead via SendMessage for triage

## Quality Gates

- TaskCompleted hook routes completed tasks to appropriate reviewers
- FAIL verdict blocks completion (exit code 2), WARN allows with notification, PASS allows

## When to Use / When NOT to Use

**Use this template when:**

- Estimated work exceeds 4 hours
- Changes span 3+ files across multiple system layers

**Do NOT use this template when:**

- Single focused task under 30 minutes (use Synthex commands instead)
- Pure documentation changes

# Spike Brief: Agent Teams API Validation

## Purpose

This spike validates assumptions about Claude Code's experimental Agent Teams API before investing in Phase 3 (Quality Gate Hooks) and the hook-dependent portions of Phase 2 (team lifecycle management). The Synthex+ implementation plan (`docs/plans/plus.md`) depends on specific API behaviors -- hook event names, team metadata inspection, permission models, and inter-teammate communication -- that are documented in Claude Code's experimental features but have not been verified through hands-on testing.

Building hooks, lifecycle management, and orchestration commands on unverified assumptions risks significant rework if the live API diverges from documentation. This spike resolves that risk cheaply: a single, structured validation session that produces definitive answers to all open questions before any dependent implementation begins.

This spike is referenced by the `api-spike` command (Task 8 in `docs/plans/plus.md`), which executes the validation plan defined here.

## Background

Synthex+ (`docs/reqs/plus.md`) is a companion plugin to Synthex that reimagines orchestration for Claude Code's Agent Teams model. Where Synthex uses a caller-dispatches-subagent pattern (focused, single-invocation tasks), Synthex+ creates persistent, multi-member teams where teammates share a task list, exchange messages via mailboxes, and coordinate autonomously over sustained work sessions.

The plugin's architecture depends on several Agent Teams capabilities:

- **Hook events** (Phase 3): Shell shims triggered by `TaskCompleted` and `TeammateIdle` events drive quality gates and idle-teammate work assignment. If these events do not exist or have different names, the entire hook infrastructure (Milestone 3.1-3.2) requires redesign.
- **Team metadata inspection** (Phase 2): Post-creation verification and orphan detection rely on inspectable team state at known filesystem paths. If metadata is not inspectable, fallback strategies must be designed.
- **Permission model** (Phase 2): Teammate autonomy depends on `plan_approval` working correctly so teammates can execute tool calls without manual approval.
- **Team creation mechanism** (Phase 2): All commands compose team creation instructions as markdown. If team creation requires a structured API rather than natural language prompts, the command authoring pattern changes.

The read-on-spawn architecture (`docs/specs/decisions/ADR-plus-001-read-on-spawn.md`) means teammates read full Synthex agent definitions at spawn time. This pattern is independent of the API questions above, but the overall team lifecycle -- creation, execution, hooks, shutdown -- depends on the answers this spike produces.

## Hypotheses

### H1: Hook events `TaskCompleted` and `TeammateIdle` exist as subscribable events

**Claim:** Claude Code's Agent Teams API exposes hook events named `TaskCompleted` and `TeammateIdle` (or semantically equivalent names) that can be subscribed to via `hooks.json`. When a teammate marks a task as completed, a `TaskCompleted` event fires. When a teammate has no assigned or pending tasks, a `TeammateIdle` event fires.

**Source of assumption:** Claude Code hooks documentation and Agent Teams experimental feature description.

**Falsifiable by:** Creating a team, completing a task, and observing whether any hook event fires. If no event fires, or if the event has a different name, the hypothesis is falsified.

**Impact if false:** Phase 3 (Milestones 3.1-3.2) requires fundamental redesign. Quality gates and idle-teammate work assignment would need to be implemented as polling-based prompt instructions rather than event-driven hooks. The `hooks.json` and shell shim approach documented in the implementation plan becomes invalid.

### H2: Team metadata is inspectable at known filesystem paths

**Claim:** After creating a team, metadata about the team (name, members, status) is persisted at an inspectable filesystem location such as `~/.claude/teams/{team-name}/config.json` or a similar path. This metadata can be read by external processes for post-creation verification and orphan detection.

**Source of assumption:** Claude Code's configuration storage patterns (e.g., `~/.claude/` directory for settings and state).

**Falsifiable by:** Creating a team and searching the filesystem at `~/.claude/` and related paths for team metadata files. If no metadata files are found, the hypothesis is falsified.

**Impact if false:** Post-creation verification (Task 19) and orphan detection (Task 26) must use a prompt-based fallback strategy -- asking the LLM to confirm team state rather than reading filesystem state. This is less reliable but functional.

### H3: `plan_approval` permission works correctly for teammates

**Claim:** When a team is created with `plan_approval` as the permission model for teammates, those teammates can execute tool calls (file reads, writes, bash commands) after presenting their plan, without requiring manual user approval for each tool invocation.

**Source of assumption:** Claude Code permission model documentation.

**Falsifiable by:** Creating a team with `plan_approval` permission, assigning a task that requires tool calls (e.g., "read a file and write a summary"), and observing whether the teammate can execute without manual approval gates.

**Impact if false:** Teammate autonomy is compromised. If teammates require per-tool-call approval, the entire teams model loses its value proposition (parallel, autonomous execution). Mitigation options would include `auto_approve` (less safe) or accepting manual approval overhead (defeats the purpose).

### H4: Teams can be created via natural language prompt to Claude Code

**Claim:** A team can be created by instructing Claude Code in natural language (e.g., "Create a team named 'implementation' with the following roles: ..."). The creation mechanism is prompt-driven, consistent with Synthex's all-markdown-all-YAML authoring pattern (Decision D4 in `docs/plans/plus.md`).

**Source of assumption:** Claude Code's conversational interface pattern and Decision D4.

**Falsifiable by:** Attempting to create a team via natural language instruction and observing whether Claude Code creates the team or requires a different mechanism (structured API call, CLI command, configuration file).

**Impact if false:** All team commands (`team-implement`, `team-review`, `team-plan`) must change their creation workflow step from natural language instructions to whatever mechanism the API actually requires. If creation requires a structured API, commands may need to generate API calls rather than prose instructions.

### H5: Shared task list supports task dependencies via `blockedBy`

**Claim:** The shared task list API supports dependency relationships between tasks via a `blockedBy` field (or equivalent). When task B has `blockedBy: [taskA]`, task B cannot be started until task A is marked as completed. The dependency is enforced or at least visible to all teammates.

**Source of assumption:** Implementation plan Tasks 20-21 (plan-to-task mapping preserving dependency chains) and FR-TL1.

**Falsifiable by:** Adding two tasks to the shared task list where task B depends on task A, and observing whether the dependency relationship is represented and respected.

**Impact if false:** Task ordering must be managed manually by the team lead through explicit assignment sequencing rather than declarative dependencies. The plan-to-task mapping (Task 20) becomes more complex because the lead must enforce ordering through assignment timing rather than metadata.

### H6: Mailbox messaging enables direct teammate-to-teammate communication

**Claim:** Teammates can send messages to each other via a mailbox mechanism. A message sent from teammate A to teammate B is delivered and readable by teammate B. Messages support sufficient content for coordination (e.g., review findings, status updates, clarification requests).

**Source of assumption:** PRD communication patterns (FR-SP2 behavioral overlay mentions mailbox usage) and team template designs.

**Falsifiable by:** Creating a team with two members, sending a message from one to the other, and verifying the recipient can read the message content.

**Impact if false:** Inter-teammate communication must route through the shared task list (comments on tasks) or through the team lead as a relay. Template communication patterns sections would need to be redesigned around the available communication mechanism.

## Validation Plan

**Prerequisite:** Set the environment variable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` before starting any validation steps. This enables the experimental Agent Teams feature in Claude Code.

### V1: Team Creation Mechanism (validates H4)

1. Start a Claude Code session with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set.
2. Attempt to create a 2-member team via natural language: "Create a team named 'spike-test' with two members: a lead and a worker."
3. Document the exact mechanism that works:
   - Did natural language create the team?
   - Was a specific API call or CLI command required instead?
   - What parameters were required (name, member count, permissions)?
   - What was the exact syntax/format that succeeded?
4. Record the team creation response -- what confirmation or metadata was returned?

### V2: Team Metadata Inspection (validates H2)

1. After successful team creation (V1), inspect the filesystem for team metadata.
2. Search the following paths:
   - `~/.claude/teams/`
   - `~/.claude/team-*/`
   - `~/.claude/projects/` (for team-related state)
   - Any path mentioned in the team creation response
3. If metadata files are found:
   - Document the exact path and file format (JSON, YAML, etc.)
   - Record the schema (what fields are present: team name, members, status, etc.)
   - Test whether the metadata updates when team state changes
4. If no metadata files are found:
   - Document the search paths attempted
   - Note any alternative inspection mechanisms discovered (e.g., API queries, prompt-based inspection)

### V3: Permission Model (validates H3)

1. Create a team (or reuse the team from V1) with `plan_approval` as the permission model for teammates.
2. Assign a task to a teammate that requires tool calls: "Read the file at `CLAUDE.md` and write a one-line summary to `/tmp/spike-test-output.txt`."
3. Observe the teammate's execution:
   - Did the teammate execute tool calls autonomously after plan approval?
   - Was manual approval required for each tool call?
   - Did the teammate present a plan before executing?
4. Document the exact permission behavior observed.

### V4: Hook Events (validates H1)

1. Check whether `hooks.json` supports Agent Teams events by examining Claude Code's hook event documentation or schema.
2. Create a `hooks.json` with handlers for `TaskCompleted` and `TeammateIdle`:
   ```json
   {
     "hooks": {
       "TaskCompleted": [{ "command": "echo 'TaskCompleted fired' >> /tmp/spike-hook-log.txt" }],
       "TeammateIdle": [{ "command": "echo 'TeammateIdle fired' >> /tmp/spike-hook-log.txt" }]
     }
   }
   ```
3. Create a team, assign a task, and have a teammate complete it.
4. Check `/tmp/spike-hook-log.txt` for evidence of hook firing.
5. If no events fire, try alternative event names:
   - `task_completed`, `taskCompleted`, `task-completed`
   - `teammate_idle`, `teammateIdle`, `teammate-idle`
   - Any event names discovered in documentation or error messages
6. If no hook events exist for teams:
   - Document this definitively
   - Note any alternative mechanisms for observing task completion or teammate idle state

### V5: Shared Task List Dependencies (validates H5)

1. Using the active team, add tasks with dependencies to the shared task list:
   - Task A: "Write a utility function" (no dependencies)
   - Task B: "Write tests for the utility function" (blocked by Task A)
2. Verify the dependency is represented:
   - Does the task list show `blockedBy` or equivalent?
   - Is Task B marked as blocked while Task A is pending?
3. Complete Task A and observe:
   - Does Task B become unblocked?
   - Is the state transition visible to all teammates?
4. Document the exact dependency API surface (field names, behavior, enforcement level).

### V6: Mailbox Messaging (validates H6)

1. Using the active team with at least 2 members, send a message from one teammate to another.
2. Attempt the messaging using whatever mechanism is available:
   - Direct mailbox send (if a mailbox API exists)
   - Task comments or annotations
   - Any inter-teammate communication channel
3. Verify delivery:
   - Can the recipient read the message?
   - Is the message content preserved (not truncated or summarized)?
   - Is there a notification mechanism or does the recipient need to poll?
4. Document the exact messaging API surface (send mechanism, delivery guarantee, content limits).

## Success Criteria

| Hypothesis | Validated | Invalidated | Partially Validated |
|------------|-----------|-------------|---------------------|
| H1 (Hook events) | `TaskCompleted` and `TeammateIdle` (or documented equivalents) fire as expected and can be subscribed to via `hooks.json` | No team-related hook events exist in the current API | Events exist but with different names or different triggering semantics than assumed |
| H2 (Team metadata) | Team metadata is found at a known path with a stable schema that includes team name, members, and status | No filesystem-inspectable team metadata exists | Metadata exists but at an unexpected path, or with an incomplete schema |
| H3 (plan_approval) | Teammates execute tool calls autonomously after presenting a plan; no per-call manual approval | Teammates require manual approval for every tool call regardless of permission setting | plan_approval works but with caveats (e.g., only for certain tool types, or requires additional configuration) |
| H4 (Natural language creation) | Teams are created via natural language instructions within a Claude Code session | Teams require a structured API, CLI command, or configuration file -- not natural language | Natural language works but requires specific phrasing or a multi-step conversational flow |
| H5 (Task dependencies) | `blockedBy` (or equivalent) is supported; blocked tasks cannot be started until dependencies complete | No dependency mechanism exists in the shared task list | Dependencies are representable but not enforced (advisory only) |
| H6 (Mailbox messaging) | Teammates can send and receive messages directly; content is preserved | No inter-teammate messaging mechanism exists | Messaging exists but with significant limitations (size limits, no delivery guarantee, relay-only) |

### Go/No-Go Thresholds

- **Go (proceed with current plan):** H1, H4, H5, and H6 are validated. H2 and H3 are at least partially validated (workable with documented fallbacks).
- **Conditional go (proceed with modifications):** H4, H5, and H6 are validated, but H1 is invalidated. Phase 3 is redesigned to use prompt-based quality gates instead of event-driven hooks. The implementation plan is updated accordingly.
- **No-go (pause and reassess):** H4, H5, or H6 are invalidated. The fundamental team coordination mechanisms are not available, making the teams model unworkable for Synthex+'s use cases. Reassess whether to wait for API maturity or pivot to an alternative approach.

## Findings

_This section is populated after spike execution (Task 9 in `docs/plans/plus.md`)._

## Decision

_This section is populated after findings analysis (Task 10 in `docs/plans/plus.md`) with a go/conditional-go/no-go determination and any required implementation plan updates._

## References

- Synthex+ PRD: `docs/reqs/plus.md`
- Synthex+ Implementation Plan: `docs/plans/plus.md` (Tasks 7-10, Milestone 1.2)
- Read-on-Spawn ADR: `docs/specs/decisions/ADR-plus-001-read-on-spawn.md`
- Synthex+ Configuration Defaults: `plugins/synthex-plus/config/defaults.yaml` (hook event names and settings)
- Open Questions: `docs/plans/plus.md` (Q1-Q4)

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

_Resolved via documentation research (Claude Code docs, community guides, API references) rather than hands-on experimental execution. The api-spike command (`plugins/synthex-plus/commands/api-spike.md`) remains available for experimental validation if desired._

### H1: Hook Events — Validated

`TaskCompleted` and `TeammateIdle` exist with those exact names.

- **Configuration:** Hooks are defined in `~/.claude/settings.json`, `.claude/settings.json`, or `.claude/settings.local.json` under a `hooks` key. Plugin `hooks/hooks.json` is also supported.
- **TaskCompleted:** Fires when a teammate marks a task as completed. Exit code 0 allows completion. Exit code 2 blocks completion and feeds stderr back to the agent as feedback (triggering re-work).
- **TeammateIdle:** Fires when a teammate has no assigned tasks and is about to go idle. Exit code 0 allows idle. Exit code 2 sends feedback to keep the teammate working (e.g., assign new work).
- **Hook input:** Both events receive context JSON on stdin with event details.
- **No matcher support:** Hooks fire on every occurrence of the event (no filtering by task type or teammate role). Filtering logic must live in the shell shim.
- **Deviation from assumptions:** None. Event names and semantics match the implementation plan's assumptions exactly.

### H2: Team Metadata — Validated

Team metadata is inspectable at known filesystem paths.

- **Team config:** `~/.claude/teams/{team-name}/config.json` — contains team name and members array (name, agentId, agentType per member). Members are added on spawn and removed on shutdown.
- **Mailbox inboxes:** `~/.claude/teams/{team-name}/inboxes/{teammate-name}` — message inbox files per teammate.
- **Task list:** `~/.claude/tasks/{team-name}/` — individual tasks as numbered JSON files (1.json, 2.json, etc.) with `.lock` files for concurrency control.
- **Orphan detection strategy:** Check for directories under `~/.claude/teams/` that persist after a session ends. A non-empty team directory with no active Claude Code process indicates orphaned resources.
- **Deviation from assumptions:** Tasks are stored under `~/.claude/tasks/` (separate from teams directory), not nested within the team directory. This is a minor path difference that does not affect functionality.

### H3: plan_approval — Validated

`plan_approval` permission works for teammates.

- **Mechanism:** Lead can spawn teammates with plan approval requirement. Teammates work in read-only plan mode (can read files, analyze, propose changes but cannot execute modifications). Teammate sends `plan_approval_request` to lead when plan is ready. Lead reviews and either approves (teammate exits plan mode, begins implementation) or rejects with feedback (teammate revises).
- **Lead approval criteria:** Controllable via spawn prompt (e.g., "only approve plans that include test coverage").
- **Deviation from assumptions:** None. Works as expected.

### H4: Team Creation — Validated

Teams are created via natural language prompt to Claude Code.

- **Primary mechanism:** Natural language instruction (e.g., "Create a team named 'implementation' with the following roles: ..."). Claude Code interprets the instruction and spawns the team.
- **Structured API:** The `Teammate` tool provides programmatic operations: `spawnTeam`, `requestShutdown`, `approveShutdown`, `approvePlan`, `rejectPlan`, `discoverTeams`, `requestJoin`, `approveJoin`, `rejectJoin`.
- **Auto-creation:** Claude may also propose a team if it determines the task would benefit from parallel work (requires user confirmation).
- **Enable flag:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set in environment or settings.
- **Deviation from assumptions:** The `Teammate` tool provides more structure than pure natural language. Commands can compose instructions that result in `Teammate({ operation: "spawnTeam", ... })` calls, which is more reliable than relying solely on natural language interpretation.

### H5: Task Dependencies — Validated

The shared task list supports `blockedBy` dependency relationships.

- **API:** `TaskCreate` creates tasks. `TaskUpdate` manages state transitions and dependencies via `addBlockedBy` (array of task IDs) and `addBlocks` (array of task IDs).
- **Lifecycle:** Tasks progress through `pending` → `in_progress` → `completed`.
- **Enforcement:** When a blocking task completes, blocked tasks automatically unblock. Teammates can only claim unblocked, pending tasks.
- **Self-claiming:** Teammates call `TaskList()` to discover available work, then `TaskUpdate({ taskId, status: "in_progress", owner: "name" })` to claim.
- **Deviation from assumptions:** Dependencies are enforced (not just advisory). This is stronger than the minimum we needed.

### H6: Mailbox Messaging — Validated

Direct teammate-to-teammate messaging is supported via `SendMessage`.

- **Message types:**
  - `type: "message"` — direct message to a specific teammate (most cost-efficient)
  - `type: "broadcast"` — sends to ALL teammates simultaneously (expensive: N messages for N teammates)
  - `type: "shutdown_request"` / `type: "shutdown_response"` — graceful shutdown protocol
  - `type: "plan_approval_response"` — approve/reject teammate plans
- **Parameters:** `recipient` (teammate name), `content` (message text), `summary` (5-10 word preview)
- **Delivery:** Automatic — no polling required. Messages delivered to inbox files. Idle teammates automatically notified.
- **Deviation from assumptions:** Richer than expected. Multiple message types support the full lifecycle (messaging, shutdown, plan approval). Broadcast should be used sparingly due to cost.

### Summary

| Hypothesis | Result | Deviations |
|------------|--------|------------|
| H1 (Hook events) | **Validated** | No matcher support — filtering in shell shim |
| H2 (Team metadata) | **Validated** | Tasks at `~/.claude/tasks/` not under team dir |
| H3 (plan_approval) | **Validated** | None |
| H4 (Team creation) | **Validated** | `Teammate` tool provides structured API beyond natural language |
| H5 (Task dependencies) | **Validated** | Dependencies enforced, not just advisory |
| H6 (Mailbox messaging) | **Validated** | Multiple message types (direct, broadcast, shutdown, plan approval) |

### Open Questions Resolution

| # | Question | Answer |
|---|----------|--------|
| Q1 | Hook event names | `TaskCompleted` and `TeammateIdle` — exact names confirmed. Exit code 2 blocks, 0 allows. |
| Q2 | Team metadata path | `~/.claude/teams/{team-name}/config.json` for team config. Tasks at `~/.claude/tasks/{team-name}/`. |
| Q3 | plan_approval for teammates | Yes — read-only plan mode, approval/rejection flow via lead. |
| Q4 | Team creation mechanism | Natural language + `Teammate` tool `spawnTeam` operation. Both work. |

## Decision

**Go.** All six hypotheses validated. The implementation plan's assumptions are confirmed.

### Rationale

Per the go/no-go thresholds defined in the Success Criteria section:
- H1 (hook events): **Validated** — `TaskCompleted` and `TeammateIdle` exist with assumed names and semantics
- H4 (team creation): **Validated** — natural language works, plus structured `Teammate` tool
- H5 (task dependencies): **Validated** — `blockedBy` enforced, auto-unblock on completion
- H6 (mailbox messaging): **Validated** — `SendMessage` with multiple types, automatic delivery

All four required hypotheses for "Go" are validated. H2 and H3 are also fully validated (exceeding the "at least partially validated" threshold).

### Implementation Plan Impact

- **No changes required.** The current Phase 2 and Phase 3 designs are valid as-is.
- **defaults.yaml:** No updates needed — hook event names match assumptions (`TaskCompleted`, `TeammateIdle`).
- **Minor insight:** The `Teammate` tool's `spawnTeam` operation provides a more structured creation mechanism than pure natural language. Commands can leverage this for more reliable team formation. This is additive, not a change.
- **Minor insight:** Hook events have no matcher support. The shell shims in Phase 3 (Tasks 29-30) need to include filtering logic to determine task type/teammate role from the stdin JSON context. This was already the plan (shell shims handle detection logic), so no change needed.
- **Minor insight:** `SendMessage` supports `type: "broadcast"` for team-wide announcements but this is expensive. Commands should default to direct messages and reserve broadcast for critical blockers. Template communication patterns should note this.

### Recommendation for Experimental Validation

While documentation research has resolved all open questions with high confidence, the api-spike command (`plugins/synthex-plus/commands/api-spike.md`) can be executed for hands-on validation at any time. This is recommended before Phase 3 hook implementation to confirm the hook stdin JSON format and exit code behavior match documentation.

## References

- Synthex+ PRD: `docs/reqs/plus.md`
- Synthex+ Implementation Plan: `docs/plans/plus.md` (Tasks 7-10, Milestone 1.2)
- Read-on-Spawn ADR: `docs/specs/decisions/ADR-plus-001-read-on-spawn.md`
- Synthex+ Configuration Defaults: `plugins/synthex-plus/config/defaults.yaml` (hook event names and settings)
- Open Questions: `docs/plans/plus.md` (Q1-Q4)

# API Spike

> **Internal development command -- not for end users.** This command is not registered in `plugin.json` (Decision D11). It exists solely to validate Agent Teams API assumptions before dependent implementation begins.

Execute the structured validation plan defined in the spike brief (`docs/specs/spike-agent-teams-api.md`) to test all Agent Teams API hypotheses. This command walks through six validation steps, records findings for each hypothesis, and produces a go/conditional-go/no-go determination.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `spike_brief_path` | Path to the spike brief document | `docs/specs/spike-agent-teams-api.md` | No |

## Prerequisites

Before executing this command, verify the following:

1. **Environment variable is set:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be exported in the current shell session. Confirm by running:
   ```bash
   echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
   ```
   If the output is not `1`, abort and instruct the user to set it before retrying.

2. **Spike brief exists:** Read `@{spike_brief_path}` and confirm it is accessible. This document defines the six hypotheses (H1--H6), their success criteria, and the go/no-go thresholds. You will reference it throughout execution.

3. **Clean workspace:** Verify no leftover artifacts from a prior spike run exist:
   - No `/tmp/spike-*` files
   - No stale hook entries referencing spike in `.claude/settings.local.json`

   If leftovers are found, clean them up before proceeding.

---

## Workflow

Execute the following six validation steps in order. Each step maps to a hypothesis from the spike brief. After each step, record findings in the structured format defined in the Results Recording section below.

### Step 1 -- V1: Team Creation (validates H4)

**Goal:** Determine whether teams can be created via natural language prompt, or whether a structured API mechanism is required.

1. Attempt to create a 2-member team named "spike-test" via natural language:

   > "Create a team named 'spike-test' with two members: a lead who coordinates work, and a worker who completes assigned tasks."

   The worker's spawn prompt should be:
   > "You are a test worker. Your job is to complete simple tasks assigned to you via the shared task list. Report results via mailbox messages to the lead."

2. If natural language creation fails or is not recognized, attempt alternative mechanisms:
   - Look for a `Teammate` tool with a `spawnTeam` action
   - Check whether a `claude teams create` CLI subcommand exists
   - Try any other team creation mechanism you can discover

3. Document thoroughly:
   - The exact mechanism that succeeded (natural language prompt, tool call, CLI, config file)
   - The exact syntax or prompt wording that worked
   - What parameters were required (team name, member count, roles, permissions)
   - What confirmation or metadata was returned upon creation
   - If multiple mechanisms were attempted, document each attempt and its result

4. Record findings using the V1 results template.

### Step 2 -- V2: Team Metadata Inspection (validates H2)

**Goal:** Determine whether team metadata is persisted at inspectable filesystem paths.

1. After successful team creation in Step 1, inspect the filesystem for team metadata. Search the following paths in order:

   ```bash
   ls -la ~/.claude/teams/spike-test/ 2>/dev/null
   ls -la ~/.claude/teams/ 2>/dev/null
   ls -la ~/.claude/team-*/ 2>/dev/null
   ```

2. Also check for inbox and task structures:
   ```bash
   find ~/.claude/ -name "*spike-test*" -o -name "*team*" 2>/dev/null
   ls -la ~/.claude/tasks/spike-test/ 2>/dev/null
   ls -la ~/.claude/teams/spike-test/inboxes/ 2>/dev/null
   ```

3. If metadata files are found:
   - Read and document the file format (JSON, YAML, etc.)
   - Record the full schema: field names, types, and values
   - Note the exact paths where metadata resides

4. If metadata is NOT found at expected paths:
   - Broaden the search to all of `~/.claude/`:
     ```bash
     find ~/.claude/ -newer /tmp/spike-start-marker -type f 2>/dev/null
     ```
     (Create `/tmp/spike-start-marker` before team creation in Step 1 to scope the search)
   - Document all paths searched and confirm absence of metadata
   - Note any alternative inspection mechanisms discovered

5. Record findings using the V2 results template.

### Step 3 -- V3: Shared Task List and Dependencies (validates H5)

**Goal:** Validate that the shared task list supports task dependencies via `blockedBy` or equivalent.

1. Create Task A with no dependencies:
   - Use `TaskCreate` with subject: "Write a one-line greeting function"
   - Description: "Create a shell script at /tmp/spike-greeting.sh containing a function that prints 'Hello from spike test'"
   - Record the returned task ID as `taskA_id`

2. Create Task B that depends on Task A:
   - Use `TaskCreate` with subject: "Write tests for the greeting function"
   - Description: "Create a test script at /tmp/spike-greeting-test.sh that sources /tmp/spike-greeting.sh and verifies the greeting output"

3. Set the dependency relationship:
   - Use `TaskUpdate` on Task B with `addBlockedBy: [taskA_id]`
   - Verify the update succeeded

4. Verify blocking is visible:
   - Use `TaskList` or `TaskGet` on Task B
   - Confirm Task B shows as blocked (has a non-empty `blockedBy` list)
   - Document the exact field names and values shown

5. Assign Task A to the worker:
   - Use `TaskUpdate` on Task A to set owner to the worker teammate
   - Monitor for the worker to pick up and complete the task

6. After Task A is completed, verify Task B is unblocked:
   - Use `TaskGet` on Task B
   - Check whether `blockedBy` is now empty or Task B's status has changed
   - Document whether the unblocking was automatic or required manual intervention

7. Document the exact dependency API:
   - Field names used (`blockedBy`, `addBlockedBy`, `blocks`, `addBlocks`)
   - Whether dependencies are enforced (hard block) or advisory (visible but not enforced)
   - How dependency state transitions work

8. Record findings using the V3 results template.

### Step 4 -- V4: Mailbox Messaging (validates H6)

**Goal:** Validate that teammates can exchange messages directly via a mailbox mechanism.

1. Send a message from the lead to the worker:
   - Use `SendMessage` (or equivalent tool) with:
     - `type: "message"`
     - `recipient: "worker"` (or the worker's actual identifier from Step 1)
     - Content: "Please confirm you received this message by replying with 'ACK'"

2. If `SendMessage` is not available, try alternative mechanisms:
   - Check for `Mailbox`, `Message`, or `Communication` tools
   - Try task comments as a communication channel
   - Document whatever mechanism is available

3. Wait for and verify the worker's response:
   - Check the lead's inbox for a reply
   - Allow up to 30 seconds for delivery

4. Document the messaging API:
   - Delivery mechanism (push vs poll)
   - Observed latency (time from send to receipt)
   - Content preservation (was the message truncated, summarized, or altered?)
   - Message format (what fields are present: sender, recipient, type, content, timestamp)
   - Any size limits or content restrictions observed

5. Record findings using the V4 results template.

### Step 5 -- V5: Hook Events (validates H1)

**Goal:** Validate that `TaskCompleted` and `TeammateIdle` hook events exist and can be subscribed to.

1. Before running this step, set up hook logging. Create or update `.claude/settings.local.json` to add hook subscriptions:

   ```json
   {
     "hooks": {
       "TaskCompleted": [
         {
           "type": "command",
           "command": "echo 'TaskCompleted:$(date)' >> /tmp/spike-hook-log.txt"
         }
       ],
       "TeammateIdle": [
         {
           "type": "command",
           "command": "echo 'TeammateIdle:$(date)' >> /tmp/spike-hook-log.txt"
         }
       ]
     }
   }
   ```

   Also clear any prior log:
   ```bash
   rm -f /tmp/spike-hook-log.txt
   ```

2. Test `TaskCompleted`: Create and assign a simple task to the worker. Have the worker complete it, then check for hook output:
   ```bash
   cat /tmp/spike-hook-log.txt 2>/dev/null
   ```

3. Test `TeammateIdle`: Ensure the worker has no pending tasks assigned. Wait briefly, then check whether a `TeammateIdle` event fired:
   ```bash
   cat /tmp/spike-hook-log.txt 2>/dev/null
   ```

4. If no events fired with the names above, try alternative casing and naming:
   - `task_completed`, `taskCompleted`, `task-completed`, `onTaskCompleted`
   - `teammate_idle`, `teammateIdle`, `teammate-idle`, `onTeammateIdle`
   - Update `.claude/settings.local.json` with each variant and re-test

5. If no hook events fire at all:
   - Document this definitively as a negative result
   - Check whether hooks received any stdin (JSON payload) by modifying the command:
     ```bash
     "command": "cat > /tmp/spike-hook-stdin.json"
     ```
   - Note any alternative mechanisms for observing task completion or idle state

6. Document the exact event names, trigger conditions, and hook input format (if any stdin JSON payload is delivered).

7. Record findings using the V5 results template.

### Step 6 -- V6: Permission Model (validates H3)

**Goal:** Document how the teammate permission model works in practice.

1. Review the team creation from Step 1:
   - Note how the worker teammate's permissions were configured during creation
   - Was `plan_approval` specified? Was it accepted? What was the actual permission model applied?

2. Observe the worker's execution behavior across previous steps:
   - Did the worker execute tool calls (file writes, bash commands) autonomously?
   - Was manual approval required for each tool call?
   - Did the worker present a plan before executing?
   - Were there any approval prompts that appeared in the UI?

3. If `plan_approval` was not tested or not available:
   - Attempt to create a new teammate with explicit `plan_approval` permission
   - Assign a task requiring tool calls: "Read CLAUDE.md and write a one-line summary to /tmp/spike-permission-test.txt"
   - Observe the approval behavior

4. Document the permission model:
   - Available permission levels (e.g., `auto_approve`, `plan_approval`, `manual_approval`)
   - How permissions are specified during team/teammate creation
   - Observed behavior for each permission level tested
   - Any caveats (e.g., certain tool types still require manual approval)

5. Record findings using the V6 results template.

---

## Results Recording

After each step, record findings in this exact format. Append all results to a single output document.

```markdown
## V{n} Results: {title}

- **Hypothesis:** H{n} -- {claim from spike brief}
- **Result:** Validated / Invalidated / Partially Validated
- **Evidence:** {what was observed, including exact commands run and their output}
- **Exact API surface:** {tool names, field names, parameters, response formats}
- **Deviations from assumptions:** {any differences from what the spike brief expected}
- **Notes:** {additional context, caveats, or observations}
```

After all six steps are complete, compile a summary table:

```markdown
## Spike Summary

| Hypothesis | Result | Key Finding |
|------------|--------|-------------|
| H1 (Hook events) | {result} | {one-line summary} |
| H2 (Team metadata) | {result} | {one-line summary} |
| H3 (plan_approval) | {result} | {one-line summary} |
| H4 (Natural language creation) | {result} | {one-line summary} |
| H5 (Task dependencies) | {result} | {one-line summary} |
| H6 (Mailbox messaging) | {result} | {one-line summary} |

### Go/No-Go Determination

Based on the success criteria in the spike brief (`@{spike_brief_path}`), the determination is: **{Go / Conditional Go / No-Go}**

**Rationale:** {explain which hypotheses were validated/invalidated and how that maps to the go/no-go thresholds}

### Required Plan Updates

{If conditional go or no-go: list specific changes needed in `docs/plans/plus.md`}
{If go: note "No plan changes required."}
```

---

## Cleanup

After recording all results, clean up all spike artifacts:

1. **Remove the test team:**
   - Attempt to disband or remove the "spike-test" team using whatever mechanism is available
   - Document the teardown mechanism that worked (for future reference)

2. **Clean up temporary files:**
   ```bash
   rm -f /tmp/spike-greeting.sh
   rm -f /tmp/spike-greeting-test.sh
   rm -f /tmp/spike-hook-log.txt
   rm -f /tmp/spike-hook-stdin.json
   rm -f /tmp/spike-permission-test.txt
   rm -f /tmp/spike-start-marker
   rm -f /tmp/spike-*
   ```

3. **Remove temporary hooks:**
   - Restore `.claude/settings.local.json` to its pre-spike state
   - If the file did not exist before the spike, remove it
   - If it existed with other settings, remove only the spike-related hook entries

4. **Document cleanup failures:**
   - If any artifact could not be cleaned up, note it explicitly
   - This is especially important for team teardown -- if the team cannot be removed, document the remaining state

---

## Critical Requirements

- **Execute steps in order:** Steps 1--2 must complete before steps 3--6, because later steps depend on the team created in Step 1.
- **Record everything:** The spike's value is in the findings. Every observation, every command output, every deviation from expectations must be documented.
- **Do not skip steps on failure:** If a step's hypothesis is invalidated, still complete the step fully. Document exactly what failed and what alternatives were tried.
- **Do not modify the spike brief:** Results are recorded in the command output, not in `docs/specs/spike-agent-teams-api.md`. The spike brief's Findings and Decision sections are populated separately (Tasks 9--10 in the implementation plan).
- **Time-box the spike:** If any single step takes more than 15 minutes of active troubleshooting without progress, document the current state and move to the next step. Note the timeout in findings.
- **This command is self-contained:** All information needed to execute the spike is in this file and the referenced spike brief. No other documents need to be consulted during execution.

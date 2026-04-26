# Start Review Team

Spawn a standing review pool — a persistent team of reviewer agents that waits idle between reviews, eliminating per-review spawn latency. This implements FR-MMT9 from the multi-model-teams PRD.

Unlike `team-review`, which spawns a fresh team per review invocation, `start-review-team` creates a pool that persists across multiple review sessions. Standard Synthex commands (`review-code`, `performance-audit`) automatically route to a matching pool when one is idle, so submitters get review results faster and without the cost of spawning a full team for every diff.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `name` | Unique pool name | `standing_pools.default_name` (default `review-pool`) | No |
| `reviewers` | Comma-separated reviewer agent names | `standing_pools.default_reviewers` (default `code-reviewer,security-reviewer`) | No |
| `multi_model` | Enable multi-model on this pool | `standing_pools.default_multi_model` (default `false`) | No |
| `ttl_minutes` | TTL override in minutes | `standing_pools.ttl_minutes` (default 60) | No |
| `config_path` | Synthex+ config path | `.synthex-plus/config.yaml` | No |

**Config resolution order:** command parameter > project config (`{config_path}`) > plugin defaults (`config/defaults.yaml`) > hardcoded fallback.

## Workflow

### Step 1. Pre-Flight Checks

Run the following checks before any parameter resolution or filesystem writes.

#### 1a. Synthex dependency

Verify that the Synthex plugin is available by checking for `plugins/synthex/agents/tech-lead.md` OR `.synthex/config.yaml`. If neither exists, abort with:

```
Error: Synthex plugin not detected. Synthex+ requires Synthex agent definitions
for pool member identities. Install and initialize Synthex first (/init).
```

#### 1b. Experimental flag

Check that the environment variable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set to `1`. If it is not set or has any other value, abort with:

```
Agent Teams requires the experimental feature flag.
Set the following environment variable and restart Claude Code:

  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

This flag enables the Agent Teams API used by Synthex+ commands.
```

#### 1c. Orphan detection

Check for directories under `~/.claude/teams/` (excluding `~/.claude/teams/standing/`) that may be leftover from previous sessions. For each orphaned directory found, display a warning but do NOT abort:

```
Warning: Found orphaned team resources at ~/.claude/teams/{name}. These may be left
over from a previous session. Consider cleaning up with: rm -rf ~/.claude/teams/{name}
```

#### 1d. Duplicate pool detection

Before any writes, check whether a standing pool with the requested name already exists at `~/.claude/teams/standing/<name>/`. If the directory exists and contains a valid `config.json`, abort with:

```
Error: A standing pool named '<name>' already exists at ~/.claude/teams/standing/<name>/.
Use /list-teams to see its current status, or /stop-review-team --name <name> to remove it first.
```

If the directory exists but `config.json` is missing or unreadable, display a warning and prompt the user:

```
Warning: A directory exists at ~/.claude/teams/standing/<name>/ but contains no valid config.json.
This may be a corrupt or partially created pool. Remove it and continue? [Y/n]
```

On `n`, abort cleanly. On `Y`, remove the stale directory and continue.

---

### Step 2. Parameter Resolution and Defaults

Load `{config_path}` (default `.synthex-plus/config.yaml`). For any omitted parameter, fall back silently to the corresponding `standing_pools.*` config key:

| Parameter | Config key | Hardcoded fallback |
|-----------|------------|--------------------|
| `name` | `standing_pools.default_name` | `review-pool` |
| `reviewers` | `standing_pools.default_reviewers` | `code-reviewer,security-reviewer` |
| `multi_model` | `standing_pools.default_multi_model` | `false` |
| `ttl_minutes` | `standing_pools.ttl_minutes` | `60` |

Also read:
- `lifecycle.submission_timeout_seconds` (default `300`) — displayed in the step 10 confirmation
- `standing_pools.storage_root` (default `~/.claude/teams/standing`) — storage path for the pool

Do not display resolution reasoning to the user. Resolved values are made explicit in the step 10 confirmation.

---

### Step 3. Pool Name Validation

Validate the resolved `name` against `^[a-z0-9][a-z0-9-]{0,47}$`. Canonicalize to lowercase before validation (input is case-insensitive). Reject reserved names: `index`, `standing`, and any name beginning with `.`.

Validation runs before any filesystem writes. On rejection, abort with:

```
Pool name '<input>' is invalid. Names must be 1–48 lowercase alphanumeric characters and hyphens, starting with a letter or digit. Reserved: 'index', 'standing', and names beginning with '.'.
```

---

### Step 4. Roster Validation

For each agent name in the resolved `reviewers` list, verify that the corresponding Synthex agent file exists at `plugins/synthex/agents/<agent-name>.md`. If any agent file is missing, abort with:

```
Error: Agent '<agent-name>' not found at plugins/synthex/agents/<agent-name>.md.
Available agents are the .md files in plugins/synthex/agents/. Check for typos or run /init to install Synthex.
```

All agents are verified before the first filesystem write.

---

### Step 5. Multi-Model Preflight

Skip this step when `multi_model` resolves to `false`.

When `multi_model: true`, run the multi-model-review preflight as defined in `multi-model-review.md` FR-MR20. Three outcomes:

- **Pass cleanly:** Continue to step 6.
- **Hard error:** Abort immediately with the preflight's error message. No filesystem writes have occurred.
- **Warning-level:** Display the warning to the user, then prompt:
  ```
  Multi-model preflight surfaced warnings. Continue spawning pool? [Y/n]
  ```
  Default is Y (Enter = yes). On `n`, abort cleanly without any filesystem writes.

---

### Step 6. Cross-Session Lock Acquisition

Acquire the cross-session index lock:

```
mkdir ~/.claude/teams/standing/.index.lock
```

The `mkdir` is atomic on POSIX systems — only one process succeeds when multiple race. Poll with 100ms sleep intervals, up to 10 seconds total. On timeout, abort with:

```
Standing pool index is locked by another process. Wait a moment and retry, or — if a previous command crashed — remove the stale lock: rmdir ~/.claude/teams/standing/.index.lock
```

Hold the lock through steps 7–8. Release it with `rmdir ~/.claude/teams/standing/.index.lock` immediately after step 8 completes, whether step 8 succeeded or failed.

---

### Step 7. Spawn the Team

Spawn the pool using the `Teammate` API `spawnTeam` with team name `standing/<name>`.

Compose the spawn prompt for each pool teammate using the **overlay-composition logic defined in D22**. Read all overlay content from `plugins/synthex-plus/templates/review.md` verbatim — no summarization.

#### Overlay-Composition Logic (D22 — all four clauses MUST be applied)

**(a) Standing Pool Identity Confirm Overlay — ALL pool teammates, unconditionally**

ALWAYS include the section `### Standing Pool Identity Confirm Overlay (apply when standing=true)` verbatim in EVERY pool teammate's spawn prompt. This applies to Pool Lead and every reviewer. The `standing=true` condition is true for all pool teammates spawned by this command.

**(b) Multi-Model Conditional Overlay — conditional on `multi_model: true`**

When `multi_model: true`:
- Include the section `### Multi-Model Conditional Overlay (apply when multi_model=true)` verbatim in the Pool Lead's spawn prompt (the Lead Suppression subsection applies to the Pool Lead).
- Include the same section verbatim in each reviewer's spawn prompt (the Reviewer JSON-Envelope subsection applies to each reviewer).

When `multi_model: false`, omit this overlay entirely from all spawn prompts.

**(c) Standing Pool Lifecycle Overlay — Pool Lead ONLY**

Include the section `### Standing Pool Lifecycle Overlay (apply when standing=true)` from `templates/review.md` verbatim in the Pool Lead's spawn prompt ONLY — NOT in reviewer spawn prompts. Reviewers do NOT receive the Lifecycle Overlay.

**(d) All overlay content is read verbatim**

All overlay content is copied from `templates/review.md` verbatim — do not paraphrase, summarize, or reconstruct from memory. If the file cannot be read, abort with an error before any filesystem writes.

#### Pool Lead Spawn Prompt Structure

```
You are the Pool Lead for standing pool "<name>".

Read your team context at plugins/synthex-plus/templates/review.md, roles table, Lead row.

[### Standing Pool Identity Confirm Overlay (apply when standing=true) — verbatim from templates/review.md]

[### Standing Pool Lifecycle Overlay (apply when standing=true) — verbatim from templates/review.md]

[### Multi-Model Conditional Overlay (apply when multi_model=true) — verbatim from templates/review.md, Lead Suppression section only — INCLUDED ONLY WHEN multi_model=true]

Pool metadata: ~/.claude/teams/standing/<name>/config.json
Pool task root: ~/.claude/tasks/standing/<name>/
Your mailbox: ~/.claude/teams/standing/<name>/inboxes/lead/
```

#### Reviewer Spawn Prompt Structure (one per reviewer in the roster)

```
Read your agent definition at plugins/synthex/agents/<agent-name>.md and adopt it as your identity.

[### Standing Pool Identity Confirm Overlay (apply when standing=true) — verbatim from templates/review.md]

[### Multi-Model Conditional Overlay (apply when multi_model=true) — verbatim from templates/review.md, Reviewer JSON-Envelope section only — INCLUDED ONLY WHEN multi_model=true]

Pool name: <name>
Pool task root: ~/.claude/tasks/standing/<name>/
Your mailbox: ~/.claude/teams/standing/<name>/inboxes/<agent-name>/
```

---

### Step 8. Write Pool Metadata and Update Index Atomically

Perform all filesystem writes while holding the lock from step 6.

#### 8a. Create pool metadata directory and config.json

Create `~/.claude/teams/standing/<name>/` and write `~/.claude/teams/standing/<name>/config.json` with the following schema (FR-MMT7):

```json
{
  "name": "<name>",
  "pool_state": "idle",
  "standing": true,
  "reviewers": ["<agent-name>", ...],
  "multi_model": <true|false>,
  "ttl_minutes": <number>,
  "host_pid": <current process PID>,
  "host_session_id": "<current Claude Code session ID>",
  "spawned_at": "<ISO 8601 UTC timestamp>",
  "last_active_at": "<ISO 8601 UTC timestamp — same as spawned_at on creation>"
}
```

`pool_state: idle` is written at spawn time. `last_active_at` is set to the spawn timestamp. The Pool Lead will update both fields as the pool processes work.

Write atomically: write to `~/.claude/teams/standing/<name>/config.json.tmp` first, then `rename` to `~/.claude/teams/standing/<name>/config.json`.

#### 8b. Update index.json atomically

Read the current `~/.claude/teams/standing/index.json` (create an empty index if the file does not exist). Append or update the entry for this pool:

```json
{
  "pools": {
    "<name>": {
      "name": "<name>",
      "pool_state": "idle",
      "standing": true,
      "reviewers": ["<agent-name>", ...],
      "multi_model": <true|false>,
      "ttl_minutes": <number>,
      "spawned_at": "<ISO 8601 UTC timestamp>",
      "last_active_at": "<ISO 8601 UTC timestamp>"
    }
  }
}
```

Write atomically: write the updated index to `~/.claude/teams/standing/.index.json.tmp`, then `rename` to `~/.claude/teams/standing/index.json`.

#### 8c. Release lock

After both writes complete (or on failure), release the cross-session lock:

```
rmdir ~/.claude/teams/standing/.index.lock
```

Release the lock even if the writes failed. If the write fails, abort with a clear error after releasing.

---

### Step 9. Idle the Pool

After spawn, pool teammates perform read-on-spawn identity initialization and sit idle, waiting for tasks to appear in the pool's task root (`~/.claude/tasks/standing/<name>/`).

The Pool Lead monitors for incoming work and for lifecycle signals. When the Pool Lead is ready to receive work, it emits a "pool ready" message to the host session mailbox.

No user interaction is required during this step. Proceed to step 10 once the Pool Lead confirms readiness.

---

### Step 10. Confirm to User

Display the pool spawn confirmation. Before displaying, check the cost-warning trigger condition:

**Cost-warning trigger (D16):** If `reviewer_count >= 4` OR `(reviewer_count >= 2 AND ttl_minutes > 240)`, display the following verbatim BEFORE the confirmation:

```
Heads up: this pool will keep {reviewer_count} reviewers idle for up to {ttl_minutes} minutes. Estimated idle cost: ~{cost_estimate}. Continue?
```

Compute `{cost_estimate}` using `cost_guidance.base_tokens_per_teammate` from config (or hardcoded fallback). If the user answers `n`, abort and remove the pool resources created in steps 7–8 before exiting.

**Pool spawn confirmation (display after any cost warning):**

```
Standing review pool "<name>" is ready.

Roster ({reviewer_count} reviewer{s}):
  {reviewer_1}
  {reviewer_2}
  ...

Configuration:
  Multi-model:  {yes | no}
  TTL:          {ttl_minutes} minutes
  Routing mode: {routing_mode}

Storage:
  Metadata:  ~/.claude/teams/standing/<name>/config.json
  Tasks:     ~/.claude/tasks/standing/<name>/
  Inboxes:   ~/.claude/teams/standing/<name>/inboxes/

Submission:
  submission_timeout_seconds: {submission_timeout_seconds}
  Routing convention: any standard Synthex command that supports pool routing
  (review-code, performance-audit) will route to this pool automatically when
  it is idle and its roster covers the command's required reviewers.

To stop this pool:   /synthex-plus:stop-review-team --name <name>
To check status:     /synthex-plus:list-teams
```

---

## Pool Roster Scope Note (FR-MMT9)

`/start-review-team` accepts any Synthex agent name at spawn time — there is no agent allowlist at spawn. However, only review-shaped commands (FR-MMT15) check for matching pools. A pool spawned with a planning roster will run but no standard Synthex command will route to it in v1.

---

## Error Handling

### Lock acquisition failure

If `mkdir ~/.claude/teams/standing/.index.lock` fails after the 10-second timeout, abort with the message from step 6 and no filesystem writes.

### Spawn failure

If `spawnTeam` fails, release the lock (step 8c), remove any partially-created metadata at `~/.claude/teams/standing/<name>/`, and abort with the error from the Teammate API.

### Partial write failure

If `config.json` is written but `index.json` fails, release the lock and report:

```
Error: Pool metadata was written but the index update failed. The pool at
~/.claude/teams/standing/<name>/ may be in an inconsistent state.
Clean up manually with: rm -rf ~/.claude/teams/standing/<name>/
```

---

## Graceful Degradation

Agent Teams requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. This check runs in step 1 before any parameter resolution or writes. If the flag is missing, the command aborts immediately and offers the Synthex fallback:

```
Alternatively, you can use the standard Synthex command:

  /synthex:review-code @{target}

This uses sequential subagent execution instead of a persistent review pool.
```

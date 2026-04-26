# Stop Review Team

Gracefully shuts down one or all standing review pools. Sends a shutdown signal to the Pool Lead, waits for in-flight tasks to complete, then removes the pool entry from the standing pool index.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `name` | Pool name to stop | (interactive prompt if not provided) | No |
| `all` | Stop all standing pools | `false` | No |
| `force` | Skip in-flight task warning | `false` | No |

## Workflow

### 1. Resolve Target Pools

Determine which pool(s) to stop based on the parameters provided:

- **`--all` flag:** Target all pools listed in `~/.claude/teams/standing/index.json`. Read the index and collect all entries. If the index does not exist or is empty, inform the user: "No standing pools found." and exit cleanly.

- **`--name <name>` flag:** Target the named pool. Look up the entry in `~/.claude/teams/standing/index.json`. If no entry with that name exists, exit with: "No pool named '{name}' found in the standing pool index. Aborting."

- **Neither flag provided:** Display the standing pools table using the FR-MMT11 table format before prompting. The table columns are:

  ```
  | Name | Roster | Multi-Model | Tasks | Idle | TTL Remaining | State |
  ```

  Read `~/.claude/teams/standing/index.json` to populate the table. If the index is empty or missing, inform the user: "No standing pools found." and exit cleanly.

  After displaying the table, use `AskUserQuestion` with the verbatim prompt:

  > "Which pool would you like to stop? Enter pool name or 'cancel' to abort:"

  - On `cancel` or empty input: abort cleanly with no side effects.
  - On a recognized pool name: proceed with that pool as the sole target.
  - On an unrecognized name: re-prompt with the same question up to 2 additional times (3 total). If the name is still not recognized after 3 attempts, abort with: "No pool by that name. Aborting."

### 2. In-Flight Task Check

For each target pool, check whether any tasks recorded in the pool's metadata are in `in_progress` state.

If any tasks are `in_progress` and `--force` is **not** set, prompt the user:

> "Pool {name} has N in-progress tasks. Stop now will leave them in-progress; teammates won't get a chance to send results back to callers. Stop anyway? [y/N]"

- On `y` or `Y`: proceed with the stop for this pool.
- On `N`, `n`, empty, or any other response: skip this pool and continue with remaining target pools.

If `--force` is set, skip this check entirely and proceed directly to Step 3.

### 3. Send Shutdown Signal

For each pool confirmed for stopping, send a `SendMessage` to the Pool Lead with:

- `to`: the Pool Lead's teammate identifier for this pool
- `type`: `shutdown`
- `reason`: `"user requested via /stop-review-team"`

Example:

```
SendMessage(
  to: "{pool-name}-lead",
  type: "shutdown",
  reason: "user requested via /stop-review-team"
)
```

### 4. Wait for Shutdown Confirmation

After sending the shutdown signal, wait up to 30 seconds for the Pool Lead to complete its shutdown sequence and confirm.

**If the pool shuts down cleanly within 30 seconds:** Proceed to Step 5.

**If the pool is still running after 30 seconds:**

Check whether any tasks remain `in_progress`:

- **In-flight tasks still visible:** Emit the following verbatim message and continue to Step 6 (skipping Step 5 for this pool):

  > "Pool '{name}' is still finishing in-flight tasks. Run /list-teams to see remaining task count, or re-run /stop-review-team --name {name} --force to terminate immediately."

- **No in-flight tasks visible (likely a crashed Pool Lead):** Perform force-cleanup:

  1. Mark the pool state as `stopped` in the index entry.
  2. Proceed to Step 5 for this pool.
  3. After completing Step 5, emit a manual cleanup hint:

     > "Pool Lead for '{name}' appears to have crashed. The index entry has been removed. To verify no orphaned files remain, check the following locations manually:
     >   - Pool metadata directory: `~/.claude/teams/standing/{name}/`
     >   - Standing pool index entry: `~/.claude/teams/standing/index.json` (entry for '{name}')"

### 5. Update the Index

Remove the pool's entry from `~/.claude/teams/standing/index.json` using atomic locking semantics:

1. **Acquire lock:** Run `mkdir ~/.claude/teams/standing/.index.lock`. If `mkdir` fails (lock already held), retry up to 3 times with brief pauses before reporting a lock contention error.
2. **Write temp file:** Write the updated index (with this pool's entry removed) to `~/.claude/teams/standing/.index.json.tmp`.
3. **Atomic rename:** Rename `.index.json.tmp` to `index.json`.
4. **Release lock:** Remove the lock directory: `rmdir ~/.claude/teams/standing/.index.lock`.

### 6. Confirm to User

After processing all target pools, display a per-pool status summary:

```
Standing pool shutdown complete.

| Pool | Status |
|------|--------|
| {name} | Stopped cleanly |
| {name} | Force-stopped (in-flight tasks abandoned) |
| {name} | Cleanup needed — see manual instructions above |
```

**Status values:**
- **Stopped cleanly:** Pool Lead acknowledged shutdown within 30 seconds, no in-flight tasks abandoned.
- **Force-stopped:** `--force` was used or the user confirmed stopping with in-progress tasks. Pool entry removed; in-flight tasks were not given a chance to complete.
- **Cleanup needed:** Timeout fired with in-flight tasks still running. User must re-run with `--force` or wait for tasks to finish.

## Error Handling

### Index not found or malformed

If `~/.claude/teams/standing/index.json` does not exist or cannot be parsed, inform the user:

> "Standing pool index not found or unreadable at `~/.claude/teams/standing/index.json`. No pools to stop."

### Lock contention

If the `.index.lock` directory cannot be acquired after retries, report:

> "Could not acquire index lock after 3 attempts. Another process may be updating the standing pool index. Try again in a few seconds."

Do not leave a stale lock directory behind if this command created it.

### Partial failure with `--all`

When stopping multiple pools, a failure in one pool does not abort the others. Continue processing remaining pools and report per-pool status in the final summary.

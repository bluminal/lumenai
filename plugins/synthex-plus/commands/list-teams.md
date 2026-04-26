# List Teams

List all active teams — both standing pools and non-standing per-invocation teams.

## Parameters

None.

## Workflow

### 1. Enumerate Non-Standing Teams

Scan `~/.claude/teams/` for directories that contain a `config.json` file, excluding the `standing/` subdirectory. Each matching directory is a non-standing (ephemeral) team created by a previous per-invocation command (`team-review`, `team-implement`, etc.).

For each non-standing team directory found, record:
- `name` — directory name
- `config_path` — full path to `config.json`

If `~/.claude/teams/` does not exist, treat the non-standing list as empty.

### 2. Enumerate Standing Pools

Read `~/.claude/teams/standing/index.json`. For each entry in the index, verify that the corresponding metadata directory exists at `~/.claude/teams/standing/<name>/`. Entries whose metadata directory is missing are stale and should be silently skipped (do not display them).

If `~/.claude/teams/standing/index.json` does not exist, treat the standing pool list as empty.

### 3. Gather Per-Team Metadata

For each team identified in Steps 1 and 2, read its `config.json` and compute the following metadata fields:

**All team types:**
- `name` — team name
- `type` — `standing` or `non-standing`
- `roster` — comma-separated list of reviewer role names from the team configuration
- `multi_model` — `yes` if `multi_model: true` in config, otherwise `no`
- `tasks` — counts from the shared task list: `pending / in_progress / completed`

**Standing pools only (additional fields):**
- `idle_minutes` — minutes since `last_active_at` (integer, rounded down)
- `ttl_remaining_minutes` — `ttl_minutes` minus `idle_minutes`, floored at `0` (integer). TTL Remaining is ALWAYS a number-of-minutes integer (never a string, never a fractional value). When the pool is in `draining` or `stopping` state, set TTL Remaining to `0`.
- `pool_state` — current pool state from `config.json`; one of `idle`, `active`, `draining`, or `stopping`

**Non-standing teams only (additional fields):**
- `started_minutes_ago` — minutes since the team was created (integer, rounded down); display as `{n} min ago`

### 4. Display

Display results in a two-section table. Standing pools are displayed first, non-standing teams second, each section sorted alphabetically by name.

**Standing pools section:**

```
Standing pools:
  Name           State     Roster                              Multi-Model  Tasks (pending/in-progress/completed)  Idle    TTL Remaining
  review-pool    idle      code-reviewer, security-reviewer    yes          0 / 0 / 47                              12 min  48 min
  bg-pool        draining  code-reviewer, security-reviewer    no           0 / 1 / 12                              0 min   0 min
```

**Non-standing teams section:**

```
Non-standing teams:
  Name              Roster                                                           Tasks                  Started
  review-a3f7b2c1   code-reviewer, security-reviewer, design-system-agent           1 / 0 / 0              2 min ago
```

Column notes:
- `State` column is present only in the Standing pools section.
- `TTL Remaining` is always displayed as an integer number of minutes (e.g., `48 min`). Never a string or fractional value.
- When no standing pools exist, omit the Standing pools section entirely.
- When no non-standing teams exist, omit the Non-standing teams section entirely.

**State-value reference footnote** (display in interactive output below both tables):

```
Pool states:
  idle      — no tasks pending or in-progress; available for routing.
  active    — one or more tasks pending or in-progress; available for routing.
  draining  — completing in-flight tasks before shutdown; not accepting new submissions.
              Clears within lifecycle.stuck_task_timeout_minutes.
              Use /stop-review-team --name {name} --force to terminate immediately.
  stopping  — shutdown signal sent, awaiting confirmation; will disappear from /list-teams shortly.
```

**Empty-list message:** When no active teams exist (both lists are empty), display a friendly message rather than empty tables:

```
No active teams. Start a standing pool with `/synthex-plus:start-review-team` or run a review command to create an ephemeral team.
```

## Terminology

"Pool Lead" refers to the pool's orchestrator agent. This term is used consistently throughout the command output and documentation.

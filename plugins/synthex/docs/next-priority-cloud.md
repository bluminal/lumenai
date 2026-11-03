# next-priority: cloud execution (FR-CA1, FR-CA3–CA7)

Cold-path detail for `/synthex:next-priority` (FR-HM5, D17). Read only when the Execution Environment Resolution in `plugins/synthex/commands/next-priority.md` resolves to `cloud`. This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

## Execution Environment Resolution

Resolved **before** Step 4. Order (FR-CA3): `--in-cloud` or `--local` flag > `next_priority.execution_environment` from config (`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config-get.sh" next_priority.execution_environment local`) > `local`. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

- If both `--in-cloud` and `--local` are passed, **`--local` wins** (safer default).
- When the resolved value is `cloud` but the host's Task/Agent spawn tool does **not** accept an `environment` parameter (Cursor Task does; Claude Code Agent/Task today does not for cloud VMs): print one line — `Cloud execution is not supported on this host — falling back to local worktrees.` — and continue as `local` (FR-CA5). Do **not** invent Claude cloud parent orchestration here.
- Cloud workers communicate with the parent only via the spawn tool's result / resume / completion notification and git branches — **never** via standing-pool filesystem inboxes or an A2A mailbox protocol (FR-CA7).

## Step 4 — work environments

**Cloud (when Execution Environment Resolution is `cloud`):** Do **not** create local worktrees — the cloud subagent gets its own VM and branch. Before spawning:

1. Resolve `cloud_base_branch` as the remote-tracking base the workers should fork from (usually the current branch's upstream, else the repo's default branch). Pass that exact name to each spawn; never invent a detached local-only ref.
2. **Unsynced local changes refuse (D7):** If the selected tasks depend on uncommitted or unpushed local edits that the cloud clone would not see, stop cloud fan-out, tell the user those paths/commits must be committed and pushed (or use `--local`), and do not spawn. Cloud workers cannot see the parent's uncommitted working tree.

## Step 5 — spawning workers

#### Foreground vs background (FR-CA1)

When the host's spawn tool supports a background mode (Cursor Task: `run_in_background`; equivalents elsewhere when present):

- **Parallel Tech Lead workers for selected plan tasks:** spawn **background** (`run_in_background: true` on Cursor) so the batch truly runs in parallel and the parent can monitor / handle `[H]` gates without blocking on the first worker.
- **Advisory / gate agents** (code-reviewer, security-reviewer, consolidators, and any spawn whose verdict you need before continuing): spawn **foreground** (default / `run_in_background: false`) so the result returns in-turn.
- Omit unused optional spawn fields — never send an empty `cloud_base_branch` alongside a non-cloud environment (Cursor rejects that combination).

#### Cloud spawn (FR-CA4) — only when resolved environment is `cloud` and the Task tool accepts `environment`

On Cursor, each parallel Tech Lead Task call includes `environment: "cloud"`, `run_in_background: true`, and `cloud_base_branch: <resolved base>`. Launch all workers in **one** message (multiple Task calls) so they run concurrently. Each cloud worker shows as a subagent under this parent session.

If resolved environment is `cloud` but `environment` is not a Task/Agent parameter on this host, apply the FR-CA5 one-line fallback from Execution Environment Resolution and use the local path below instead.

Within the Step 5 delegation list:

- **Cloud:** Create/checkout branch `{worktrees.branch_prefix}[task-id]-[short-description]` from the cloud base, commit there, and **push** that branch to the remote so the parent can fetch it. Report the branch name (and PR URL if one was opened) in the completion summary
- Nesting note (Cursor): subagents may spawn children one level deep only — Tech Lead specialists must not fan out further subagents of their own

## Step 8 — merging a cloud worker's branch

**Cloud:** There is no local worktree to remove. Fetch the worker branch (prefer the branch name from the completion summary; if the worker only opened a PR, fetch the PR head), then merge with the same ff-only-then-merge-commit policy as local:

```bash
git fetch origin {worktrees.branch_prefix}[task-id]-[short-description]
git merge --ff-only FETCH_HEAD
```

If the worker reported a PR URL instead of a push-only branch, fetch that PR's head ref equivalently. Do not invent standing-pool inbox paths for cloud completion (FR-CA7).

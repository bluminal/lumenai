# next-priority: host workspace execution (FR-HW1–FR-HW7)

Cold-path detail for `/synthex:next-priority` (FR-HM5, D17). Read only when the Execution Environment Resolution in `plugins/synthex/commands/next-priority.md` resolves to `workspace` (`--in-workspace` or `next_priority.execution_environment: workspace`). This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

In workspace mode each parallel Tech Lead worker runs as its own agent session in a **child workspace** of the agent workspace manager you are running inside (Orca or Herdr). That workspace owns the checkout, so this command does **not** run `git worktree add` under `worktrees.base_path`. You can see and step into each task in the host's UI.

## Detect the workspace host (FR-HW2, FR-HW3)

Run once, before Step 4:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/detect-workspace-host.sh"
```

On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

- `orca` or `herdr`: continue below with that host.
- `conductor` or `none`: print one line — `Host workspaces are not supported here (<value>) — falling back to local worktrees.` — and continue as `local`. Conductor is detected but cannot create local workspaces from its CLI.

## Step 4 — prepare the batch

1. **Unsynced local changes refuse:** a child workspace is a fresh checkout of the current branch. If the selected tasks depend on uncommitted parent edits, stop, tell the user to commit them (or use `--local`), and spawn nothing.
2. Resolve `base` as the current branch (`git rev-parse --abbrev-ref HEAD`) and each task's branch name exactly as in `next-priority.md` Step 4.
3. Create one scratch directory outside every checkout: `run_dir="$(mktemp -d "${TMPDIR:-/tmp}/synthex-ws.XXXXXX")"`. Briefs and results live there, so a worker's `git add -A` can never commit them.
4. For each task, write `"$run_dir/<task-id>.brief.md"` holding the full Step 5 delegation (task, acceptance criteria with tags, project context, git workflow instructions), prefixed with:
   > You are a Synthex Tech Lead worker. Read `<plugin_root>/agents/tech-lead.md` and act as that agent for this task. You are already in your own checkout on branch `<task-branch>`; commit there and do not merge. When finished, write your completion summary (the one a Tech Lead returns, including `[T]` test links and `[H]` items) to `<run_dir>/<task-id>.result.md`, then stop.

Use absolute paths in the brief. The agent id to launch is your own harness: `claude`, `codex`, `gemini`, `opencode`, `grok`, `hermes` or `cursor`. If the host rejects that id, fall back to `local` for the batch with a one-line notice.

## Step 5 — launch child workspaces

Launch every worker before waiting on any of them. Read identifiers from each `--json` reply; never predict them. The prompt for every worker is: `Read <run_dir>/<task-id>.brief.md and follow it.`

**Orca (FR-HW4):** one call creates the checkout under the current workspace and starts the agent:

```bash
orca worktree create --name <task-id>-<short-description> --parent-worktree current \
  --base-branch <base> --branch <task-branch> --agent <agent-id> \
  --prompt "Read <run_dir>/<task-id>.brief.md and follow it." --json
```

Record the new worktree's path and the agent's terminal handle from the reply.

**Herdr (FR-HW5):** create the worktree workspace, start the agent in its root pane, then prompt it:

```bash
herdr worktree create --branch <task-branch> --base <base> --no-focus
herdr agent start <name> --kind <agent-id> --pane <root-pane-id>
herdr agent prompt <name> "Read <run_dir>/<task-id>.brief.md and follow it."
```

`<name>` matches `[a-z][a-z0-9_-]{0,31}` (e.g. `t-<task-id>`). Record the workspace id, checkout path and agent name.

## Step 6 — wait for results (FR-HW6)

For each worker, wait until it settles, then read its result file:

- **Orca:** `orca terminal wait --terminal <handle> --for tui-idle --json`
- **Herdr:** `herdr agent wait <name>` (returns on `idle`, `done` or `blocked`)

If `<task-id>.result.md` exists, treat it as the Tech Lead's completion summary and continue with Step 7 as normal. If it is missing, or the agent is `blocked` or asking a question, read its screen (`orca terminal read --terminal <handle> --screen`, `herdr agent read <name>`). Surface the workspace name and what it is waiting on to the user. Never answer a worker's question or approve a prompt on the user's behalf, and never guess at a result.

## Step 8 — merge and remove the child workspace (FR-HW7)

The branch is in this same repository, so merge it with the local ff-only-then-merge-commit policy from `next-priority.md` Step 8. No fetch is needed.

The immediate cleanup invariant applies. Right after a successful merge, remove that task's child workspace through the host, then confirm `git worktree list` no longer shows its path:

- **Orca:** `orca worktree rm --worktree path:<checkout-path> --json`
- **Herdr:** `herdr worktree remove --workspace <workspace-id>`

Never pass `--force`. If removal fails or the checkout has uncommitted changes, keep it, and report the exact workspace and blocker to the user. Delete `$run_dir` once every task in the batch is merged or reported.

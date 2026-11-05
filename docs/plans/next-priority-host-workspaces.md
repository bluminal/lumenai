# Implementation Plan: Host Workspaces and Claude Worktree Isolation for `next-priority`

**Status:** In progress. T1–T8 done; T9 (live Orca + Herdr smoke run) in progress. This plan records scope and decisions for work being implemented now.

**Source:** User request and live spike, 2026-11-05. No separate PRD. Scope is command/config prose, one detection script and Layer 1 tests. Functional requirements are listed as FR-HW* below.

**Reference:** `plugins/synthex/commands/next-priority.md`, `plugins/synthex/docs/next-priority-cloud.md` (FR-CA*), `docs/plans/cursor-cloud-agent-support.md`, `docs/plans/worktree-builtin-migration.md`, `plugins/synthex/config/defaults.yaml`

## Overview

`/synthex:next-priority` fans out parallel Tech Lead workers. For `local` runs it creates one `git worktree add {worktrees.base_path}/...` per task (default `.claude/worktrees`). For Cursor `--in-cloud` runs it uses Cursor cloud subagents. This plan adds two things:

1. **Host workspaces (opt-in).** Orca and Herdr manage agent workspaces: git-worktree-backed child workspaces, each with its own agent session. When Synthex runs inside one of them, `--in-workspace` launches each worker in a child workspace through that tool's CLI, replacing the subagent and the manual worktree.
2. **Claude Code isolation.** In `local` mode on Claude Code, when it is safe, each Tech Lead is spawned with the Agent tool's built-in `isolation: "worktree"` instead of a prose `git worktree add`.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-HW1 | Add the `--in-workspace` flag and the `next_priority.execution_environment: workspace` value. Resolution: `--local` beats everything. `--in-cloud` together with `--in-workspace` is refused with a one-line error. Otherwise flag > config > `local`. |
| FR-HW2 | `plugins/synthex/scripts/lib/detect-workspace-host.sh` prints exactly one of `orca \| herdr \| conductor \| none`. **Orca:** `orca` is on PATH and `orca worktree current --json` reports `"ok": true` (about 0.2s, never launches the app). **Herdr:** `HERDR_ENV=1` and `herdr` is on PATH. **Conductor:** `CONDUCTOR_WORKSPACE_PATH` is set. Orca is checked before Herdr. |
| FR-HW3 | `conductor` or `none` falls back to local with one line: `Host workspaces are not supported here (<host>) — falling back to local worktrees.` Conductor is detect-only because its CLI cannot create local workspaces (it only offers a deep link). |
| FR-HW4 | **Orca spawn:** `orca worktree create --name <task-slug> --parent-worktree current --base-branch <current branch> --branch <task-branch> --agent <current harness agent id> --prompt <worker brief> --json`. The checkout path and terminal handle are read from the JSON reply. |
| FR-HW5 | **Herdr spawn:** `herdr worktree create --branch <task-branch> --base <current branch> --no-focus`, then `herdr agent start <name> --kind <agent> --pane <root pane>` and `herdr agent prompt <name> <brief>`. IDs are read from the JSON replies, never predicted. |
| FR-HW6 | **Brief and completion contract:** the parent creates one scratch dir per batch with `mktemp -d "${TMPDIR:-/tmp}/synthex-ws.XXXXXX"` and writes `<run_dir>/<task-id>.brief.md` (the full Step 5 delegation). Each worker is launched with the prompt `Read <run_dir>/<task-id>.brief.md and follow it.` (this is the `<worker brief>` / `<brief>` in FR-HW4/5). The worker commits on the task branch in its checkout and writes its completion summary (the same one a Tech Lead returns) to `<run_dir>/<task-id>.result.md`. The parent waits (`orca terminal wait --for tui-idle` / `herdr agent wait <name>`), then reads the result file. If the file is missing, or the agent is blocked or asking a question, the parent shows the workspace to the user and never guesses. The parent deletes `$run_dir` once every task is merged or reported. |
| FR-HW7 | Merge the task branch locally with the same ff-only policy (same repo, no fetch). Then remove the child workspace with the host CLI (`orca worktree rm --worktree path:<p>` / `herdr worktree remove --workspace <id>`) as part of the immediate-cleanup invariant. Never `--force`. |
| FR-HW8 | **Claude Code isolation:** applies in `local` mode when the spawn tool accepts `isolation` (Claude Code Agent) and `worktrees.base_path` resolves to `.claude/worktrees`. Then: skip the manual `git worktree add`, spawn each Tech Lead with `isolation: "worktree"`, and have the worker first run `git branch -m <task-branch>` so `worktrees.branch_prefix` survives. Step 8 merges the task branch and runs `git worktree remove <worktreePath from the result>`. If a hook refuses git inside the isolated worktree, the worker retries with git's absolute path (`"$(command -v git)"`). If git is still refused, the worker reports `blocked: git refused in isolated worktree` and the parent reruns that task with a manual worktree. A custom `base_path` or a non-Claude host keeps manual worktrees. |
| FR-HW9 | The docs site (`bluminal/slashsynthex.com`) documents `--in-workspace`, `execution_environment: workspace` and Claude isolation. |

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | This plan **supersedes D1 of `docs/plans/worktree-builtin-migration.md`** and answers that plan's Q3 (non-interactive behaviour). | A live spike on 2026-11-05, run non-interactively through the Agent SDK, showed that a subagent spawned with `isolation: "worktree"` can rename its branch and commit. The harness keeps a changed worktree and returns `worktreePath`. The worktree shows `locked` while the agent is alive; the lock is released when the agent finishes, and the parent's plain `git worktree remove` then succeeds. **Catch:** the reported `worktreeBranch` is the name from before the rename, so the parent must use the deterministic task branch name. |
| D2 | Isolation applies only when `base_path` is the default. | Harness-provided worktrees are hardcoded to `.claude/worktrees/agent-<id>`. Consistent with D3/D4 of `worktree-builtin-migration.md`. |
| D3 | Known conflict with RTK, handled by the FR-HW8 retry and fallback. | The RTK token-saving hook rewrites `git` (even `command git` / `env git`) to `rtk git`, and Claude Code's isolated-worktree guard refuses `rtk git`. An absolute git path passes through both. |
| D4 | Workspaces are opt-in and never auto-selected on detection. | Herdr's own agent skill says not to create workspaces unless the user asks. Workspaces also have UI and resource side effects. |
| D5 | Workspace-mode detail lives in a D17 cold-path doc, `plugins/synthex/docs/next-priority-workspace.md`, read only when the environment resolves to `workspace`. Claude isolation stays inline in `next-priority.md`. | Isolation is the default Claude Code path, so it is hot. Workspace mode is rare, so it is kept out of the command's context budget. |
| D6 | Vibe Kanban (MCP `start_task_attempt`) and Conductor cloud workspaces are deferred. | Vibe Kanban's tool names have changed between versions. Conductor's cloud CLI is unverified. |
| D7 | Branch naming is unchanged: `{worktrees.branch_prefix}{task-id}-{short-description}` in every mode. | Keeps Step 8 merge naming stable, matching `cursor-cloud-agent-support.md` D6. Only the isolation mechanism changes. |
| D8 | Briefs and results live in a temp dir outside every checkout (FR-HW6). | Downstream projects only gitignore specific `.synthex/` files, so a file inside the checkout could be committed by a worker's `git add -A`. This also limits workspace mode to a local Orca/Herdr host (no remote `--host`). |

## Open Questions

| # | Question | Impact | Resolution path |
|---|----------|--------|-----------------|
| Q1 | Do the Orca and Herdr CLI flags and JSON reply shapes in FR-HW4/5 hold on current releases with a real plan? | Spawn, wait and cleanup prose may need adjusting. | T9 smoke run. |
| Q2 | Does `orca terminal wait --for tui-idle` fire reliably when the worker is waiting on a question rather than finished? | The FR-HW6 "blocked/asking" path. | T9: force one worker to ask a question and observe. |

## Tasks

### T1 (S) — Workspace host detection script · done

- `[T]` `plugins/synthex/scripts/lib/detect-workspace-host.sh` prints exactly one of `orca`, `herdr`, `conductor`, `none`, with Orca checked before Herdr (FR-HW2).
- `[T]` The Orca probe uses `orca worktree current --json` and never launches the app.
- `[T]` `tests/schemas/detect-workspace-host.test.ts` covers each host, the Orca-over-Herdr precedence and the `none` default, using stubbed PATH binaries and env vars.

### T2 (L) — `next-priority.md` flag, resolution and isolation · done

- `[T]` The Parameters table gains `--in-workspace`. Resolution order is documented: `--local` first, `--in-cloud` + `--in-workspace` refused, then flag > config > `local` (FR-HW1).
- `[T]` `workspace` mode runs the detection script and either reads the cold-path doc or prints the FR-HW3 fallback line verbatim.
- `[T]` The Step 4/5 isolation branch matches FR-HW8: the gate (Agent `isolation` support + default `base_path`), no manual `git worktree add`, `git branch -m <task-branch>` first, and the absolute-git retry and `blocked:` fallback.
- `[T]` Step 8 merges by the deterministic task branch (not the reported `worktreeBranch`) and removes `worktreePath` from the result (D1).

### T3 (M) — Cold-path doc `next-priority-workspace.md` · done

- `[T]` `plugins/synthex/docs/next-priority-workspace.md` covers Orca spawn (FR-HW4), Herdr spawn (FR-HW5), the completion contract (FR-HW6) and merge + cleanup (FR-HW7).
- `[T]` IDs, paths and handles come from JSON replies; nothing is predicted.
- `[T]` Briefs and results use the per-batch `mktemp -d` run dir outside every checkout (`<task-id>.brief.md` / `<task-id>.result.md`); the parent deletes it once every task is merged or reported (FR-HW6, D8).
- `[T]` Cleanup never uses `--force`. A missing `<run_dir>/<task-id>.result.md`, or a blocked worker, surfaces the workspace to the user.

### T4 (S) — Config and developer docs · done

- `[T]` The `defaults.yaml` `next_priority.execution_environment` comment lists `local | cloud | workspace`.
- `[T]` The AGENTS.md `next-priority` row and configurable-settings row mention `--in-workspace` / `workspace`.
- `[T]` `plugins/synthex/README.md` has a short host-workspaces section and a note on Claude isolation.
- `[T]` No hand-edits to CHANGELOG or version fields.

### T5 (M) — Layer 1 tests · done

- `[T]` `tests/schemas/next-priority-workspace.test.ts` checks the structure of `plugins/synthex/docs/next-priority-workspace.md`: Orca and Herdr spawn, wait, merge and cleanup sections are present; briefs and results sit in the temp run dir, not the checkout; no `--force`.
- `[T]` Cold-path budget tests: `next-priority.md` stays within its size budget and references the workspace doc only from the `workspace` branch (D5).
- `[T]` Cleanup-invariant tests cover the isolation path (`git worktree remove <worktreePath>`) and both host CLI remove commands.

### T6 (S) — Regenerate skill wrappers · done

- `[T]` `node plugins/synthex/scripts/generate-codex-skills.mjs` has been run; generated wrappers are byte-identical to the generator output.

### T7 (S) — Docs site PR · done

- `[T]` A PR against `bluminal/slashsynthex.com` documents `--in-workspace`, `execution_environment: workspace` and Claude isolation (FR-HW9).
- `[H]` A human reviews and merges it.

### T8 (S) — lumenai PR · done

- `[T]` The PR uses Conventional Commit subjects (`feat:` for the new flag) and Layer 1 passes in CI.
- `[H]` A human reviews and merges it.

### T9 (M) — Live Orca and Herdr smoke run · in progress

- `[O]` Inside Orca, `--in-workspace` on a real plan with ≥2 parallel tasks creates child workspaces, waits, merges ff-only and removes each workspace.
- `[O]` The same run inside Herdr.
- `[O]` One forced blocked worker surfaces its workspace instead of merging (Q2).
- `[O]` A Claude Code `local` run with RTK active shows either a clean isolated commit or the absolute-git retry succeeding (D3).
- `[H]` Fix any prose drift found; close Q1/Q2.

## Anti-Goals

- Do NOT auto-select workspace mode when a host is detected (D4).
- Do NOT implement Vibe Kanban or Conductor workspace creation (D6).
- Do NOT use `--force` on any workspace or worktree removal.
- Do NOT change `tech-lead.md` for workspace or isolation behaviour. The caller's prompt owns per-invocation policy.
- Do NOT apply isolation when `base_path` is customized (D2).
- Do NOT hand-edit release-owned version files.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Orca/Herdr CLI flags or JSON shapes change between releases. | Read everything from JSON replies. The detection script fails to `none`, which falls back to local. T9 pins current behaviour. |
| R2 | The RTK hook, or another hook, blocks git in isolated worktrees. | FR-HW8 absolute-git retry, then a per-task manual-worktree rerun (D3). |
| R3 | The reported `worktreeBranch` is stale after the rename, so the merge targets the wrong branch. | Merge by the deterministic task branch name (D1, D7). |
| R4 | A worker in a child workspace stalls on a question and the parent waits forever, or merges partial work. | FR-HW6: missing result file or blocked state → surface the workspace; never guess. |
| R5 | Orphaned child workspaces after a failure. | Immediate-cleanup invariant (FR-HW7). Never `--force`, so uncommitted work is preserved for the user. |
| R6 | A worker's `git add -A` commits the brief or result file. | Both live in a `mktemp -d` run dir outside every checkout (D8). |

## Milestone order

1. T1 detection script
2. T2 command prose + T3 cold-path doc (parallel)
3. T4 config/docs + T5 tests (parallel)
4. T6 regenerate wrappers
5. T7 docs site PR + T8 lumenai PR (parallel)
6. T9 live smoke run

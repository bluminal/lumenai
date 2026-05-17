# Implementation Plan: Migrate to Claude Code Built-in Worktree Primitives

**Status:** Deferred. This document captures scope and decisions for a future migration that leans on Claude Code's built-in worktree support (`--worktree`, subagent `isolation: worktree`, `.worktreeinclude`, `WorktreeCreate`/`WorktreeRemove` hooks) to reduce plugin-specific worktree handling. Expand into milestones via `/synthex:write-implementation-plan` when ready to execute.

**Source:** Initial research memo and recommendations from a 2026-05-17 spike comparing built-in mechanisms against `plugins/synthex/commands/next-priority.md` and `plugins/synthex-plus/commands/team-implement.md`. The two recommendations from that spike that did NOT need deferral — `isolation: worktree` for Tech Lead (rejected, see D1) and `.worktreeinclude` template in init (shipped) — are not in this plan.

**Reference:** https://code.claude.com/docs/en/worktrees

## Overview

The plugins currently hand-roll git worktree creation, branch naming, and cleanup in parallel-execution commands. Claude Code provides built-in primitives that overlap with most of what we do. This plan migrates plugin behavior toward those primitives where it is safe to do so, accepting that some changes break user-facing config keys and ship only on a major version.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | **Do NOT adopt `isolation: worktree` for the Tech Lead subagent spawned by `next-priority`.** | Spike recommendation #1, surfaced during the 2026-05-17 implementation pass. | Built-in subagent worktree isolation is designed for fire-and-forget exploration: the worktree auto-removes only when the subagent finishes **without changes** (per docs). Our `next-priority` flow has the Tech Lead **commit inside the worktree** so the parent command can `git merge --ff-only` and `git worktree remove`. The two semantics collide — Claude Code would prompt mid-run or leave worktrees orphaned. Adopting `isolation: worktree` here would require restructuring the Tech Lead to return diffs instead of commits, which is a deep change to the orchestration model. Revisit only if the diffs-not-commits restructuring is independently desired. |
| D2 | **Whether `isolation: worktree` applies to Agent Teams teammates in `team-implement` is unknown and must be verified before adoption.** | Spike recommendation #1 extension. | The Claude Code worktrees doc covers *subagent* isolation; Agent Teams use `Teammate.spawnTeam` which is a different mechanism. Test against the live API or read the Agent Teams source before assuming the frontmatter field applies. If it does, the same merge-back/commit-back constraint from D1 applies (each teammate commits to `~/.claude/tasks/{team-name}/`-tracked branches), so even a confirmed-applicable result still wouldn't be a clean swap. |
| D3 | **`worktrees.base_path` deprecated in a future minor, removed in the next major.** | Spike recommendation #3. | Built-in `--worktree` and subagent isolation hardcode `.claude/worktrees/`. Users who set `base_path: /tmp/...` (rare) are broken by a hard removal. Stage: print a deprecation notice when the key is set in a project config, document the `WorktreeCreate` hook escape hatch, then drop the key. |
| D4 | **`worktrees.branch_prefix` retained.** | Spike recommendation #3 extension. | Built-in branches are rigid (`worktree-<name>`); our prefix (`feature/`) encodes intent that survives in the commit graph and PR titles. Worth keeping even if everything else migrates. Means we cannot purely rely on `claude --worktree` for new worktrees — we either rename the branch post-creation or keep hand-rolling `git worktree add`. |
| D5 | **`WorktreeRemove` hook for post-merge cleanup is not yet viable.** | Spike recommendation #5. | Built-in cleanup expects "no changes" before removing a worktree; our flow is "merge-then-remove." Need to verify that `WorktreeRemove` hooks fire on the post-merge path and not just on the no-changes path. Spike before committing to the migration. |
| D6 | **`.worktreeinclude` already adopted in `init` (companion change, not part of this plan).** | Shipped 2026-05-17. | Listed here so future readers don't redundantly add it. |

## Open Questions

| # | Question | Impact | Resolution path |
|---|----------|--------|-----------------|
| Q1 | Does `isolation: worktree` on a subagent frontmatter apply when the subagent is invoked indirectly by a slash command (vs. directly via the Agent tool)? | Determines whether D1's restriction can be revisited cheaply. | Spike: add the frontmatter to a throwaway agent, invoke via a slash command, observe whether a worktree is created. |
| Q2 | Does `isolation: worktree` apply to Agent Teams teammates (`Teammate.spawnTeam`)? | Determines whether `team-implement` can benefit at all. | Read Claude Code's Agent Teams source (or test live) — the docs page is silent. |
| Q3 | What is the exact failure mode when a subagent with `isolation: worktree` exits with uncommitted changes during a non-interactive `claude -p` run? | Determines whether we can ever use this in CI / loop contexts. | Spike. Doc says non-interactive `--worktree` sessions skip cleanup; subagent equivalent is undocumented. |
| Q4 | Can `WorktreeRemove` hooks fire after a successful merge (i.e., is "removal" coupled to "no changes," or can our flow merge first and then trigger the hook)? | Determines viability of D5. | Doc + spike. |
| Q5 | How many downstream projects in the wild override `worktrees.base_path` away from `.claude/worktrees/`? | Sizes the breaking-change blast radius for D3. | Survey active marketplace installs at time of major-version cut. If zero, removal is free; if non-zero, ship the deprecation path. |

## Tasks

> Decompose into milestones via `/synthex:write-implementation-plan` when work starts. The bullets below are scope, not a milestone breakdown.

- **T1. Resolve Q1–Q4 via doc reading + a focused spike.** Outcome: a one-page decision memo recording which built-in primitives actually fit which plugin commands. Blocks all migration tasks.
- **T2. (If Q2 resolves "yes" and merge-back constraint is acceptable)** Add `isolation: worktree` to the Agent Teams teammate spec in `team-implement.md`. Remove any explicit `git worktree add` instructions the spec carries. Write Layer 1 + Layer 2 tests covering the new isolation semantics.
- **T3. (Independently of T2)** Replace `next-priority`'s manual `git worktree add` / `git worktree remove` with `claude --worktree <task-id>-<slug>` per task IF Q1/Q3 allow non-interactive subagent isolation, OR document why manual worktrees remain the right call. Keep the `feature/` prefix via `git branch -m` inside each worktree (D4).
- **T4. Deprecate `worktrees.base_path` overrides.** Add a SessionStart-time warning (similar pattern to the upgrade-nudge) when the key is present in `.synthex/config.yaml` and points anywhere other than `.claude/worktrees`. Document the `WorktreeCreate` hook escape hatch in CLAUDE.md and `init`'s confirmation output. Cut the key in the following major.
- **T5. (If Q4 resolves favorably)** Wire a `WorktreeRemove` hook script in `plugins/synthex/hooks/` that performs the post-merge `git worktree remove`. Move the cleanup line out of `next-priority.md` step 8. Keep the merge in the command body; the hook is purely the directory cleanup.
- **T6. (Bonus, low-priority)** Document `claude --worktree "#<PR-number>"` as the supported way to start a Synthex session against a PR. No plugin code needed — just docs.

## Anti-Goals

- Do NOT block this plan on Anthropic shipping new worktree features. The current built-in surface is sufficient for D3, D6, and (pending Q1–Q4) parts of T2/T3/T5. If a feature gap is genuinely blocking, file an issue upstream and skip that task.
- Do NOT couple this migration to other parallel-execution work (e.g., a hypothetical move from subagents to standalone `claude` processes). Worktree handling is orthogonal — keep the diff small.
- Do NOT remove `worktrees.base_path` without the deprecation cycle. Downstream config files are version-controlled in user repos; silent removal breaks them.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Q1–Q4 spikes return "built-in primitive doesn't fit" — entire plan collapses to T4 (deprecation only) + T6 (docs only). | Acceptable outcome. Even a documentation pass is net-positive. Re-validate when Claude Code ships changes to the worktree subsystem. |
| R2 | T4's deprecation warning becomes session noise for users on `.claude/worktrees` (the default). | Only emit when the key is **explicitly set** in the config file, not when it falls through to the default. Use the same key-detection pattern as the existing `multi_model_review` upgrade nudge. |
| R3 | T5's hook runs in the wrong cwd or with stale state and silently fails to clean up. | Layer 1 schema tests for the hook script + Layer 2 fixtures that exercise the merge-then-cleanup path on a real temp repo. Same pattern as the existing `upgrade-nudge` hook tests. |

## Source Authority

- Spike memo and ranked recommendations: 2026-05-17 conversation; see git log for `feat(onboarding): add /star command and upgrade-time star nudge` (sibling commit; the worktree spike ran in the same session).
- Anthropic doc: https://code.claude.com/docs/en/worktrees
- Plugin code refs at time of writing:
  - `plugins/synthex/commands/next-priority.md` — steps 4 (`git worktree add`), 5 (Tech Lead delegation), 8 (`git merge --ff-only` + `git worktree remove`).
  - `plugins/synthex-plus/commands/team-implement.md` — Agent Teams spawn (`Teammate.spawnTeam`); no current worktree integration.
  - `plugins/synthex/commands/init.md` — `.gitignore` step 5, `.worktreeinclude` step 6 (already shipped).
  - `plugins/synthex/config/defaults.yaml` — `worktrees.base_path`, `worktrees.branch_prefix`.

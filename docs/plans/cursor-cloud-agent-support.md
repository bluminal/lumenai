# Implementation Plan: Cursor Cloud Agent Support for `next-priority` Parallel Tasks

**Status:** Complete (T1–T6). Commits: `2a844a3` (cloud/next-priority), `dd66c44` (review FG/BG), plus T6 Cursor agent wrappers.

**Source:** Research conversation 2026-11-01 (Cursor subagents docs, Cloud Agents API, Claude cloud/cross-session messaging). No separate PRD — scope is host/config/command prose plus Layer 1 tests; functional requirements are listed as FR-CA* below.

**Reference:** `plugins/synthex/commands/next-priority.md`, `plugins/synthex/scripts/lib/host-matrix.mjs`, `plugins/synthex/config/defaults.yaml`, [Cursor Subagents](https://cursor.com/docs/subagents), [Claude cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)

## Overview

`/synthex:next-priority` fans out independent plan tasks to Tech Lead sub-agents, isolated today by local git worktrees. On Cursor, that maps cleanly to the Task tool — but two gaps block reliable parallel + cloud execution:

1. **Foreground vs background.** Cursor Task defaults to foreground (`run_in_background: false`). Without an explicit background flag, a `concurrent_tasks` batch serializes. Loop workers need background; advisory reviewers need foreground.
2. **Cloud isolation.** Cursor can spawn a cloud subagent under the parent via Task `environment: "cloud"` (own VM + branch). Synthex has no config/flag path for that, and the local worktree/merge handoff does not apply.

Claude Code cloud sessions exist (`claude --cloud`, Projects threads) but **cloud → parent messaging is one-way / incomplete**, so Claude cloud parity is deferred.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-CA1 | Document and apply **foreground vs background** spawn policy: parallel Tech Lead task workers → background when the host supports it; advisory reviewers / consolidators → foreground. |
| FR-CA2 | Add `next_priority.execution_environment: local \| cloud` (default `local`) in `defaults.yaml`. |
| FR-CA3 | Add `--in-cloud` and `--local` flags on `/synthex:next-priority`. Resolution: flag > config > `local`. |
| FR-CA4 | When resolved environment is `cloud` **and** the host exposes Cursor-style Task `environment`/`cloud_base_branch`: skip local worktrees; spawn each Tech Lead with `environment: "cloud"`, `run_in_background: true`, and a `cloud_base_branch` from the remote base; merge by fetching the worker branch (or PR) after validation. |
| FR-CA5 | When resolved environment is `cloud` but the host is not Cursor (no Task `environment` field): print a one-line unsupported notice and fall back to `local` (do not claim Claude cloud parity). |
| FR-CA6 | Add `cursor` to `host-matrix.mjs` (tool map + headless recipe) and regenerate `docs/hosts.md`, `docs/tool-map.md`, `config/hosts.env`. |
| FR-CA7 | Do **not** reuse standing-pool filesystem inboxes for cloud workers; parent↔worker is Task result / resume / git branch only. |

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Cursor-first. Claude cloud is FR-CA5 fallback / future work, not a second implementation path in this plan. | Cloud→parent reply channel is broken/incomplete on Claude; shipping fake parity would break the merge gate. |
| D2 | Prefer Task `environment: "cloud"` over Cloud Agents API / SDK `Agent.create({ cloud })`. | API agents are top-level siblings, not subagents of the parent session. User requirement: show under the parent. |
| D3 | Config default stays `local`; `--in-cloud` is opt-in. Sticky project default via `execution_environment: cloud` is allowed (unlike `--auto-decide`) because it is an isolation/runtime choice, not a human-gate removal. | Cloud needs pushed remotes + team MCP/env; forcing it silently would surprise local-only users. |
| D4 | `--local` exists to override a project-level `cloud` default for one call. | Symmetric with `--in-cloud`. |
| D5 | FG/BG policy is host-capability gated prose in `next-priority.md` (and a short shared note for review fan-out), not a change to agent frontmatter. | Same agent (`tech-lead`) must be BG for plan tasks and can stay FG when used as a sequential helper; per-call beats `is_background` frontmatter. |
| D6 | Cloud branch name contract matches local worktree branch naming: `{worktrees.branch_prefix}{task-id}-{short-description}`. Worker is instructed to push that branch; parent fetches and merges. | Keeps Step 8 merge naming stable; only the isolation mechanism changes. |
| D7 | Pre-cloud gate: working tree for the base must be pushable / remote-synced enough that cloud clones see required context. Uncommitted local-only changes are **not** visible to cloud workers — surface that and refuse cloud fan-out if the selected tasks depend on unpushed local edits. | Cursor staff caveat; fail closed. |
| D8 | No edits to `CHANGELOG.md` or marketplace/plugin version fields — release workflow owns those. | Repo convention. |

## Open Questions

| # | Question | Impact | Resolution path |
|---|----------|--------|-----------------|
| Q1 | Exact Cursor Task schema surface area across IDE builds (`environment`, `cloud_base_branch`, `run_in_background`) — this session's tool descriptor omitted `environment` even though staff/docs confirm it. | Prose must say "when the Task tool accepts `environment`" and omit the field (never send empty `cloud_base_branch` with `local`). | Ship capability-gated prose; pin with Layer 1 string contracts + a manual Cursor smoke later. |
| Q2 | Should review-code / multi-model fan-out also get explicit FG/BG? | Consistency vs scope. | **Resolved as T5:** reviewers stay **foreground** (parallel one-message batch, wait for all results). Do not apply next-priority's background rule to advisory fan-out. |
| Q3 | When a cloud worker opens a PR instead of only pushing a branch, prefer merge-via-PR or always fetch+ff-merge the branch? | Merge UX. | **D6 branch fetch + ff-merge** first; if the worker only opened a PR, parent checks out/fetches the PR head. Document both. |

## Tasks

### T1 (M) — Plan + config surface

- `[T]` This plan exists under `docs/plans/cursor-cloud-agent-support.md` with FR-CA1–FR-CA7 and D1–D8.
- `[T]` `defaults.yaml` `next_priority` gains `execution_environment: local` with a comment covering `local` \| `cloud`.
- `[T]` `next-priority.md` Parameters table gains `--in-cloud` and `--local` rows; documents resolution order flag > config > `local`.

### T2 (L) — `next-priority.md` FG/BG + cloud workflow

- `[T]` Step 4 skips local worktrees when resolved environment is `cloud`; records the intended branch name and resolves `cloud_base_branch`.
- `[T]` Step 5 states background spawn for parallel Tech Leads when the host supports it (`run_in_background: true` on Cursor Task / equivalent elsewhere).
- `[T]` Step 5 cloud branch: when cloud + Cursor Task `environment` supported, pass `environment: "cloud"` and `cloud_base_branch`; instruct the Tech Lead to push `{branch_prefix}{task-id}-{short-description}` and **not** merge.
- `[T]` Step 5 FR-CA5: non-Cursor cloud → one-line notice + local fallback.
- `[T]` Step 8 cloud merge: fetch worker branch (or PR head), validate, merge; no worktree remove.
- `[T]` Pre-cloud unsynced-local-changes refuse rule (D7) is present.
- `[T]` Anti-goal: no standing-pool inbox / A2A filesystem protocol for cloud workers (FR-CA7).

### T3 (M) — Cursor host matrix entry

- `[T]` `HOSTS.cursor` in `host-matrix.mjs` with Task/Agent → `Task`, Bash → `Shell`, skip-list for Claude-only tools.
- `[T]` Headless recipe populated (approval / caps / hint); regenerate hosts.md, tool-map.md, hosts.env via `generate-codex-skills.mjs`.
- `[T]` `host-matrix.test.ts` expects seven hosts including `cursor`.

### T4 (M) — Layer 1 tests + docs

- `[T]` `tests/schemas/next-priority-cloud.test.ts` covers Parameters flags, resolution order, Step 4/5/8 cloud contracts, FG/BG, FR-CA5 fallback, D7 refuse rule, FR-CA7 no-inbox.
- `[T]` `CLAUDE.md` next-priority row mentions `--in-cloud` / cloud option.
- `[T]` `plugins/synthex/README.md` short section for cloud execution.
- `[T]` No hand-edit of CHANGELOG / marketplace versions.

## Anti-Goals

- Do NOT implement Claude cloud parent-orchestrated workers in this pass.
- Do NOT call Cloud Agents REST/SDK to create sibling top-level agents for next-priority fan-out.
- Do NOT reuse `~/.claude/teams/.../inboxes` for cloud worker communication.
- Do NOT change `tech-lead.md` agent definition for cloud (caller prompt owns per-invocation policy, same as `--auto-decide`).
- Do NOT make cloud the default.
- Do NOT hand-edit release-owned version files.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Cursor Task schema varies by build; empty optional fields reject the call. | Instruct omit-unused-fields; never send `cloud_base_branch` unless `environment` is `cloud`. |
| R2 | Cloud worker cannot see uncommitted local edits. | D7 refuse / warn before fan-out. |
| R3 | Cloud MCP/secrets differ from local. | Document; workers use team cloud env. |
| R4 | Nesting limit (depth 2) — cloud Tech Lead spawning specialists may hit the ceiling. | Same as local Cursor; Tech Lead specialists must not fan out further. Surfaced in Step 5 note. |

### T5 (M) — Review / orchestrator FG vs BG (Q2)

Reviewers need results before consolidation; Cursor background would return before findings exist.

- `[T]` Capability ladder level 3 states: parallel reviewer spawns use **foreground** (`run_in_background: false` / omit); never background.
- `[T]` `review-code.md` keeps the FR-HM21 pointer into that ladder (file is size-gated; FG prose lives in the ladder, not duplicated inline).
- `[T]` `multi-model-review-orchestrator.md` Step 3 single-batch fan-out uses foreground Task calls.
- `[T]` Layer 1 tests cover the ladder + orchestrator; cross-ref FR-CA1 so next-priority BG workers stay distinct.

### T6 (S) — Cursor Task discovery wrappers

- `[T]` `generate-codex-skills.mjs` writes `plugins/synthex/cursor-agents/<slug>.md` for every `plugin.json` agent (name, description, `model: inherit`, `readonly` for advisory roles; never `is_background`).
- `[T]` Marketplace checkout also materializes `.cursor/agents/` with paths to `plugins/synthex/agents/`.
- `[T]` README documents copy/symlink for consumer projects that install the plugin elsewhere.
- `[T]` Layer 1 `cursor-agents.test.ts` covers the set, generator byte-identity, readonly matrix, and project mirror.

## Milestone order

1. T1 config + parameters  
2. T2 command workflow prose  
3. T3 host matrix + regenerate  
4. T4 tests + README/CLAUDE.md  
5. T5 review FG/BG  
6. T6 optional `.cursor/agents`  

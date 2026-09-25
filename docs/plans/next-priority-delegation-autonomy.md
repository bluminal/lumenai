# Implementation Plan: Autonomous Delegation for `next-priority`: `--auto-decide` + `ultracode`

**Status:** Complete. **T1, T3, and T4 shipped** — `--auto-decide` is implemented in `next-priority.md`, documented, and covered by Layer 1 + Layer 2 tests. **T2 was dropped**: Q1 resolved negative under empirical testing, so the `ultracode` half of this plan was never implemented. D7/D8/D9 are retained below as a record of what was designed and why it did not pan out — no `ultracode` text exists in `next-priority.md` or anywhere else in the plugin. The shipped diff is `--auto-decide` only.

**Source:** Design conversation of 2026-09-21, captured verbatim as D1–D9 below. No companion PRD — the scope is a two-feature edit to a single command file plus its tests and docs.

**Reference:** `plugins/synthex/commands/next-priority.md`, `plugins/synthex/docs/native-looping.md`, `plugins/synthex/agents/tech-lead.md`

## Overview

`/synthex:next-priority` Step 5 ("Delegate to Tech Lead") launches a Tech Lead sub-agent per task. When that Tech Lead reaches a high-impact decision it escalates to the caller *with a recommendation already in hand* (tech-lead.md "Decision Authority" table), and when a task is ambiguous it stops to clarify (tech-lead.md Behavioral Rule 7). In practice both paths become an `AskUserQuestion`, which halts an unattended `--loop` run: the `loop-advance-gate` Stop hook deliberately steps aside whenever an `AskUserQuestion` is pending, because it must never force past required human input. The net effect is that a long autonomous run stalls on a question whose answer the agent has already worked out.

Two independent, narrowly-scoped changes to the Step 5 delegation prompt were proposed. First, an opt-in `--auto-decide` flag instructing the Tech Lead to take its own recommended option rather than asking, and to write the decision — with alternatives and reasoning — into the plan for later human review. Second, injecting the literal keyword `ultracode` into the Tech Lead launch prompt when the session runs under Claude Code, pre-authorizing the Tech Lead to reach for Claude Code's Workflow tool for its own fan-out orchestration.

**The first shipped; the second did not.** Q1 was resolved empirically against a live sub-agent and came back negative — the Workflow tool is not reachable from a sub-agent at all, so the keyword confers nothing (see Q1 and T2 below). What landed is `--auto-decide` alone, as caller-supplied, per-invocation prompt text in `next-priority.md`. `tech-lead.md` was not touched.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | The flag is named `--auto-decide` and defaults **OFF** — opt-in per invocation. | This conversation (2026-09-21). | Silence-by-default would strip human escalation from every existing `next-priority` run, including ones already in flight in downstream projects. Opt-in keeps today's behavior as the default and makes autonomy an explicit, auditable choice the operator makes for a specific run. |
| D2 | Scope is `/synthex:next-priority` **only** — not the generic `/synthex:loop` primitive, not `review-code`, not `write-implementation-plan`, not the Synthex+ team commands. | This conversation. | `next-priority` is the one command where autonomous multi-task delivery actually stalls on escalations, because it is the only one that delegates open-ended implementation work in a loop. The other commands either do not loop or do not delegate decisions of this kind. Generalize later only if real demand appears. |
| D3 | Implemented purely as delegation-prompt text inside `next-priority.md` Step 5. `plugins/synthex/agents/tech-lead.md` is **NOT** modified. | This conversation. | `tech-lead.md` is shared by every caller and every harness; baking a per-invocation autonomy policy into the agent would leak it into callers that never asked for it. The agent already codifies this direction of authority: tech-lead.md line 175 ("Git workflow ... is OWNED BY THE CALLER") and Behavioral Rule 8 establish that the caller's prompt sets per-invocation policy. `--auto-decide` follows that existing precedent rather than inventing a new mechanism. |
| D4 | **`[H]` (human-validated) acceptance criteria remain a hard `AskUserQuestion` gate ALWAYS, regardless of `--auto-decide`.** | This conversation. Flagged as the highest scope-creep risk in the design. | `[H]` is a formal correctness/sign-off gate, not a "recommendation with alternatives" judgment call — the two look superficially similar but are categorically different. next-priority.md Step 7 and the Step 8 pre-merge gate require explicit user approval of each `[H]` criterion before merge, and the loop protocol's option (C) ("Await required input") exists precisely to hold a loop open for it. `--auto-decide` targets discretionary escalations only. Restated below as an anti-goal and guarded by dedicated tests. |
| D5 | Every autonomously-taken decision must be written into the persistent artifact: the decision, the alternatives considered, and the reasoning, recorded in the task's completion record in the implementation plan (next-priority.md Step 9, alongside the existing completion notes, `[T]` test linkage, and `[H]` approval record). | This conversation. | The conversation is not durable. native-looping.md's `compaction-safety` guarantees require all iteration work output to live in the user's persistent artifact, never in conversation history. A decision spoken only in-thread is lost at the next auto-compaction, which would make the autonomy unauditable — exactly the property that justifies allowing it at all. |
| D6 | The Tech Lead must propagate the `--auto-decide` directive to any sub-agent it launches. | This conversation. | The Tech Lead routinely delegates to specialists (Lead Frontend Engineer, Quality Engineer, and others). An un-propagated directive does not remove the blocking question — it just moves it one level down, where it still halts the loop and is harder to diagnose. |
| D7 | *(Never implemented — superseded by Q1's negative resolution; see T2.)* Harness detection uses **tool-inventory self-inspection**: the Step 5 instruction reads, in effect, "if the Workflow tool is available to you in this session, include the literal keyword `ultracode` in the Tech Lead launch prompt; otherwise omit it." | This conversation. | There is no out-of-band "which harness am I" signal in this repo. Codex, Gemini CLI, and OpenCode consume this exact same markdown through thin generated Agent Skills wrappers — `plugins/synthex/skills/<name>/SKILL.md` points at `commands/next-priority.md` as the behavioral source of truth and instructs the harness to "translate Claude Code-specific tool names to the closest available tools" — so the command file itself has to self-gate. The Workflow tool is only ever listed for Claude Code sessions, making tool inventory the most deterministic signal available to a markdown-instructed agent, and the repo already relies on prose-level self-inspection of exactly this kind (the `AskUserQuestion`-pending and promise-tag detection patterns in next-priority.md's Native Looping section). |
| D8 | *(Never implemented — see T2.)* `ultracode` injection is independent of `--auto-decide` and fires on every Claude Code `next-priority` Tech Lead launch. | This conversation. | The keyword only *authorizes* Workflow usage per Anthropic's Workflow tool contract (explicit user opt-in is required; one accepted form is the keyword appearing in the prompt). It does not compel orchestration — the Tech Lead still decides whether a workflow is useful for the task at hand. On non-Claude harnesses the keyword is simply absent, so there is no behavior change and no reason to couple it to the autonomy flag. |
| D9 | *(Moot — D7/D8 never implemented; the D3 half of this constraint is live and test-guarded.)* The scope of D7/D8 is the Step 5 Tech Lead launch only. No repo-wide change to `tech-lead.md`'s own specialist delegations or to any other command's sub-agent launches. | This conversation. | Keeps the diff auditable and the blast radius to one call site. A repo-wide authorization sweep is a separate decision with a separate risk profile. |

## Open Questions

| # | Question | Impact | Resolution path |
|---|----------|--------|-----------------|
| Q1 | ~~Does a Workflow-tool authorization keyword carry when it appears in a *parent agent's delegation prompt* rather than in the end user's own prompt — and does the Workflow tool appear in a sub-agent's tool inventory at all?~~ **RESOLVED NEGATIVE (2026-09-21).** | If the keyword must originate from the human user, or if sub-agents never see the Workflow tool, the entire `ultracode` task (T2) is void. **This is what happened — T2 dropped.** | Resolved **empirically**, not by documentation lookup. The `claude-code-guide` agent could not answer either sub-question at the mechanism level, so a live test was run instead: a fresh general-purpose sub-agent was spawned via the Agent tool with the literal word `ultracode` in its prompt and asked to introspect. Result: (a) **no system-reminder confirming `ultracode` was active anywhere in its context** — the only occurrence of the word was the instruction text itself, never a system-generated confirmation; (b) **`Workflow` was not among its available tools**, and `ToolSearch({query: "select:Workflow"})` returned "No matching deferred tools found", so the tool is not reachable from a sub-agent at all, keyword or not. Both sub-questions fail. Per R4, T2 was dropped and T1/T3/T4 shipped unchanged. Source: this conversation (2026-09-21). |
| Q2 | Should `--auto-decide`'s decision log live in the implementation plan's per-task completion record (current D5), or in a separate append-only artifact? | next-priority.md's Critical Requirements already warn that plans over 1500 lines need summarization; a chatty decision log accelerates that threshold. | Ship D5's one-line-per-decision format and revisit only if real runs bloat the plan. A separate artifact is a mechanical move if needed later. |

## Tasks

### T1 (M) — Add `--auto-decide` to `next-priority.md`

Parameters table row, Step 5 delegation-prompt directive, Step 7 `[H]` restatement, Step 9 decision-record requirement.

**Status:** Done. `plugins/synthex/commands/next-priority.md` (+7 lines, no deletions): Parameters table gained the `--auto-decide` row (default `off`, Required `No`); Step 5 gained an "Autonomy directive — only when `--auto-decide` is set" block covering high-impact escalations, Behavioral-Rule-7 ambiguity, the `[H]` carve-out, and the D6 propagation instruction; Step 7's `[H]` section gained an unconditional-gate line; Step 9 gained the "Autonomous decision record" bullet requiring decision + alternatives + reasoning. Every `[T]` criterion below is asserted by `tests/schemas/next-priority-auto-decide.test.ts` (see T3). The `[O]` criterion is post-deployment — it is observed on the first real unattended `--loop --auto-decide` run, not verified here.

- `[T]` The Parameters table has an `--auto-decide` row with default `off` and Required `No`, describing it as opt-in.
- `[T]` Step 5 contains an `--auto-decide` conditional block instructing the Tech Lead to take its own recommended option rather than calling `AskUserQuestion`, covering both high-impact escalations and ambiguous-task clarification.
- `[T]` That block is explicitly conditional (e.g. "When `--auto-decide` is set"), so the default path is textually unchanged.
- `[T]` The block instructs the Tech Lead to propagate the directive to sub-agents it launches (D6).
- `[T]` Both Step 5 and Step 7 state that `[H]` criteria still require explicit user approval via `AskUserQuestion` regardless of `--auto-decide` (D4).
- `[T]` Step 9 requires recording, per autonomous decision: the decision, the alternatives considered, and the reasoning.
- `[O]` An unattended `--loop --auto-decide` run completes a multi-task milestone without stopping on a non-`[H]` clarification question.

### T2 (S) — ~~Harness-gated `ultracode` keyword in the Step 5 launch prompt~~ — DROPPED

**Status:** Dropped. Q1 resolved negative: the Workflow tool is unreachable from a sub-agent (`ToolSearch({query: "select:Workflow"})` → "No matching deferred tools found"), and a sub-agent prompted with the literal keyword showed no system-generated confirmation that it took effect — so the keyword confers no authorization signal and the premise of D7/D8 does not hold. No `ultracode` text was added to `next-priority.md` or any other file. The criteria below were never implemented and are retained only as a record of the discarded design.

The one criterion here that *did* ship is the D3/D9 guard, which was folded into T3's Layer 1 suite because it is worth keeping independently of `ultracode` — it asserts `tech-lead.md` stays clean of both `ultracode` and `--auto-decide`.

- ~~`[T]` Step 5 contains an instruction conditioned on the availability of the Workflow tool in the current session.~~ Not implemented.
- ~~`[T]` The literal token `ultracode` appears inside the Step 5 section of `next-priority.md`.~~ Not implemented — and deliberately so; the token appears nowhere in the plugin.
- ~~`[T]` The instruction says to omit the keyword when the Workflow tool is unavailable, making it a no-op on non-Claude harnesses.~~ Not implemented.
- `[T]` `plugins/synthex/agents/tech-lead.md` contains neither `ultracode` nor `--auto-decide` (guards D3/D9). **Shipped under T3** — asserted by `next-priority-auto-decide.test.ts`.

### T3 (M) — Test coverage

**Status:** Done. `tests/schemas/next-priority-auto-decide.test.ts` adds 8 Layer 1 cases in the `next-priority-worktree-cleanup.test.ts` style (read the command markdown, assert presence and section-relative ordering): parameter row, conditionality, take-recommendation-and-record, `[H]` exclusion from the directive, D6 propagation, the unconditional Step 7 `[H]` gate, the Step 9 decision/alternatives/reasoning record, and the D3/D9 `tech-lead.md`-stays-clean guard. `tests/promptfoo.config.yaml` adds three Layer 2 entries — AD-B1 (`--auto-decide` → takes the recommendation), AD-B2 (no flag → still escalates via `AskUserQuestion`), AD-B3 (`[H]` stays a hard gate under the flag) — following the existing `NL-B` naming convention. None of these reference `ultracode` or depend on T2. **Verified 2026-09-21:** `npx vitest run schemas/` from `tests/` → 139/139 test files passed, 4201/4201 non-skipped tests passed, 0 failures (5 skips are pre-existing and unrelated to this change). The promptfoo config parses as well-formed YAML with AD-B1/AD-B2/AD-B3 present among its 56 tests; the Layer 2 entries are manual-trigger and uncached per repo convention, so they are not expected to run on PR CI.

- `[T]` A new Layer 1 suite `tests/schemas/next-priority-auto-decide.test.ts` follows the `next-priority-worktree-cleanup.test.ts` pattern (read the command markdown, assert on presence and section-relative ordering) and covers every `[T]` criterion of T1, plus T2's surviving D3/D9 guard. **Evidence:** 8 `it()` cases in that file.
- `[T]` `npx vitest run schemas/` from `tests/` passes with zero failures. **Evidence:** full-suite run on 2026-09-21 — 139 test files passed, 4201 tests passed, 5 pre-existing unrelated skips, 0 failures.
- `[T]` A Layer 2 behavioral assertion is added to `tests/promptfoo.config.yaml` verifying that an `--auto-decide` invocation's Tech Lead delegation prompt carries the autonomy directive while an invocation without the flag does not. **Evidence:** AD-B1/AD-B2/AD-B3 at `tests/promptfoo.config.yaml`.
- `[T]` The pre-existing heading/parameter envelope snapshots covering `next-priority.md` either still pass or are updated deliberately. **Resolved: no snapshot update needed.** `tests/schemas/native-looping-baselines.test.ts` only reads the frozen `tests/__snapshots__/native-looping/baseline/synthex__next-priority.json` and asserts shape (a `## Parameters` header, at least one heading, no "Native Looping" section); it never diffs the snapshot against the live command file, so a new Parameters row cannot break it. The snapshot is an intentionally stale pre-Phase-4 artifact and was correctly left untouched.

### T4 (S) — Documentation surface

**Status:** Done. `plugins/synthex/README.md` gained an "Autonomous Decisions (`--auto-decide`)" section directly after the native-looping section — explaining the stall it solves, the `[H]` exemption, and a worked `--loop --auto-decide` invocation — plus a Commands-table row update. The repo `CLAUDE.md` `next-priority` row now describes the flag and its `[H]` exemption.

- `[T]` `plugins/synthex/README.md` documents `--auto-decide` alongside the existing `--loop` flag documentation. **Evidence:** new "Autonomous Decisions (`--auto-decide`)" section + Commands-table row.
- `[T]` The repo `CLAUDE.md` `next-priority` command-table row mentions `--auto-decide`. **Evidence:** one-line row edit.
- `[T]` The change set contains no edit to `CHANGELOG.md`, `.claude-plugin/marketplace.json`, or any `plugins/*/.claude-plugin/plugin.json` version field — the release workflow owns all of those. **Evidence:** the working tree touches only `CLAUDE.md`, `plugins/synthex/README.md`, `plugins/synthex/commands/next-priority.md`, `tests/promptfoo.config.yaml`, `tests/schemas/next-priority-auto-decide.test.ts`, and this plan.
- `[T]` Commits use Conventional Commit subjects with a `feat:` type so the automated release picks a minor bump. **Verify at commit time** — the change is user-facing and additive, so `feat:` is the correct type.

## Anti-Goals

- **Do NOT let `--auto-decide` touch `[H]` acceptance criteria.** They stay a hard `AskUserQuestion` gate before merge in every mode. Non-negotiable; see D4.
- Do NOT modify `plugins/synthex/agents/tech-lead.md`. The autonomy directive is caller-supplied, per-invocation prompt text.
- Do NOT extend either feature to `/synthex:loop`, other Synthex commands, or the Synthex+ team commands in this pass.
- Do NOT add a `.synthex/config.yaml` / `defaults.yaml` key that makes `--auto-decide` a persisted project default. A sticky default would silently remove human escalation for everyone on the project; keep the surface to an explicit per-invocation CLI flag.
- Do NOT build a general-purpose harness-detection primitive for the repo. One prose-level tool-inventory check in one command is the whole scope.
- Do NOT hand-edit `CHANGELOG.md` or any version field.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | The Tech Lead over-applies `--auto-decide` and autonomously resolves something that genuinely needed a human — e.g. a scope change that contradicts the PRD. | The flag is off by default. The directive's precondition is that a clear recommendation is already in hand; anything without one still escalates. Every auto-decision is written to the plan with its alternatives, so a human can review and reverse it. |
| R2 | `[H]`-gate erosion: a later edit conflates `--auto-decide` with `[H]` approval and drops the pre-merge gate. | D4 is asserted by dedicated Layer 1 tests against both Step 5 and Step 7, and recorded as the leading anti-goal in this plan. |
| R3 | ~~The Workflow-tool inventory check is a prose heuristic; the agent may misjudge and emit `ultracode` on a non-Claude harness.~~ **Moot** — T2 dropped, no inventory check exists. | Bounded blast radius — the keyword is inert where no Workflow tool exists, so a false positive costs a few tokens and nothing else. |
| R4 | **Materialized.** Q1 resolved against the design and T2 is void. | Mitigation held as designed: T2 was small and fully independent, so T1/T3/T4 shipped unaffected and no rework was needed. Keeping the two features decoupled is what made a clean drop possible — worth repeating on future plans that pair a settled change with a speculative one. |
| R5 | The decision log bloats the implementation plan (next-priority.md already prescribes summarization past 1500 lines). | One line per decision under the task's completion notes. Q2 tracks a separate-artifact fallback if real runs prove it insufficient. |

## Source Authority

- This conversation's decisions (2026-09-21), captured as D1–D9, and Q1's empirical resolution the same day (live sub-agent introspection + `ToolSearch` probe for the Workflow tool).
- `plugins/synthex/commands/next-priority.md` — Parameters table (lines 13–22), Step 5 "Delegate to Tech Lead" (lines 69–92), Step 7 `[H]` validation (lines 110–114), Step 8 pre-merge gate (lines 125–128), Step 9 plan update (lines 148–157), Native Looping option (C) / `AskUserQuestion` release of the Stop hook (line 183), Critical Requirements `[H]` and 1500-line rules (lines 253–264).
- `plugins/synthex/agents/tech-lead.md` — Decision Authority table (lines 103–109), Behavioral Rule 7 (line 223), caller-owns-git-workflow precedent (line 175, Behavioral Rule 8).
- `plugins/synthex/docs/native-looping.md` — `compaction-safety` anchor (all iteration output must live in the persistent artifact), and the Stop hook stepping aside for a pending `AskUserQuestion` (shared-iter § "Turn-per-iteration").
- `plugins/synthex/portable-skills/next-priority/SKILL.md` — generated thin wrapper proving the same markdown is the behavioral source of truth for Codex/Gemini/OpenCode, which is why harness gating must live in the command file itself.
- `tests/schemas/next-priority-worktree-cleanup.test.ts` — the Layer 1 test pattern T3 follows.
- `CLAUDE.md` — release automation owns `CHANGELOG.md` and all version fields; Conventional Commits drive the bump.

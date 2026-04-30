# Implementation Plan: Upgrade Onboarding (Standalone Wizards + SessionStart Nudges)

## Overview

Closes two onboarding gaps. (1) The Step 4 Multi-Model Review wizard is currently buried inside `synthex/commands/init.md` and unreachable for users whose `.synthex/config.yaml` already exists; the analogous teams onboarding has no first-run wizard at all. (2) Plugins have no way to nudge users when they upgrade across a feature-introducing version threshold. This plan extracts the MMR wizard into a standalone `/synthex:configure-multi-model` command, introduces a focused `/synthex-plus:configure-teams` first-run wizard, and adds per-plugin `SessionStart` hooks that print a one-line nudge at most once per threshold crossing — never auto-mutating config and never running daemons.

## Goals

- Make first-run onboarding for MMR and standing-pool routing reachable for **existing** users on upgrade, not just fresh installs.
- Re-running `/synthex:configure-multi-model` and `/synthex-plus:configure-teams` is supported and idempotent.
- Cross-version nudges fire **at most once per threshold crossing** and are dismissible.
- Steady-state hook overhead (version unchanged) ≤ 50 ms.

## Non-Goals

- **Do NOT auto-mutate config.** Hooks only print one-line guidance; the wizard commands are the only paths that write `multi_model_review` / `standing_pools` keys.
- **Do NOT introduce a daemon, watcher, or background process.** Hooks are short-lived shell scripts invoked by Claude Code's `SessionStart` event.
- **Do NOT break users with no `.synthex/` or `.synthex-plus/` directory.** Hooks must exit silently and successfully when the plugin is not initialized in the project.
- **Do NOT change the existing wizard's interactive content semantics.** Step 4 of `init.md` must extract verbatim where possible; refactor preserves observable behavior of `init` (the wizard is invoked as a subroutine).
- **Do NOT add new config keys to `defaults.yaml` for nudge state.** State lives in `.synthex/state.json` / `.synthex-plus/state.json`, not in user config.
- **Do NOT bump major versions.** Both plugins ship a minor version bump (synthex `0.6.0`, synthex-plus `0.3.0`).

## Functional Requirements

### Standalone wizard commands

- **FR-UO1** — Extract Step 4 of `plugins/synthex/commands/init.md` (lines 101–200, including 4a–4d and the anti-pattern note) into a new standalone command at `plugins/synthex/commands/configure-multi-model.md`. The new command preserves the detection scan, three-option `AskUserQuestion`, FR-MR27 data-transmission warning, option 1/2/3 application logic, and `mkdir -p docs/reviews/` step.
- **FR-UO2** — `/synthex:configure-multi-model` is **idempotent and re-entrant**. If `multi_model_review.enabled: true` already exists in `.synthex/config.yaml`, the command surfaces the current setting via `AskUserQuestion` and offers three actions: re-run the wizard (overwrites), reset to disabled (removes the `multi_model_review` block or sets `enabled: false` per D-UO5), or leave as-is.
- **FR-UO3** — `init.md` Step 4 is replaced with a one-paragraph stub that delegates to `/synthex:configure-multi-model` as a subroutine. The subroutine call is internal (one command invoking another in the same session); init must not exit before the subroutine completes. End-to-end behavior of running `init` on a fresh project must be byte-identical to today, validated via Layer 1 against the existing `init.md` schema fixture.
- **FR-UO4** — Add `plugins/synthex-plus/commands/configure-teams.md` — a focused first-run wizard for standing-pool routing. Surfaces three settings via `AskUserQuestion`: (a) `standing_pools.enabled` (Enable / Skip), (b) when enabled, `standing_pools.routing_mode` (`prefer-with-fallback` default vs `strict`), (c) when enabled, `standing_pools.matching_mode` (`covers` default vs `exact`). Writes only the keys the user enabled; does not spawn a pool. **Does not duplicate `team-init.md` scope** — it is strictly an onboarding wizard for the standing-pool sub-feature.
- **FR-UO5** — `/synthex-plus:configure-teams` is idempotent and re-entrant under the same rules as FR-UO2.
- **FR-UO6** — Both new commands MUST register in their plugin's `plugin.json` `commands` array.

### SessionStart hooks

- **FR-UO7** — `plugins/synthex/hooks/hooks.json` (new file) declares a `SessionStart` hook pointing at `./scripts/upgrade-nudge.sh`. Same shape for `plugins/synthex-plus/hooks/hooks.json` (existing file gains a `SessionStart` array; `TaskCompleted` and `TeammateIdle` entries unchanged).
- **FR-UO8** — Each hook script:
  1. Resolves the plugin's current version by reading `.claude-plugin/plugin.json` (path resolved relative to the script).
  2. Resolves the project root (`$CLAUDE_PROJECT_DIR` if set, else `pwd`).
  3. Resolves the plugin's project-level state file path: `<project>/.synthex/state.json` for synthex; `<project>/.synthex-plus/state.json` for synthex-plus.
  4. Resolves the plugin's project-level config file path: `<project>/.synthex/config.yaml` for synthex; `<project>/.synthex-plus/config.yaml` for synthex-plus.
- **FR-UO9** — **Steady-state path** (state file exists AND `last_seen_version` equals current version): hook performs no I/O beyond steps 1–4 above and exits 0 silently. NFR target: ≤ 50 ms wall-clock (NFR-UO1).
- **FR-UO10** — **Fresh-install path** (no state file AND no project config file for this plugin): hook writes the state file with `last_seen_version: <current>` and `dismissed: false`, then exits 0 silently. **No nudge prints**, because the user has not been "upgraded."
- **FR-UO11** — **Re-init path** (no state file AND a project config file already exists): hook writes the state file with `last_seen_version: <current>` and exits silently. Treats the existing config as an implicit signal that the user already initialized; no nudge.
- **FR-UO12** — **Upgrade path** (state file exists, `last_seen_version` < current version):
  - If the version transition crossed the plugin's feature threshold (FR-UO13) AND the relevant config block is absent (FR-UO14) AND `dismissed != true`, print the one-line nudge to stdout (FR-UO15).
  - Always update `last_seen_version` to the current version regardless of whether the nudge fired. This guarantees the nudge fires at most once per threshold crossing.
- **FR-UO13** — **Threshold definitions:**
  - synthex: nudge when `last_seen_version < 0.5.0` AND `current >= 0.5.0`. (Confirmed against `CHANGELOG.md` `[0.5.0] - 2026-04-28` — MMR introduced in 0.5.0.)
  - synthex-plus: nudge when `last_seen_version < 0.2.0` AND `current >= 0.2.0`. (Confirmed against `CHANGELOG.md` `[synthex-plus 0.2.0] - 2026-04-26` — standing pools / routing introduced in 0.2.0.)
- **FR-UO14** — **"Config block absent" definition:**
  - synthex: the `multi_model_review` top-level key is absent from `.synthex/config.yaml`. Per D-UO5, `multi_model_review.enabled: false` is treated as **present** (the user made an explicit choice). YAML parsing uses a minimal grep-and-sed approach to avoid taking a YAML-parser dependency in shell (D-UO6).
  - synthex-plus: the `standing_pools` top-level key is absent from `.synthex-plus/config.yaml`. Same `enabled: false` semantics.
  - If the config file does not exist at all, the block is "absent" — but the fresh-install path (FR-UO10) preempts before this check.
- **FR-UO15** — **Nudge format** (printed to stdout, one line, no decoration):
  - synthex: `Synthex upgraded to <version>. Multi-model review is available. Run /synthex:configure-multi-model to set it up, or /synthex:dismiss-upgrade-nudge to silence this message.`
  - synthex-plus: `Synthex+ upgraded to <version>. Standing review pools are available. Run /synthex-plus:configure-teams to set up routing, or /synthex-plus:dismiss-upgrade-nudge to silence this message.`
- **FR-UO16** — **Dismiss commands** — two new commands `plugins/synthex/commands/dismiss-upgrade-nudge.md` and `plugins/synthex-plus/commands/dismiss-upgrade-nudge.md`, both Haiku-backed, set `dismissed: true` in the corresponding state file. They re-create the state file if missing (with `last_seen_version` = current version + `dismissed: true`). Idempotent. No flags, no parameters.

### Error handling

- **FR-UO17** — **Missing state file**: handled per FR-UO10/FR-UO11.
- **FR-UO18** — **Malformed state file** (file exists but JSON parse fails): hook overwrites with a fresh state (`last_seen_version: <current>`, `dismissed: false`) and exits 0 silently. Never errors visibly.
- **FR-UO19** — **Missing `plugin.json`** (cannot determine current version): hook exits 0 silently. No nudge, no state mutation. Sentinel for development-mode plugin installs.
- **FR-UO20** — **Read-only filesystem** (cannot write state file): hook exits 0 silently. The nudge will reappear on the next session start; acceptable degraded behavior.
- **FR-UO21** — **Hook script never blocks the session.** All branches end with `exit 0`. Hook MUST NOT prompt, read stdin, or invoke any agent.

### State file schema

`<.synthex|.synthex-plus>/state.json`:

```json
{
  "schema_version": 1,
  "last_seen_version": "0.5.2",
  "dismissed": false,
  "updated_at": "2026-04-29T14:23:11Z"
}
```

- **FR-UO22** — `schema_version` is reserved for forward compatibility; v1 only emits `1`. Hooks treat unknown `schema_version` values the same as a malformed file (FR-UO18).
- **FR-UO23** — `dismissed: true` is preserved across version updates (the dismiss is durable, not per-session). Future major-version thresholds may reset it explicitly via a new logic branch; v1 does not.
- **FR-UO24** — State files MUST be added to `.gitignore` by `init.md` and `team-init.md`. Update both wizards' `.gitignore` step (existing in init.md Step 5; existing in team-init.md Step 6).

### Performance

- **NFR-UO1** — Steady-state hook wall-clock ≤ 50 ms on macOS and Linux. Validated by Layer 2 timing fixture (Phase 5).
- **NFR-UO2** — Cold-path hook (upgrade + nudge fires) ≤ 200 ms. Looser budget because it runs at most once per upgrade per project.

## Edge Cases

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| E1 | Fresh install (first session ever, no state, no config) | Hook writes state with current version + `dismissed: false`. **No nudge** (FR-UO10). User runs `/synthex:init` separately. |
| E2 | User runs `/synthex:init` for the first time (post-E1) | Init invokes `/synthex:configure-multi-model` as subroutine (FR-UO3). State file already exists from E1; init does not modify it. |
| E3 | Existing user upgrades synthex 0.4.x → 0.5.x AND has never opted into MMR | Hook fires nudge once. State updates to current version. Next session: silent. |
| E4 | Same as E3 but user has `multi_model_review.enabled: false` in config | No nudge — explicit choice respected (FR-UO14, D-UO5). State still updates. |
| E5 | Downgrade (e.g., user pins to older synthex) | `last_seen_version > current`. Hook updates `last_seen_version` to current and exits silently. **No nudge.** Re-upgrading later re-triggers the threshold check. (D-UO7) |
| E6 | Multi-repo developer hits 5 different repos with synthex 0.4.x state files | Each repo gets one nudge on upgrade — state is per-project, not global. Acceptable; nudge is one line. (D-UO1) |
| E7 | synthex-plus is installed but teams not enabled, MMR is enabled | synthex-plus hook fires nudge for standing pools. synthex hook does not fire (config block present). Both hooks run independently per session. (D-UO4) |
| E8 | `.synthex/` directory exists but `config.yaml` does not (e.g., user deleted it) | Treat as fresh-install for MMR purposes — config block is absent. If state file exists with old `last_seen_version`, nudge fires per FR-UO12. If state file also missing, FR-UO10 path: write state, no nudge. |
| E9 | User runs `/synthex:dismiss-upgrade-nudge` then upgrades to a future version with a new threshold (post-v1) | v1 does not auto-reset `dismissed`. A future major-version threshold may add a logic branch to reset; out of scope for this plan. (FR-UO23) |
| E10 | Both plugins crossed thresholds in the same session | Both hooks run (Claude Code invokes all `SessionStart` hooks). Two nudge lines print, one per plugin. (D-UO4) |
| E11 | `CLAUDE_PROJECT_DIR` is unset | Fall back to `pwd`. Documented in script comment. |
| E12 | Hook is invoked outside a project (no `.synthex/` AND no `.synthex-plus/` in `pwd`) | Both hooks hit fresh-install path (FR-UO10) and exit silently without writing state (no plugin dir to write into). (D-UO8) |

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D-UO1 | **State file lives in the project directory** (`.synthex/state.json`, `.synthex-plus/state.json`), not user-home. | Per-project nudge tracking matches per-project config tracking; a developer working across many repos sees the nudge per-repo, which is the correct UX (each project's `.synthex/` is opted-in independently). | Matches existing config locality. Avoids cross-project leakage. Multi-repo developer (E6) sees the nudge once per project, acceptable. |
| D-UO2 | **State file is gitignored** by adding the path during `init.md` Step 5 and `team-init.md` Step 6. | State is per-developer/per-clone; committing it would cause spurious diffs and falsely suppress nudges for teammates. | Locality matches `.claude/worktrees/` precedent already in init.md. |
| D-UO3 | **Dismiss is a separate slash command** (`/synthex:dismiss-upgrade-nudge`, `/synthex-plus:dismiss-upgrade-nudge`) rather than a flag in config or an env var. | A discoverable command surface, copy-pasteable from the nudge line itself, lets users dismiss without editing files or restarting sessions. Plugin commands cost almost nothing to add. | Beats config-file edits (slow, requires re-load) and env vars (per-shell). Aligns with the nudge line's verbatim text. |
| D-UO4 | **Both plugins nudge independently in the same session** when both crossed thresholds. | Each plugin owns its own onboarding; suppressing one because the other fired would couple them. | Two short lines is acceptable noise. |
| D-UO5 | **`enabled: false` counts as "present"** for FR-UO14 absence checks. The config block is "absent" only when the top-level key (`multi_model_review` or `standing_pools`) is missing entirely. | Users who explicitly opted out should not be nudged again. | Respects explicit user choice. Re-running the wizard remains the path to re-evaluate. |
| D-UO6 | **Hook scripts use grep-only YAML detection**, not a YAML parser. | Detecting "is `multi_model_review:` a top-level key?" requires only a regex like `^multi_model_review:` at column 0. No nesting traversal needed for v1. | Avoids shipping a YAML parser, jq, or yq as a hard dependency. Trades robustness for portability; acceptable because the only downstream effect is a (false-negative absent → false-positive nudge) we're fine with. |
| D-UO7 | **Downgrades silently update `last_seen_version` and never nudge.** | If a user pins to an older version, they presumably know what they're doing; nudging on re-upgrade later is the correct moment. | Avoids spurious nudges during version pin testing. |
| D-UO8 | **Hooks operate per-project and never write state outside an existing plugin directory.** | If `pwd` has no `.synthex/`, the hook is silent — Claude Code may launch from a non-project location (a scratch directory, a parent of multiple projects). | Avoids polluting the filesystem. The first time a user actually uses the plugin in a project, state will be created via FR-UO10 once `.synthex/` exists. |
| D-UO9 | **Wizard extraction preserves Step 4's section anchors verbatim** (4a, 4b, 4c, 4d, anti-pattern). | Existing tests, fixtures, and downstream documentation reference these anchors. | Keeps Layer 1 schema validators stable; minimizes review surface. |
| D-UO10 | **`configure-teams.md` does NOT duplicate `team-init.md`'s broader scope** (Synthex dependency check, experimental-flag check, orphan detection). It is purely the standing-pools-routing wizard. | `team-init.md` remains the holistic init for synthex-plus; `configure-teams.md` is a re-runnable focused wizard. | Mirrors the synthex split between `init.md` (broad) and `configure-multi-model.md` (focused). |
| D-UO11 | **Hook scripts are POSIX `sh`-compatible**, not Bash-only. | Claude Code's hook runner may invoke under any POSIX shell. Existing synthex-plus hook scripts (`task-completed-gate.sh`) already use `#!/usr/bin/env bash` — but the upgrade-nudge script benefits from broader portability since it has fewer features to lean on. | Reduces deployment surprises. Bash features (arrays, `[[ ]]`) are not needed. |
| D-UO12 | **Version comparison uses `sort -V` (GNU/BSD-version-sort)**, not custom regex. | Available on macOS and Linux out of the box. Handles `0.5.0`, `0.5.10`, etc., correctly. | Avoids reinventing semver parsing in shell. |

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q-UO1 | Do we want the nudge to also surface in the synthex-plus README's "what's new" section, or only the in-session nudge? | Documentation duplication vs single-source. Recommend in-session nudge only for v1; CHANGELOG covers written form. | Open |
| Q-UO2 | Should `/synthex:dismiss-upgrade-nudge` accept a `--reset` flag to un-dismiss? | Edge case; users can delete `state.json` manually. Recommend defer to user demand. | Open |
| Q-UO3 | When a future major-version threshold ships (e.g., synthex 1.0), should we auto-reset `dismissed: true`? | Depends on whether 1.0 introduces a fundamentally new opt-in surface. Defer until 1.0 scope is known. | Open |
| Q-UO4 | Should `init.md`'s subroutine call to `/synthex:configure-multi-model` (FR-UO3) be a literal command invocation or an inline reference (read the wizard's `.md` and follow it)? | Affects whether init's interactive flow is a single agent thread or a child invocation. Recommend inline reference for v1 (no thread spawning); revisit if needed. | Open — see Phase 1 |
| Q-UO5 | Do we want a Layer 3 semantic test that the nudge text "reads as a nudge, not a warning"? | Quality concern, low ROI in v1. Defer. | Open |

## Phase 1 — Standalone `/synthex:configure-multi-model`

Extracts the existing Step 4 wizard into a re-runnable command. No new behavior surface; pure refactor + idempotency layer.

### Milestone 1.1: Extract the wizard

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 1 | Author `plugins/synthex/commands/configure-multi-model.md`. Copy Steps 4a, 4b, 4c, 4d, and the "Anti-pattern: do NOT write API keys to config" note from `plugins/synthex/commands/init.md` lines 101–200 verbatim. Adapt section numbering to start at Step 1 (not Step 4). Preserve all `AskUserQuestion` blocks, the FR-MR27 warning, the three-option labels, and option-application logic. Add YAML frontmatter `model: haiku` matching `init.md`. | M | None | done |
| 2 | Add idempotency layer to `configure-multi-model.md` per FR-UO2. New Step 0 reads `.synthex/config.yaml`; if `multi_model_review.enabled: true` is present, surfaces a re-entry `AskUserQuestion` with three options: Re-run wizard / Reset to disabled / Leave as-is. "Reset to disabled" sets `multi_model_review.enabled: false` (does not delete the block, per D-UO5). | M | Task 1 | done |
| 3 | Refactor `plugins/synthex/commands/init.md` Step 4 to a one-paragraph stub that delegates to `configure-multi-model.md` (Q-UO4 resolution: inline reference — init reads the wizard's content and follows it). The stub MUST preserve init's existing observable behavior on a fresh project. | S | Task 1 | done |
| 4 | Register `configure-multi-model.md` in `plugins/synthex/.claude-plugin/plugin.json` `commands` array (alphabetical insertion after `commands/init.md`). | S | Task 1 | done |

**Task 1 Acceptance Criteria:**
- `[T]` File exists with `model: haiku` frontmatter (raw-string check).
- `[T]` All four sub-step anchors (`4a` → `1a`, `4b` → `1b`, `4c` → `1c`, `4d` → `1d`) appear, renumbered to start from 1.
- `[T]` FR-MR27 warning text appears verbatim (existing schema validator can be reused).
- `[H]` Section text reads naturally as a standalone command, not as a step inside `init`.

**Task 2 Acceptance Criteria:**
- `[T]` Re-entry Step 0 present (raw-string check for the three-option label).
- `[T]` Schema validator confirms three `AskUserQuestion` blocks total (Step 0 + the existing 4b + the warning's confirm pattern).
- `[H]` Re-entry flow makes sense to a user who already opted in.

**Task 3 Acceptance Criteria:**
- `[T]` `init.md` Step 4 reduces to ≤ 5 lines (raw-string line count).
- `[T]` Layer 1 baseline snapshot of `init`'s observable output on a fresh project remains byte-identical to the pre-refactor capture (capture pre-refactor snapshot in Task 16, see Phase 5).
- `[T]` `init.md` no longer contains the FR-MR27 warning text inline (verifies extraction).

**Task 4 Acceptance Criteria:**
- `[T]` `plugin.json` parses; `commands/configure-multi-model.md` appears in `commands` array.

**Parallelizable:** Tasks 1 and 4 can start concurrently after agreement on filename. Task 2 depends on Task 1. Task 3 depends on Task 1.
**Milestone Value:** Existing users can run `/synthex:configure-multi-model` directly; init delegates without behavior drift.

## Phase 2 — Standalone `/synthex-plus:configure-teams`

New focused wizard. Does not refactor `team-init.md`.

### Milestone 2.1: Author the teams wizard

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 5 | Author `plugins/synthex-plus/commands/configure-teams.md`. YAML frontmatter `model: haiku`. Three steps: (1) Read `.synthex-plus/config.yaml`; if `standing_pools.enabled: true` is present, surface re-entry options (Re-run / Reset / Leave) per FR-UO5. (2) `AskUserQuestion`: enable standing pools? (Enable / Skip). On Skip, exit. (3) On Enable: two follow-up `AskUserQuestion` blocks for `routing_mode` (`prefer-with-fallback` default vs `strict`) and `matching_mode` (`covers` default vs `exact`). Write only the chosen keys. Do NOT spawn a pool (preserves FR-MMT27 criterion 3). | M | None | done |
| 6 | Register `configure-teams.md` in `plugins/synthex-plus/.claude-plugin/plugin.json` `commands` array. | S | Task 5 | done |
| 7 | Update `team-init.md` Step 7 ("Standing Review Pools") to add a one-line cross-reference: "Already initialized? Re-run wizard with `/synthex-plus:configure-teams`." Do NOT remove the existing Step 7 logic. | S | Task 5 | done |

**Task 5 Acceptance Criteria:**
- `[T]` File exists with `model: haiku` frontmatter.
- `[T]` Schema validator confirms three or four `AskUserQuestion` blocks (re-entry + enable + 2 follow-ups).
- `[T]` File contains no pool-spawning instructions (raw-string scan for `start-review-team` invocation patterns must return zero matches).
- `[H]` Wizard scope is strictly onboarding — no team-init duplication (cross-checked against `team-init.md` content list).

**Task 6 Acceptance Criteria:**
- `[T]` `plugin.json` parses; new command registered.

**Task 7 Acceptance Criteria:**
- `[T]` `team-init.md` contains the new cross-reference line (raw-string check).
- `[T]` Existing `team-init.md` Step 7 logic is unchanged byte-for-byte except for the appended line.

**Parallelizable:** Tasks 5 and 6 are sequenced (5 → 6). Task 7 can run in parallel with Task 6.
**Milestone Value:** Existing synthex-plus users can configure standing-pool routing without re-running full `team-init`.

## Phase 3 — synthex `SessionStart` upgrade-nudge hook

### Milestone 3.1: Hook script and registration

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 8 | Create `plugins/synthex/scripts/upgrade-nudge.sh` per FR-UO7–FR-UO21. POSIX-sh compatible (D-UO11). Implements: resolve current version from `plugin.json` (jq if available, sed fallback); resolve project root (`$CLAUDE_PROJECT_DIR \|\| pwd`); read `.synthex/state.json` (handle missing/malformed per FR-UO17–FR-UO18); detect `multi_model_review:` block via `grep -E '^multi_model_review:' .synthex/config.yaml` (D-UO6); compare versions via `sort -V` (D-UO12); print FR-UO15 nudge text on threshold-cross + absent block + not-dismissed; always write state file at end of run; exit 0 on every branch. | L | None | done |
| 9 | Create `plugins/synthex/hooks/hooks.json` declaring a `SessionStart` array pointing at `./scripts/upgrade-nudge.sh`. Mirror the shape of `plugins/synthex-plus/hooks/hooks.json`. | S | Task 8 | done |
| 10 | Author `plugins/synthex/commands/dismiss-upgrade-nudge.md` (Haiku-backed) per FR-UO16. Reads `.synthex/state.json` (creates it with current version + `dismissed: true` if missing); sets `dismissed: true`; exits with a one-line confirmation. | S | None | done |
| 11 | Register `dismiss-upgrade-nudge.md` in `plugins/synthex/.claude-plugin/plugin.json` `commands` array. | S | Task 10 | done |
| 12 | Update `plugins/synthex/commands/init.md` Step 5 (the `.gitignore` step) to also append `.synthex/state.json` to `.gitignore` per FR-UO24, D-UO2. | S | None | done |

**Task 8 Acceptance Criteria:**
- `[T]` Script is executable (`chmod +x`) and `#!/usr/bin/env sh` shebang.
- `[T]` All 6 paths exit 0 (steady-state, fresh-install, re-init, upgrade+nudge, upgrade+suppressed-by-dismiss, upgrade+config-present); covered by Layer 2 shell-test fixture in Phase 5.
- `[T]` Steady-state path completes in ≤ 50 ms wall-clock on macOS (NFR-UO1); cold path ≤ 200 ms (NFR-UO2). Validated by Layer 2 timing fixture.
- `[T]` Malformed `state.json` does NOT cause non-zero exit (FR-UO18).
- `[T]` Missing `plugin.json` causes silent exit, no state mutation (FR-UO19).
- `[T]` Read-only-fs simulation does not cause non-zero exit (FR-UO20). Use `chmod a-w .synthex/` in fixture.
- `[H]` Script source is reviewed for shellcheck cleanliness (`shellcheck` clean, no warnings).

**Task 9 Acceptance Criteria:**
- `[T]` `hooks.json` is valid JSON.
- `[T]` Schema validator (the existing `tests/schemas/synthex-plus/hooks.test.ts` pattern, ported to synthex) confirms `SessionStart` event with `command` field pointing at the script path.

**Task 10 Acceptance Criteria:**
- `[T]` Command file exists with `model: haiku` frontmatter.
- `[T]` Idempotent — running twice in a row does not error (raw-string check that the wizard re-creates state if missing).
- `[T]` Sets `dismissed: true` (verified via Layer 2 fixture in Phase 5).

**Task 11 Acceptance Criteria:**
- `[T]` `plugin.json` parses; new command registered.

**Task 12 Acceptance Criteria:**
- `[T]` `init.md` Step 5 references `.synthex/state.json` in the `.gitignore` block.

**Parallelizable:** Tasks 8, 10, 12 can start concurrently. Task 9 depends on Task 8 (path reference). Task 11 depends on Task 10.
**Milestone Value:** synthex hook fires nudges correctly; dismiss command works.

## Phase 4 — synthex-plus `SessionStart` upgrade-nudge hook

Mirrors Phase 3. Slight variation because `hooks.json` already exists (gains a `SessionStart` array alongside existing `TaskCompleted` and `TeammateIdle`).

### Milestone 4.1: Hook script and registration

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 13 | Create `plugins/synthex-plus/scripts/upgrade-nudge.sh`. Same logic as Task 8, but reads `.synthex-plus/state.json` and `.synthex-plus/config.yaml`; threshold is `0.2.0`; nudge text per FR-UO15 synthex-plus variant. | M | Task 8 (logic reuse) | pending |
| 14 | Update `plugins/synthex-plus/hooks/hooks.json` to add a `SessionStart` array pointing at `./scripts/upgrade-nudge.sh`. Existing `TaskCompleted` and `TeammateIdle` entries unchanged. | S | Task 13 | pending |
| 15 | Author `plugins/synthex-plus/commands/dismiss-upgrade-nudge.md` (Haiku-backed). Same logic as Task 10, scoped to `.synthex-plus/state.json`. | S | None | pending |
| 16 | Register `dismiss-upgrade-nudge.md` in `plugins/synthex-plus/.claude-plugin/plugin.json` `commands` array. | S | Task 15 | pending |
| 17 | Update `plugins/synthex-plus/commands/team-init.md` Step 6 (the `.gitignore` step) to also append `.synthex-plus/state.json` to `.gitignore` per FR-UO24, D-UO2. | S | None | pending |

**Task 13 Acceptance Criteria:**
- `[T]` All criteria from Task 8 apply, parameterized for synthex-plus paths and threshold.
- `[T]` Script does NOT depend on `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag (the hook must run regardless of teams flag — the nudge is informational).

**Task 14 Acceptance Criteria:**
- `[T]` `hooks.json` parses; existing `TaskCompleted` and `TeammateIdle` arrays preserved byte-identical.
- `[T]` New `SessionStart` array points at the script.

**Task 15–17 Acceptance Criteria:** Parallel structure to Tasks 10–12.

**Parallelizable:** Tasks 13, 15, 17 can start concurrently after Task 8 lands (for code reuse). Task 14 depends on 13. Task 16 depends on 15.
**Milestone Value:** synthex-plus hook fires nudges correctly; dismiss command works.

## Phase 5 — Tests (three-layer pyramid)

### Milestone 5.1: Layer 1 schema validators (instant, free)

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 18 | Author `tests/schemas/configure-multi-model.ts` and `.test.ts`. Validates `configure-multi-model.md` structure: frontmatter, three or four `AskUserQuestion` blocks, FR-MR27 warning text presence, three-option labels, idempotency Step 0 present. | M | Task 2 | pending |
| 19 | Author `tests/schemas/configure-teams.ts` and `.test.ts`. Validates `configure-teams.md` structure: frontmatter, idempotency Step 0, enable/skip block, follow-up blocks for `routing_mode` and `matching_mode`. | M | Task 5 | pending |
| 20 | Author `tests/schemas/dismiss-upgrade-nudge.ts` and `.test.ts`. Validates both dismiss commands' structure (frontmatter, no parameters, sets `dismissed: true`, idempotent re-creation logic documented). | S | Task 10, Task 15 | pending |
| 21 | Author `tests/schemas/upgrade-nudge-hook.ts` and `.test.ts`. Validates that both `hooks.json` files declare `SessionStart` and that the referenced scripts exist and are executable. | S | Task 9, Task 14 | pending |
| 22 | Capture pre-refactor `init.md` baseline snapshot at `tests/__snapshots__/upgrade-onboarding/init-pre-refactor/`. Used by Task 3's byte-identical assertion. | S | None | pending |

**Acceptance Criteria pattern (each):**
- `[T]` Validator catches structural defects (missing frontmatter, missing required blocks, etc.).
- `[T]` Test suite runs in Vitest's `tests/schemas/` flow with no new dependencies.

### Milestone 5.2: Layer 2 behavioral fixtures for the hook scripts (manual trigger)

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 23 | Author `tests/fixtures/upgrade-onboarding/synthex-hook/`. Six sub-fixtures, one per FR-UO9–FR-UO12 path: `steady-state/`, `fresh-install/`, `re-init/`, `upgrade-nudge-fires/`, `upgrade-config-present/`, `upgrade-dismissed/`. Each has a pre-state directory layout, the expected post-state, and the expected stdout. Use `bats` or a simple `sh` test harness — no new dependencies if `bats` is already in `tests/`; otherwise inline `sh`. | L | Task 8 | pending |
| 24 | Author `tests/fixtures/upgrade-onboarding/synthex-plus-hook/`. Same six sub-fixtures, parameterized for synthex-plus paths and threshold. | M | Task 13, Task 23 | pending |
| 25 | Author `tests/fixtures/upgrade-onboarding/dismiss-flow/`. Two sub-fixtures: dismiss-with-existing-state, dismiss-with-missing-state. Verifies `dismissed: true` is written in both cases. | S | Task 10, Task 15 | pending |
| 26 | Author timing-budget fixture: invokes the hook 100 times in steady-state and asserts p95 ≤ 50 ms (NFR-UO1). Cold-path fixture: invokes once in upgrade-nudge mode and asserts wall-clock ≤ 200 ms (NFR-UO2). | M | Task 23 | pending |

**Acceptance Criteria pattern (each):**
- `[T]` Each fixture exits 0; observed post-state matches expected post-state.
- `[T]` Observed stdout matches expected stdout (the nudge line for upgrade fixtures; empty for steady-state).

### Milestone 5.3: Layer 2 behavioral assertions for wizard commands

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 27 | Add behavioral assertions to `tests/promptfoo.config.yaml` for `/synthex:configure-multi-model` covering: detection scan output structure, three-option `AskUserQuestion` invocation, FR-MR27 warning fires before option-1 write. Reuse fixtures from existing `tests/fixtures/commands/init/` where possible. | M | Task 1, Task 18 | pending |
| 28 | Add behavioral assertions for `/synthex-plus:configure-teams`: enable/skip block fires, follow-ups appear only on Enable, no pool-spawn invoked. | M | Task 5, Task 19 | pending |
| 29 | Add behavioral assertions for re-entry idempotency: running the wizard twice does not corrupt config; "Reset to disabled" path produces `enabled: false` (not block deletion, per D-UO5). | S | Task 27, Task 28 | pending |

**Acceptance Criteria:**
- `[T]` All assertions pass against cached agent outputs.
- `[T]` Idempotency assertions: second-run output asserts the re-entry options surface (raw-string check), config not corrupted.

### Milestone 5.4: Layer 3 semantic eval (deferred unless flagged)

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 30 | (Deferred per Q-UO5.) LLM-as-judge eval that the synthex nudge text reads as a nudge, not a warning, and that re-entry option labels are clear. Scope to a single fixture per command. Skip in v1; revisit if user feedback requests. | M | All Phase 1–4 done | deferred |

**Parallelizable:** Tasks 18, 19, 20, 21, 22 can run concurrently after their respective wizard/hook tasks. Tasks 23, 24, 25, 26 sequence on the hook scripts. Tasks 27–29 sequence on the wizards.
**Milestone Value:** Hook behavior is regression-protected at the shell level; wizard behavior is regression-protected at the prompt level.

## Phase 6 — Documentation, Release Notes, Version Bumps

### Milestone 6.1: Documentation

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 31 | Update `CLAUDE.md` "Commands" tables. Add `configure-multi-model` and `dismiss-upgrade-nudge` to the synthex commands table. Add `configure-teams` and `dismiss-upgrade-nudge` to the synthex-plus commands table. | S | Phases 1–4 done | pending |
| 32 | Update `plugins/synthex/README.md` with a brief "Re-running configuration wizards" section pointing at `/synthex:configure-multi-model` and `/synthex:dismiss-upgrade-nudge`. | S | Phases 1–3 done | pending |
| 33 | Update `plugins/synthex-plus/README.md` with the analogous section for `configure-teams` and `dismiss-upgrade-nudge`. | S | Phases 2, 4 done | pending |
| 34 | Author `CHANGELOG.md` entry for the synthex `0.6.0` release (per D-UO release strategy below). Document FR-UO1, FR-UO3, FR-UO7–FR-UO16, NFR-UO1. | S | Phases 1, 3 done | pending |
| 35 | Author `CHANGELOG.md` entry for synthex-plus `0.3.0` release. Document FR-UO4, FR-UO7, FR-UO13 (synthex-plus), FR-UO15 (synthex-plus), FR-UO16. | S | Phases 2, 4 done | pending |

**Acceptance Criteria pattern (each):**
- `[T]` Cross-references to FR-UO numbers are accurate.
- `[H]` Changelog tone matches the existing `[0.5.0]` and `[synthex-plus 0.2.0]` entry style.

### Milestone 6.2: Version bumps and release

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 36 | Bump `plugins/synthex/.claude-plugin/plugin.json` `version` from `0.5.2` to `0.6.0`. | S | Phase 1, 3 done | pending |
| 37 | Bump `plugins/synthex-plus/.claude-plugin/plugin.json` `version` from `0.2.1` to `0.3.0`. | S | Phase 2, 4 done | pending |
| 38 | Bump `.claude-plugin/marketplace.json` top-level `version` to `0.6.0` (matches the synthex bump per existing convention). Bump per-plugin `version` entries: synthex `0.5.2 → 0.6.0`, synthex-plus `0.2.1 → 0.3.0`. | S | Tasks 36, 37 | pending |
| 39 | Add CHANGELOG link references at file bottom: `[synthex 0.6.0]` and `[synthex-plus 0.3.0]` GitHub release tag links. | S | Tasks 34, 35 | pending |

**Acceptance Criteria pattern:**
- `[T]` All four version fields (`marketplace.json` top-level, two per-plugin entries in `marketplace.json`, two `plugin.json` files) are mutually consistent.
- `[T]` `marketplace.json` parses as valid JSON.

**Parallelizable:** Tasks 31, 32, 33, 34, 35 can run concurrently. Task 36 and 37 can run in parallel; Task 38 depends on both.
**Milestone Value:** Release-ready. Both plugins ship with documented behavior, version bumps, and changelog entries.

## Release Strategy

- **synthex 0.6.0** — minor bump (new commands, new hook, no breaking changes).
- **synthex-plus 0.3.0** — minor bump (new command, new hook, existing hooks unchanged).
- **marketplace.json top-level**: `0.5.2 → 0.6.0`. Per CLAUDE.md release rules, the marketplace top-level version controls upgrade detection — it must bump to trigger user re-install.
- Both `plugin.json` files MUST also bump (sync with `marketplace.json` per the 0.4.0 changelog precedent).

## Test Counts (estimated)

- Layer 1 (Vitest schemas): ~50 new tests across 5 new test files (`configure-multi-model.test.ts`, `configure-teams.test.ts`, `dismiss-upgrade-nudge.test.ts`, `upgrade-nudge-hook.test.ts`, baseline snapshot guard).
- Layer 2 (Promptfoo + shell): 6 hook-script fixtures × 2 plugins = 12 shell fixtures; ~15 promptfoo behavioral assertions across both wizards.
- Layer 3: deferred.

## Rollout

- Ship 0.6.0 / 0.3.0 together. Both hooks land in the same release; documentation cross-references both new commands.
- Existing users on 0.5.x synthex / 0.2.x synthex-plus see one nudge per plugin per project on next session start. State files write silently on first session of 0.6.0 / 0.3.0.
- Users on 0.4.x synthex who skipped 0.5.x entirely still cross the threshold (`< 0.5.0 → 0.6.0` satisfies FR-UO13).

## Out of Scope

- Re-resetting `dismissed` on future major-version thresholds (Q-UO3).
- A `--reset` flag for `/synthex:dismiss-upgrade-nudge` (Q-UO2).
- README "what's new" duplication (Q-UO1).
- Multi-line nudge content, ANSI styling, or progressive disclosure UI in the nudge — one line, plain text only.
- Cross-plugin nudge coordination (each plugin nudges independently per D-UO4).
- Telemetry on nudge fire rate, dismiss rate, or wizard completion rate.

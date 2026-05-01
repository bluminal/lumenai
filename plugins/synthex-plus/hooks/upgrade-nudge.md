# SessionStart hook: upgrade-nudge

Companion documentation for `scripts/upgrade-nudge.sh`. The hook fires on every Claude Code session start and prints a one-line nudge when a user has upgraded synthex-plus across the `0.2.0` feature threshold (where standing review pools and pool routing landed) and has not yet configured the feature.

## Behavior

The script is fully self-documenting in source — see the leading comment block in `scripts/upgrade-nudge.sh` for the precise contract. In summary:

- **Steady-state path** (`state.json.last_seen_version` equals current plugin version): silent exit 0; ≤ 50 ms wall-clock target (NFR-UO1).
- **Fresh-install path** (no state file): seed `.synthex-plus/state.json` with `last_seen_version = current`, `dismissed = false`. No nudge.
- **Re-init path** (no state file but `.synthex-plus/config.yaml` exists): same as fresh-install — write state, no nudge.
- **Upgrade-nudge path** (state exists, `last_seen_version < current`, threshold crossed, `standing_pools` block absent from config, `dismissed != true`): print FR-UO15 nudge text to stdout; update state.
- **Suppression cases**: `standing_pools:` block already present, or `dismissed: true` in state, or downgrade detected — silent state update, no nudge.
- **Error paths**: missing `plugin.json`, malformed `state.json`, read-only filesystem — all exit 0 silently.

## Hook contract

- Exit code: always `0`. Never blocks the session (FR-UO21).
- Never prompts, reads stdin, or invokes any agent.
- Does NOT depend on `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` — the nudge fires regardless of the teams beta flag because it's informational.

## Threshold

`< 0.2.0 → ≥ 0.2.0`. Confirmed against `CHANGELOG.md` `[synthex-plus 0.2.0] - 2026-04-26` — the release where standing pools were introduced.

## Nudge text (FR-UO15)

```
Synthex+ upgraded to <version>. Standing review pools are available. Run /synthex-plus:configure-teams to set up routing, or /synthex-plus:dismiss-upgrade-nudge to silence this message.
```

## Source authority

- Plan: `docs/plans/upgrade-onboarding.md` Task 13.
- Functional requirements: FR-UO7 through FR-UO21.
- Decisions: D-UO6 (grep-only YAML detection), D-UO7 (downgrade silent-update), D-UO11 (POSIX sh), D-UO12 (`sort -V` version compare).

# SessionStart hook: upgrade-nudge

Companion documentation for `scripts/upgrade-nudge.sh`. The hook fires on every Claude Code session start and may emit one of two one-line nudges:

1. **Feature nudge** — when a user has upgraded synthex across the `0.5.0` feature threshold (where multi-model review landed) and has not yet configured the feature.
2. **Star nudge** — on any upgrade, when the user has neither starred the Lumenai marketplace nor explicitly dismissed the request.

Both nudges fire at most once per upgrade (steady-state exits before emitting anything).

## Behavior

The script is fully self-documenting in source — see the leading comment block in `scripts/upgrade-nudge.sh` for the precise contract. In summary:

- **Steady-state path** (`state.json.last_seen_version` equals current plugin version): silent exit 0; ≤ 50 ms wall-clock target (NFR-UO1).
- **Fresh-install path** (no state file): seed `.synthex/state.json` with `last_seen_version = current`. No nudge.
- **Re-init path** (no state file but `.synthex/config.yaml` exists): same as fresh-install — write state, no nudge.
- **Feature-nudge path** (state exists, `last_seen_version < current`, threshold crossed, `multi_model_review` block absent from config, `dismissed != true`): print FR-UO15 nudge text to stdout.
- **Star-nudge path** (state exists, `last_seen_version < current`, `starred != true`, `star_dismissed != true`): print a friendly one-liner asking the user to run `/synthex:star`. Fires independently of the feature nudge — both may fire in the same session.
- **Suppression cases**: feature nudge suppressed by `multi_model_review:` block present or `dismissed: true`; star nudge suppressed by `starred: true` or `star_dismissed: true`. Downgrade detected → silent state update, neither nudge fires.
- **Error paths**: missing `plugin.json`, malformed `state.json`, read-only filesystem — all exit 0 silently.

## State schema

`.synthex/state.json` (per-developer, gitignored):

| Field | Type | Meaning |
|-------|------|---------|
| `schema_version` | int | Always `1` |
| `last_seen_version` | string | Plugin version observed on the previous session |
| `dismissed` | boolean | User dismissed the feature nudge (via `/synthex:dismiss-upgrade-nudge`) |
| `starred` | boolean | User accepted the star prompt and was directed to the repo |
| `star_dismissed` | boolean | User declined the star prompt; suppress future star nudges |
| `updated_at` | string | UTC ISO 8601 timestamp of the last state write |

## Hook contract

- Exit code: always `0`. Never blocks the session (FR-UO21).
- Never prompts, reads stdin, or invokes any agent.

## Threshold

`< 0.5.0 → ≥ 0.5.0`. Confirmed against `CHANGELOG.md` `[0.5.0] - 2026-04-28` — the release where multi-model review was introduced.

## Nudge text (FR-UO15)

```
Synthex upgraded to <version>. Multi-model review is available. Run /synthex:configure-multi-model to set it up, or /synthex:dismiss-upgrade-nudge to silence this message.
```

## Source authority

- Plan: `docs/plans/upgrade-onboarding.md` Task 8.
- Functional requirements: FR-UO7 through FR-UO21.
- Decisions: D-UO6 (grep-only YAML detection), D-UO7 (downgrade silent-update), D-UO11 (POSIX sh), D-UO12 (`sort -V` version compare).

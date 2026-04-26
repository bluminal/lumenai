# Scenario: start-default

## Summary
User runs `/start-review-team` with default parameters (no flags). Pool spawns with `code-reviewer` + `security-reviewer`, multi_model=false, ttl=60.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | User invokes command with no flags; config provides default roster |
| 2 | `validation_passed` | Name resolved to "review-pool"; roster validated against known agents |
| 3 | `lock_acquired` | `.index.lock` acquired via mkdir |
| 4 | `metadata_written` | config.json written with pool_state: idle; index.json written with pool entry; spawn prompts embedded |
| 5 | `confirmation_shown` | Output confirms name, roster, TTL; no cost warning (roster size ≤ 3) |

## Assertions

- Frame 4: `config_json.pool_state === "idle"`
- Frame 4: `spawn_prompts.pool_lead` contains `"### Standing Pool Identity Confirm Overlay"` verbatim
- Frame 5: `cost_warning_shown === false`

## Acceptance Criteria Covered
- D6: Default roster from config
- D16: Cost warning NOT shown for ≤ 3 reviewers
- T6: pool_state: idle in initial metadata write
- T11: Identity Confirm Overlay in Pool Lead spawn prompt

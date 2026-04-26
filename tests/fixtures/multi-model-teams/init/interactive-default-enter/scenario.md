# Scenario: interactive-default-enter

## Summary

User runs `/synthex-plus:team-init` interactively and presses Enter (empty input) at both optional prompts. Empty input is treated as Skip — the same outcome as explicitly typing "Skip". No config keys are written; Step 9 pool commands are not shown.

## User Responses

| Prompt | Response |
|--------|----------|
| Standing pools (Enable / Skip) | (empty — Enter pressed) |
| Multi-model review (Enable / Skip) | (empty — Enter pressed) |

## Expected Outcomes

- Same as `skip-both`: no config keys written for optional features
- `standing_pools_enabled_written: false`
- `multi_model_team_review_enabled_written: false`
- `config_keys_added` is empty
- `step9_pool_commands_shown: false`

## Acceptance Criteria Covered

- FR-MMT27: empty/default input treated as Skip (safe default)
- Consistent with "Enable / Skip" prompt convention — absence of explicit Enable should not write config

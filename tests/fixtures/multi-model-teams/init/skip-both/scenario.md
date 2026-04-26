# Scenario: skip-both

## Summary

User runs `/synthex-plus:team-init` and answers Skip to both optional prompts (standing review pools and multi-model review). No new config keys are written; Step 9 guidance output does NOT include pool management commands.

## User Responses

| Prompt | Response |
|--------|----------|
| Standing pools (Enable / Skip) | Skip |
| Multi-model review (Enable / Skip) | Skip |

## Expected Outcomes

- `.synthex-plus/config.yaml` is created from defaults but receives no additional keys for `standing_pools` or `multi_model_review.per_command.team_review`
- `config_keys_added` is empty
- Step 9 output does NOT show `/synthex-plus:start-review-team`, `/synthex-plus:stop-review-team`, or `/synthex-plus:list-teams`

## Acceptance Criteria Covered

- FR-MMT27: Skip path — no config written for either optional section
- FR-MMT27 criterion 3: pool not spawned (trivially true — feature not enabled)
- Step 9 pool commands conditioned on standing_pools.enabled

# Scenario: enable-both

## Summary

User runs `/synthex-plus:team-init` and answers Enable to both optional prompts (standing review pools and multi-model review in /team-review). Both config sections are written; user receives the prerequisite notice about `multi_model_review.enabled: true` in `.synthex/config.yaml`.

## User Responses

| Prompt | Response |
|--------|----------|
| Standing pools (Enable / Skip) | Enable |
| Multi-model review (Enable / Skip) | Enable |

## Expected Outcomes

- `standing_pools.enabled: true` written
- `standing_pools.routing_mode: prefer-with-fallback` written
- `standing_pools.matching_mode: covers` written
- No pool spawned during init (FR-MMT27 criterion 3)
- `multi_model_review.per_command.team_review.enabled: true` written
- User sees notice: "Make sure multi_model_review.enabled: true is set in .synthex/config.yaml"
- Step 9 shows all three pool management commands
- `config_keys_added` contains all four keys

## Acceptance Criteria Covered

- FR-MMT27: both Enable paths exercised simultaneously
- FR-MMT27 criterion 3: pool NOT spawned at init time
- FR-MMT27: multi_model prerequisite notice shown to user
- Step 9 pool commands shown when standing_pools enabled

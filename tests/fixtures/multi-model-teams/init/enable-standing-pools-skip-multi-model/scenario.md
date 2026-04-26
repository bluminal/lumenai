# Scenario: enable-standing-pools-skip-multi-model

## Summary

User runs `/synthex-plus:team-init` and answers Enable to standing review pools but Skip to multi-model review. The three standing-pool config keys are written; no pool is spawned at init time; Step 9 guidance shows all three pool management commands verbatim.

## User Responses

| Prompt | Response |
|--------|----------|
| Standing pools (Enable / Skip) | Enable |
| Multi-model review (Enable / Skip) | Skip |

## Expected Outcomes

- `standing_pools.enabled: true` written to `.synthex-plus/config.yaml`
- `standing_pools.routing_mode: prefer-with-fallback` written
- `standing_pools.matching_mode: covers` written
- No pool spawned during init (FR-MMT27 criterion 3)
- `multi_model_review.per_command.team_review.enabled` NOT written
- Step 9 appends three pool management commands to the "Available team commands" section:
  - `/synthex-plus:start-review-team`
  - `/synthex-plus:stop-review-team`
  - `/synthex-plus:list-teams`

## Acceptance Criteria Covered

- FR-MMT27 criterion 1: standing_pools.enabled: true written on Enable
- FR-MMT27 criterion 2: prefer-with-fallback routing_mode written as default
- FR-MMT27 criterion 3: pool NOT spawned at init time
- FR-MMT27: multi-model skip path — key not written
- FR-MMT27: Step 9 pool commands conditional on standing_pools enabled

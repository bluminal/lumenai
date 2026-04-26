# Scenario (b): pool-match-multi-model

## Summary

`/synthex:review-code` is invoked without `--reviewers`. A standing pool (`review-pool-b`) matches the required reviewers with `multi_model: true`. Routing mode is `prefer-with-fallback`. The notification must emit `(multi-model: yes)` and the report carries multi-model attribution.

## Inputs

### Pool State (index.json)
- Pool `review-pool-b` with roster `[code-reviewer, security-reviewer]`
- `pool_state: idle`
- `multi_model: true`
- `last_active_at: 2026-04-26T05:00:00Z` (not stale, within TTL)
- `ttl_minutes: 60`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- No `--reviewers` flag
- `target: staged`

## Expected Outputs

- `routing_decision: routed-to-pool`
- `pool_name: review-pool-b`
- `multi_model: true`
- Routing notification contains verbatim: `(multi-model: yes)`
- Report attribution: `Review path: standing pool 'review-pool-b' (multi-model: yes).`
- No error emitted

## Assertions

- `routing_decision === "routed-to-pool"`
- `pool_name === "review-pool-b"`
- `multi_model === true`
- `notification_contains` is `"multi-model: yes"`
- `notification_absent` string `"multi-model: no"` is NOT in notification
- `report_attribution` matches verbatim provenance line (Task 55 Item 4)
- `error` is null

## Acceptance Criteria Covered

- FR-MMT17: routing notification verbatim text with `(multi-model: yes)`
- Task 55 Item 4: provenance line verbatim in report
- Inline discovery routes correctly to multi-model pool

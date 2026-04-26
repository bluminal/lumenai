# Scenario (a): pool-match-native-only

## Summary

`/synthex:review-code` is invoked without `--reviewers`. A standing pool (`review-pool-a`) matches the required reviewers (`code-reviewer`, `security-reviewer`) with `multi_model: false`. Routing mode is `prefer-with-fallback`. The pool is idle and its TTL has not expired.

## Inputs

### Pool State (index.json)
- Pool `review-pool-a` with roster `[code-reviewer, security-reviewer]`
- `pool_state: idle`
- `multi_model: false`
- `last_active_at: 2026-04-26T05:00:00Z` (not stale, within TTL)
- `ttl_minutes: 60`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- No `--reviewers` flag; hardcoded fallback applies: `code-reviewer, security-reviewer`
- `target: staged`

## Expected Outputs

- `routing_decision: routed-to-pool`
- `pool_name: review-pool-a`
- `multi_model: false`
- Routing notification contains verbatim: `(multi-model: no)`
- No error emitted

## Assertions

- `routing_decision === "routed-to-pool"`
- `pool_name === "review-pool-a"`
- `multi_model === false`
- `notification_contains` string is `"multi-model: no"`
- `notification_absent` string `"multi-model: yes"` is NOT in notification
- `error` is null

## Acceptance Criteria Covered

- FR-MMT17: routing notification verbatim text with `(multi-model: no)`
- Inline discovery correctly resolves idle matching pool
- `prefer-with-fallback` mode routes to pool (no fallback needed)

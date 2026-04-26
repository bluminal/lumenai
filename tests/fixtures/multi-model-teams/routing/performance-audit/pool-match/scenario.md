# Scenario (a): pool-match

## Summary

`/synthex:performance-audit` is invoked. A standing pool (`perf-pool-a`) matches the required reviewer set (`performance-engineer`) with `multi_model: false`. Routing mode is `prefer-with-fallback`. The pool is idle and its TTL has not expired.

## Inputs

### Pool State (index.json)
- Pool `perf-pool-a` with roster `[performance-engineer]`
- `pool_state: idle`
- `multi_model: false`
- `last_active_at: 2026-04-26T05:00:00Z` (not stale, within TTL)
- `ttl_minutes: 60`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- `scope: full-stack`
- Required reviewer set is static: `[performance-engineer]`

## Expected Outputs

- `routing_decision: routed-to-pool`
- `pool_name: perf-pool-a`
- `multi_model: false`
- Routing notification contains verbatim: `(multi-model: no)`
- `(multi-model: yes)` is absent from the notification
- No error emitted

## Assertions

- `routing_decision === "routed-to-pool"`
- `pool_name === "perf-pool-a"`
- `multi_model === false`
- `notification_contains` string is `"multi-model: no"`
- `notification_absent` string `"multi-model: yes"` is NOT in notification
- `error` is null

## Acceptance Criteria Covered

- FR-MMT17: routing notification verbatim text with `(multi-model: no)`
- Inline discovery correctly resolves idle matching pool for `performance-engineer`
- `prefer-with-fallback` mode routes to pool (no fallback needed)
- Static required-reviewer-set `[performance-engineer]` is used (no resolver chain)

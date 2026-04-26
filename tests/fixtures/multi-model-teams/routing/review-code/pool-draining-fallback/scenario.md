# Scenario (f): pool-draining-fallback

## Summary

`/synthex:review-code` is invoked. The pool `review-pool-c` appears idle in `index.json`, but when the submitter re-reads `config.json` (per-pool metadata), it discovers `pool_state: draining`. The submitter detects the drain and returns `fell-back-pool-draining`. The command falls back to fresh-spawn review.

## Inputs

### Pool State (index.json)
- Pool `review-pool-c` with `pool_state: idle` (stale snapshot)

### Pool Config (config.json — re-read by submitter)
- `pool_state: draining` (real state — pool is shutting down)

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- `target: staged`

## Expected Outputs

- `routing_decision: fell-back-pool-draining`
- `pool_name: review-pool-c` (the pool that was found draining)
- `fallback_type: fresh-spawn`
- `audit_decision: fell-back-pool-draining`
- No error emitted (`error: null`, `error_shown: false`)

## Assertions

- `routing_decision === "fell-back-pool-draining"`
- `audit_decision === "fell-back-pool-draining"`
- `pool_name === "review-pool-c"` (pool identified in audit)
- `error` is null
- `error_shown === false`
- `pool_config_json.pool_state === "draining"` (verifies the mismatch condition)

## Acceptance Criteria Covered

- Submitter detects drain via re-read of config.json (not stale index)
- `prefer-with-fallback` mode falls back gracefully on draining pool
- Audit records `fell-back-pool-draining` with pool name

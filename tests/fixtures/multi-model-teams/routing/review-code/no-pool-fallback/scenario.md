# Scenario (c): no-pool-fallback

## Summary

`/synthex:review-code` is invoked but `index.json` is empty (no pools). Config uses `prefer-with-fallback`. The command falls back silently to fresh-spawn review — no error is emitted.

## Inputs

### Pool State (index.json)
- `pools: []` (empty — no standing pools registered)

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- No `--reviewers` flag
- `target: staged`

## Expected Outputs

- `routing_decision: fell-back-no-pool`
- `pool_name: null` (no pool to route to)
- `multi_model: null`
- No routing notification emitted
- `fallback_type: fresh-spawn`
- No error emitted (`error: null`, `error_shown: false`)

## Assertions

- `routing_decision === "fell-back-no-pool"`
- `pool_name` is null
- `error` is null
- `error_shown === false`
- `fallback_type === "fresh-spawn"`

## Acceptance Criteria Covered

- `prefer-with-fallback` routing mode silently falls back when no pool is available
- No error is raised; audit records the fallback decision
- Fresh-spawn review proceeds normally

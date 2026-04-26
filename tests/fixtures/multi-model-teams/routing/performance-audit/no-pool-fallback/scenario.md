# Scenario (b): no-pool-fallback

## Summary

`/synthex:performance-audit` is invoked. A pool exists but its roster is `[code-reviewer]` — it does not cover the required reviewer set `[performance-engineer]`. Config uses `prefer-with-fallback`. The command falls back silently to fresh-spawn review with no error emitted.

## Inputs

### Pool State (index.json)
- Pool `code-review-pool` with roster `[code-reviewer]` (wrong roster — does not cover `performance-engineer`)
- `pool_state: idle`
- `multi_model: false`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- `scope: full-stack`
- Required reviewer set is static: `[performance-engineer]`

## Expected Outputs

- `routing_decision: fell-back-roster-mismatch` (pool exists but roster does not cover required set)
- `pool_name: null` (no matching pool selected)
- `multi_model: null`
- No routing notification emitted
- `fallback_type: fresh-spawn`
- No error emitted (`error: null`, `error_shown: false`)

## Assertions

- `routing_decision === "fell-back-roster-mismatch"`
- `pool_name` is null
- `error` is null
- `error_shown === false`
- `fallback_type === "fresh-spawn"`

## Acceptance Criteria Covered

- `prefer-with-fallback` routing mode silently falls back when no pool covers the required reviewer set
- No error is raised; fresh-spawn review proceeds normally
- Roster mismatch (pool exists but doesn't cover `[performance-engineer]`) produces `fell-back-roster-mismatch`

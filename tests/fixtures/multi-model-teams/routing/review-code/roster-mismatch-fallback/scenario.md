# Scenario (d): roster-mismatch-fallback

## Summary

`/synthex:review-code` is invoked. A standing pool (`perf-pool`) exists but its roster is `[performance-engineer]` — it does not cover the required reviewers `code-reviewer` and `security-reviewer`. The command falls back to fresh-spawn review and the audit records `fell-back-roster-mismatch`.

## Inputs

### Pool State (index.json)
- Pool `perf-pool` with roster `[performance-engineer]`
- `pool_state: idle`
- `multi_model: false`
- `last_active_at: 2026-04-26T05:00:00Z`
- `ttl_minutes: 60`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Command Args
- Required reviewers (hardcoded fallback): `code-reviewer, security-reviewer`
- `target: staged`

## Expected Outputs

- `routing_decision: fell-back-roster-mismatch`
- `pool_name: null` (no matching pool)
- `fallback_type: fresh-spawn`
- `audit_decision: fell-back-roster-mismatch` (recorded in audit)
- No error emitted (`error: null`, `error_shown: false`)

## Assertions

- `routing_decision === "fell-back-roster-mismatch"`
- `audit_decision === "fell-back-roster-mismatch"`
- `pool_name` is null
- `error` is null
- `error_shown === false`
- The pool in index has `roster: ["performance-engineer"]` (verifying the mismatch condition)

## Acceptance Criteria Covered

- Discovery detects roster does not cover required reviewers
- `prefer-with-fallback` mode falls back gracefully
- Audit records `fell-back-roster-mismatch` decision

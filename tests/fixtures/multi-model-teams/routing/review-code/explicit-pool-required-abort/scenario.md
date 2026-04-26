# Scenario (e): explicit-pool-required-abort

## Summary

`/synthex:review-code` is invoked. No matching pool exists. `routing_mode` is `explicit-pool-required`. The command aborts with the verbatim FR-MMT17 error — no fallback to fresh-spawn reviewers.

## Inputs

### Pool State (index.json)
- `pools: []` (empty — no standing pools)

### Config
- `standing_pools.enabled: true`
- `routing_mode: explicit-pool-required`
- `matching_mode: covers`

### Command Args
- Required reviewers (hardcoded fallback): `code-reviewer, security-reviewer`
- `target: staged`

## Expected Outputs

- `routing_decision: skipped-routing-mode-explicit`
- `abort: true`
- `error_shown: true`
- Verbatim error message (FR-MMT17):

```
No standing pool matches the required reviewers (code-reviewer, security-reviewer).
Routing mode is 'explicit-pool-required', so this command will not fall back to
fresh-spawn reviewers. To proceed, either:
  1. Start a matching pool:
       /synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer
  2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
```

## Assertions

- `routing_decision === "skipped-routing-mode-explicit"`
- `abort === true` (command does not proceed)
- `error_shown === true`
- All five verbatim fragments from `error_contains` are present in error_message
- The error is NOT a fallback — it is an abort

## Acceptance Criteria Covered

- FR-MMT17: verbatim explicit-pool-required error text
- `explicit-pool-required` mode aborts the command (does not fall back)
- All remediation hints present: start-review-team suggestion and config change suggestion

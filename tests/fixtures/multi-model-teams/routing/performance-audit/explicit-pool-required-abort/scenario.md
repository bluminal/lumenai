# Scenario (c): explicit-pool-required-abort

## Summary

`/synthex:performance-audit` is invoked. No matching pool exists (`index.json` is empty). `routing_mode` is `explicit-pool-required`. The command aborts with the verbatim FR-MMT17 error referencing `performance-engineer` — no fallback to fresh-spawn reviewers.

## Inputs

### Pool State (index.json)
- `pools: []` (empty — no standing pools registered)

### Config
- `standing_pools.enabled: true`
- `routing_mode: explicit-pool-required`
- `matching_mode: covers`

### Command Args
- `scope: full-stack`
- Required reviewer set is static: `[performance-engineer]`

## Expected Outputs

- `routing_decision: skipped-routing-mode-explicit`
- `abort: true`
- `error_shown: true`
- Verbatim error message (FR-MMT17):

```
No standing pool matches the required reviewers (performance-engineer).
Routing mode is 'explicit-pool-required', so this command will not fall back to
fresh-spawn reviewers. To proceed, either:
  1. Start a matching pool:
       /synthex-plus:start-review-team --reviewers performance-engineer
  2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
```

## Assertions

- `routing_decision === "skipped-routing-mode-explicit"`
- `abort === true` (command does not proceed)
- `error_shown === true`
- All five verbatim fragments from `error_contains` are present in `error_message`
- `error_message` references `performance-engineer` as the required reviewer
- The error is NOT a fallback — it is an abort

## Acceptance Criteria Covered

- FR-MMT17: verbatim explicit-pool-required error text with `performance-engineer`
- `explicit-pool-required` mode aborts the command (does not fall back)
- Remediation hint 1: `start-review-team` with `--reviewers performance-engineer`
- Remediation hint 2: config change suggestion to `prefer-with-fallback`

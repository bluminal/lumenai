# Scenario (i): wait-under-60s

## Summary

`/synthex:review-code` is invoked in a TTY environment. A matching pool exists (`review-pool-fast`). The actual wait is only 30 seconds — below the 60s threshold. Even though stdout IS a TTY, the waiting indicator must NOT be emitted because the 60s threshold was not crossed.

## Inputs

### Pool State (index.json)
- Pool `review-pool-fast` with roster `[code-reviewer, security-reviewer]`
- `pool_state: idle`
- `multi_model: false`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Runtime Environment
- `stdout_is_tty: true` (interactive terminal)
- `actual_wait_seconds: 30` (below 60s threshold — pool completes quickly)

### Command Args
- `target: staged`

## Expected Outputs

- `routing_decision: routed-to-pool`
- `pool_name: review-pool-fast`
- `waiting_indicator_emitted: false` (60s threshold not crossed)
- `waiting_indicator_text: null`
- `submission_completed: true`
- No error

## Assertions

- `routing_decision === "routed-to-pool"`
- `waiting_indicator_emitted === false`
- `waiting_indicator_text` is null
- `runtime.stdout_is_tty === true` (TTY, yet indicator suppressed because wait < 60s)
- `runtime.actual_wait_seconds < 60` (threshold not crossed)
- `submission_completed === true`

## Acceptance Criteria Covered

- Task 55 Item 3: 60s threshold — waiting indicator only emitted when wait >= 60s
- Even in TTY mode, indicator is suppressed if pool completes within 60s

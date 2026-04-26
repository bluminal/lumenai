# Scenario (g): tty-suppressed-waiting-indicator

## Summary

`/synthex:review-code` is invoked in a CI environment where stdout is NOT a TTY. A matching pool exists and is used (`review-pool-ci`). The expected wait is 90 seconds (above the 60s threshold). Despite the long wait, the waiting indicator must NOT be emitted because stdout is not a TTY.

## Inputs

### Pool State (index.json)
- Pool `review-pool-ci` with roster `[code-reviewer, security-reviewer]`
- `pool_state: idle`
- `multi_model: false`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Runtime Environment
- `stdout_is_tty: false` (CI simulation — not a terminal)
- `expected_wait_seconds: 90` (above 60s threshold)

### Command Args
- `target: staged`

## Expected Outputs

- `routing_decision: routed-to-pool`
- `pool_name: review-pool-ci`
- `waiting_indicator_emitted: false` (suppressed — not a TTY)
- `waiting_indicator_text: null` (nothing emitted)
- `submission_completed: true`
- No error

## Assertions

- `routing_decision === "routed-to-pool"`
- `waiting_indicator_emitted === false`
- `waiting_indicator_text` is null (indicator not present in output)
- `runtime.stdout_is_tty === false` (verifies suppression condition)
- `runtime.expected_wait_seconds > 60` (wait exceeds threshold, yet indicator still suppressed)
- `submission_completed === true`

## Acceptance Criteria Covered

- Task 55 Item 3: waiting indicator is CI-friendly (suppressed when stdout is not a TTY)
- TTY conditional suppression — even when wait > 60s threshold, no indicator emitted in CI

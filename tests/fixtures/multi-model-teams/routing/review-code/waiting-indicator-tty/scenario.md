# Scenario (h): waiting-indicator-tty

## Summary

`/synthex:review-code` is invoked in a TTY environment. A matching pool exists (`review-pool-tty`). The expected wait is 90 seconds (above the 60s threshold). The waiting indicator must be emitted every 30 seconds with the verbatim text:

```
Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete...
```

## Inputs

### Pool State (index.json)
- Pool `review-pool-tty` with roster `[code-reviewer, security-reviewer]`
- `pool_state: idle`
- `multi_model: false`

### Config
- `standing_pools.enabled: true`
- `routing_mode: prefer-with-fallback`
- `matching_mode: covers`

### Runtime Environment
- `stdout_is_tty: true` (interactive terminal)
- `expected_wait_seconds: 90` (above 60s threshold)
- `indicator_interval_seconds: 30`

### Command Args
- `target: staged`

## Expected Outputs

- `routing_decision: routed-to-pool`
- `pool_name: review-pool-tty`
- `waiting_indicator_emitted: true`
- Verbatim template: `Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete...`
- Sample output: `Pool 'review-pool-tty' working: 1/2 tasks complete...`
- `indicator_interval_seconds: 30`
- `submission_completed: true`
- No error

## Assertions

- `routing_decision === "routed-to-pool"`
- `waiting_indicator_emitted === true`
- `waiting_indicator_verbatim_template` matches Task 55 Item 3 verbatim
- `waiting_indicator_sample` contains pool name and task progress format
- `runtime.stdout_is_tty === true` (TTY condition met)
- `runtime.expected_wait_seconds > 60` (wait exceeds 60s threshold)
- `indicator_interval_seconds === 30`
- `submission_completed === true`

## Acceptance Criteria Covered

- Task 55 Item 3: verbatim waiting indicator text
- TTY condition: indicator emitted when stdout IS a TTY
- 60s threshold: indicator emitted when wait > 60s
- 30s interval: indicator repeats every 30 seconds

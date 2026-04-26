# Scenario: stop-with-inflight

## Summary
Pool has 1 in-progress task. User runs `/stop-review-team --name review-pool --force`. The `--force` flag bypasses the in-flight warning. Pool stopped immediately.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | Invoked with name="review-pool", force=true |
| 2 | `inflight_check` | 1 in-progress task found; force=true → warning suppressed |
| 3 | `shutdown_sent` | SendMessage type:shutdown dispatched to Pool Lead |
| 4 | `confirmation_shown` | Result: "force_stopped" |

## Assertions

- Frame 2: `warning_shown === false` (force=true suppresses it)
- Frame 3: `message_type === "shutdown"` sent to Pool Lead
- Frame 4: `result === "force_stopped"`

## Acceptance Criteria Covered
- --force flag suppresses in-flight warning
- Shutdown signal dispatched correctly

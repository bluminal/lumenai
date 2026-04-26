# Scenario: stop-no-args-cancel

## Summary
Same as stop-no-args-interactive but user responds "cancel". No changes: index.json unchanged, no shutdown signal sent.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | No params |
| 2 | `table_displayed` | Table shown before prompt |
| 3 | `user_prompted` | User responds "cancel" |
| 4 | `aborted_cleanly` | index_changed: false; shutdown_sent: false; result: "cancelled" |

## Assertions

- Frame 4: `index_changed === false` AND `shutdown_sent === false`
- Frame 4: `result === "cancelled"`

## Acceptance Criteria Covered
- Cancel response aborts without side effects
- No writes, no signals on user cancellation

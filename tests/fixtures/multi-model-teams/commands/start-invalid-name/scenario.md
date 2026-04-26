# Scenario: start-invalid-name

## Summary
User runs `/start-review-team --name Review_Pool` (underscore not allowed by regex `^[a-z0-9][a-z0-9-]{0,47}$`). Command aborts before any filesystem write.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | Invoked with name="Review_Pool" (uppercase + underscore) |
| 2 | `validation_failed` | Name fails regex; verbatim error message emitted |
| 3 | `aborted_no_fs_write` | Command exits with no config.json, no index.json update, no lock acquired |

## Assertions

- Frame 2: `error_message` contains `"Pool name '"`, `"is invalid"`, and `"Names must be 1–48"`
- Frame 3: `config_json_written === false`, `index_updated === false`, `lock_acquired === false`

## Acceptance Criteria Covered
- T2: Pool name regex enforced
- T3: Verbatim rejection message text emitted

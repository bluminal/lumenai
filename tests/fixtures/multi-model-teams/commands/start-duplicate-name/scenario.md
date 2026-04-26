# Scenario: start-duplicate-name

## Summary
User runs `/start-review-team --name review-pool` but `~/.claude/teams/standing/review-pool/` already exists. Command aborts with duplicate-name error and suggests remediation.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | Invoked with name="review-pool" |
| 2 | `pre_flight_failed` | Pre-flight detects existing pool directory at expected path |
| 3 | `aborted_duplicate` | Error message names the conflict and suggests /list-teams or /stop-review-team |

## Assertions

- Frame 3: `error_message` references `"/list-teams"` or `"/stop-review-team"` as remediation hint

## Acceptance Criteria Covered
- T1 Step 1 (pre-flight): duplicate name detected before any writes
- Remediation messaging guides the user toward resolution

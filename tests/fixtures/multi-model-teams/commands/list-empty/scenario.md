# Scenario: list-empty

## Summary
No active teams exist. `/list-teams` shows a friendly empty message with a hint on how to create a pool.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | No teams in `~/.claude/teams/`, no standing pools in index.json |
| 2 | `output_shown` | Output: empty standing_pools list, empty non_standing_teams list, helpful empty_message |

## Assertions

- Frame 2: `standing_pools` is an empty array
- Frame 2: `empty_message` is a non-empty string containing "start" or "create" hint

## Acceptance Criteria Covered
- Graceful empty state with actionable guidance

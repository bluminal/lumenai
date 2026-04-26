# Scenario: list-with-mixed-states

## Summary
`/list-teams` with 4 standing pools in different states (idle, active, draining, stopping) plus 1 non-standing team. All state variants represented in a single output.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | Index has 4 pools + 1 non-standing team |
| 2 | `output_shown` | Output: 4 standing_pools entries; 1 non_standing_teams entry; ttl_remaining_minutes for each |

## Assertions

- Frame 2: `standing_pools` has exactly 4 entries
- Frame 2: pool_state values `["idle","active","draining","stopping"]` all represented (sorted comparison)
- Frame 2: `ttl_remaining_minutes === 0` for draining and stopping pools
- Frame 2: `non_standing_teams` has exactly 1 entry

## Acceptance Criteria Covered
- All four pool_state variants represented and visible
- TTL display correct for terminal states

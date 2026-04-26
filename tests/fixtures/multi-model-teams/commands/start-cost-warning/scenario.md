# Scenario: start-cost-warning

## Summary
User runs `/start-review-team --reviewers code-reviewer,security-reviewer,performance-engineer,design-system-agent` (4 reviewers). Roster size ≥ 4 triggers D16 cost advisory. User accepts (Y).

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | Invoked with 4-reviewer roster |
| 2 | `cost_warning_shown` | Advisory displayed before spawning; user prompted to continue |
| 3 | `user_accepted` | User responds Y |
| 4 | `confirmation_shown` | Pool spawned; cost_warning_shown: true recorded in output |

## Assertions

- Frame 2: `advisory_text` contains "Heads up: this pool will keep", "idle for up to", "minutes", "Continue?"
- Frame 4: `cost_warning_shown === true`

## Acceptance Criteria Covered
- D16 / T9: Cost advisory verbatim text; triggered at 4 reviewers

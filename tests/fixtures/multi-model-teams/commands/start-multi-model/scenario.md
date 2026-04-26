# Scenario: start-multi-model

## Summary
User runs `/start-review-team --multi-model --reviewers code-reviewer,security-reviewer,performance-engineer`. Multi-model preflight returns a warning-level issue (only 1 external CLI configured). User continues (Y).

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | Invoked with multi_model=true and 3 explicit reviewers |
| 2 | `preflight_warning` | Preflight returned warning; user prompted "Continue spawning pool? [Y/n]", responds "Y" |
| 3 | `lock_acquired` | `.index.lock` acquired |
| 4 | `metadata_written` | config.json written with multi_model=true |
| 5 | `spawn_prompts_composed` | Pool Lead gets all 3 overlays; reviewer spawn prompts get Identity Confirm + Multi-Model only |
| 6 | `confirmation_shown` | multi_model: true confirmed in output |

## Assertions

- Frame 5: Pool Lead spawn prompt contains all three overlays: Identity Confirm, Multi-Model, Lifecycle
- Frame 5: Reviewer spawn prompt contains Identity Confirm + Multi-Model but NOT Lifecycle overlay (negative check)

## Acceptance Criteria Covered
- T11: Identity Confirm Overlay present for all agents
- T12: Lifecycle Overlay present for Pool Lead
- T13: Lifecycle Overlay NOT in reviewer prompts
- T14: Multi-Model overlay present when multi_model=true

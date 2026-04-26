# Scenario: stop-no-args-interactive

## Summary
User runs `/stop-review-team` with no arguments. Command shows standing-pools table first, then prompts for pool name. User picks "review-pool". Pool stops cleanly.

## Frames

| # | Event | Description |
|---|-------|-------------|
| 1 | `command_invoked` | No params |
| 2 | `table_displayed` | Standing-pools table shown BEFORE prompt |
| 3 | `user_prompted` | AskUserQuestion: "Which pool would you like to stop? Enter pool name or 'cancel' to abort:"; user responds "review-pool" |
| 4 | `shutdown_sent` | SendMessage type:shutdown to Pool Lead of "review-pool" |
| 5 | `confirmation_shown` | result: "stopped_cleanly"; pre_prompt_table_shown: true |

## Assertions

- Frame 2: `table_shown === true` (before prompt)
- Frame 3: `prompt_text === "Which pool would you like to stop? Enter pool name or 'cancel' to abort:"`
- Frame 5: `pre_prompt_table_shown === true`

## Acceptance Criteria Covered
- Table displayed before prompt (UX ordering)
- Verbatim prompt text
- Clean stop flow

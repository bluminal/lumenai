# Scenario: non-interactive-tty-false

## Summary

Team init runs in a CI/non-interactive environment where TTY is unavailable (`tty: false`). Both optional prompts (Steps 7 and 8) are auto-skipped without blocking. No config keys are written for either optional feature. The command completes without user interaction.

## Environment

| Variable | Value |
|----------|-------|
| tty | false |

## User Responses

None — prompts are skipped automatically.

## Expected Outcomes

- Neither `standing_pools` nor `multi_model_review.per_command.team_review` keys written
- `auto_skip_applied: true` — command skipped interactive prompts without blocking
- `blocking: false` — init completes without waiting for user input
- `config_keys_added` is empty

## Acceptance Criteria Covered

- FR-MMT27: non-interactive (CI) safety — optional prompts must not block in TTY=false environments
- Consistent with team-init non-destructive design: all steps produce warnings, never failures

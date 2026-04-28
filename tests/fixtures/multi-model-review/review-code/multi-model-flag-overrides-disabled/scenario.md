# Scenario (d): multi-model-flag-overrides-disabled

## Overview

The project configuration has `multi_model_review.enabled: false` and
`per_command.review_code.enabled: false`. The user explicitly passes `--multi-model` at
invocation time. FR-MR6 mandates that CLI flags override resolved configuration.

## FR-MR6 Contract

FR-MR6 defines the flag-override precedence rule:

  `--multi-model` / `--no-multi-model` flags at invocation > `per_command.review_code.enabled`
  > `multi_model_review.enabled` > default (false)

When `--multi-model` is supplied, the command must behave as if
`multi_model_review.enabled: true` and `per_command.review_code.enabled: true` regardless
of what the config file says.

## Expected Behavior

- Config says: `enabled: false`
- Flag says: `--multi-model`
- Resolved effective config after flag: **multi-model enabled**
- Multi-model branch taken; orchestrator invoked
- `path_and_reason_header` reflects multi-model routing

## Assertions

- `invocation_flags["--multi-model"]` is `true`
- `resolved_config_before_flag` is `"multi-model-disabled"`
- `resolved_config_after_flag` is `"multi-model-enabled"`
- expected_output shows external reviewers in per_reviewer_results
- path_and_reason_header passes D21 regex

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Config (disabled), flag (`--multi-model`), FR-MR6 override evidence |
| `expected_output.json` | Expected envelope with multi-model execution |
| `scenario.md` | This document |

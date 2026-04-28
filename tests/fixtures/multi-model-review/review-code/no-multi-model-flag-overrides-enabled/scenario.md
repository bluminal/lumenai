# Scenario (e): no-multi-model-flag-overrides-enabled

## Overview

The project configuration has `multi_model_review.enabled: true` and the diff (89 lines,
4 files) would trigger multi-model through the complexity gate. However, the user explicitly
passes `--no-multi-model` at invocation time. FR-MR6 mandates that CLI flags override
resolved configuration — the native-only branch is taken.

## FR-MR6 Contract

FR-MR6 defines the flag-override precedence rule:

  `--multi-model` / `--no-multi-model` flags at invocation > `per_command.review_code.enabled`
  > `multi_model_review.enabled` > default (false)

When `--no-multi-model` is supplied, the command must behave as if both
`multi_model_review.enabled: false` regardless of the config file or whether the
complexity gate would have escalated.

## Expected Behavior

- Config says: `enabled: true`
- Complexity gate says: above threshold (89 lines, 4 files) → would escalate
- Flag says: `--no-multi-model`
- Resolved effective config after flag: **multi-model disabled**
- Native-only branch taken; no external adapters invoked
- `path_and_reason_header` reflects native-only routing

## Note on path_and_reason_header

The header reads "below-threshold diff" because the command reports the native-only reason
from the gate's perspective after the override is applied — the gate is effectively not
evaluated for escalation when `--no-multi-model` is in effect. The specific reason text may
vary in the final implementation; this fixture tests the structural outcome.

## Assertions

- `invocation_flags["--no-multi-model"]` is `true`
- `resolved_config_before_flag` is `"multi-model-enabled"`
- `resolved_config_after_flag` is `"multi-model-disabled"`
- expected_output contains ONLY native-team entries in per_reviewer_results
- No external reviewer appears in per_reviewer_results
- path_and_reason_header passes D21 regex

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Config (enabled), flag (`--no-multi-model`), FR-MR6 override evidence |
| `expected_output.json` | Expected native-only envelope |
| `scenario.md` | This document |

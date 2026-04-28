# Fixture (b): severity-two-level-diff

## What this tests

Stage 5 severity reconciliation (FR-MR14a) when reviewers disagree by two or more severity levels — triggering the judge step.

## Setup

One consolidated finding (`security.processPayment.unvalidated-amount`) raised by two reviewers:
- `security-reviewer` (native/anthropic) assessed severity: **critical**
- `gemini-review-prompter` (external/google) assessed severity: **low**

Gap = 3 levels (critical=4, low=1).

## Expected behavior

1. Stage 5 computes severity gap: |4 - 1| = 3.
2. Gap (3) >= `stage5_two_level_gap_threshold` (2) → **judge step IS triggered**.
3. Judge step produces a reconciled severity: `medium` (plausible given split).
4. `severity_range` is populated: `{min: "low", max: "critical"}` (full raw spread).
5. `severity_reasoning` is populated with the judge's CoT explanation (non-empty string).

## Acceptance assertions

- `expected_stage5_output.severity == "medium"` (judge verdict)
- `expected_stage5_output.severity_range.min == "low"`
- `expected_stage5_output.severity_range.max == "critical"`
- `expected_stage5_output.severity_reasoning` is a non-empty string
- `expected_stage5_output.judge_step_triggered == true`

## FR/Spec reference

- FR-MR14a: Severity reconciliation — judge step for >= 2-level gap
- Task 28: Stage 5 implementation

# Fixture (a): severity-one-level-diff

## What this tests

Stage 5 severity reconciliation (FR-MR14a) when reviewers disagree by exactly one severity level.

## Setup

One consolidated finding (`security.validateToken.weak-signature-algorithm`) raised by two reviewers:
- `security-reviewer` (native/anthropic) assessed severity: **high**
- `codex-review-prompter` (external/openai) assessed severity: **medium**

Gap = 1 level (high=3, medium=2 on a 4-point scale: critical=4, high=3, medium=2, low=1).

## Expected behavior

1. Stage 5 computes severity gap: |3 - 2| = 1.
2. Gap (1) < `stage5_two_level_gap_threshold` (2) → judge step NOT triggered.
3. Stage 5 takes the **max** severity: `high`.
4. `severity_range` is populated: `{min: "medium", max: "high"}` (populated whenever reviewers disagree).
5. `severity_reasoning` is `null` (no judge step, no CoT reasoning to record).

## Acceptance assertions

- `expected_stage5_output.severity == "high"` (max wins)
- `expected_stage5_output.severity_range.min == "medium"`
- `expected_stage5_output.severity_range.max == "high"`
- `expected_stage5_output.severity_reasoning == null` (no judge step)
- `expected_stage5_output.judge_step_triggered == false`

## FR/Spec reference

- FR-MR14a: Severity reconciliation — max + range for sub-threshold gaps
- Task 28: Stage 5 implementation

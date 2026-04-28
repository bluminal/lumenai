# Fixture (e): minority-of-one-non-security-demoted

## What this tests

Stage 6 minority-of-one detection (FR-MR14b) for a **non-security category** finding: severity is demoted one level when only one reviewer raised it and no exemption applies.

## Setup

One consolidated finding (`correctness.calculateDiscount.off-by-one-boundary`):
- Category: `correctness`
- Severity: `high`
- Confidence: `medium`
- `raised_by`: exactly 1 entry (only `code-reviewer`)

This is a minority-of-one finding in a non-security category.

## Expected behavior

1. Stage 6 detects minority-of-one: `raised_by.length == 1`.
2. Stage 6 checks category: `correctness` → **no exemption applies**.
3. Demotion **fires**: severity reduced one level from `high` → `medium`.
4. `severity_demoted: true`, `original_severity: "high"`, `demoted_to: "medium"`.
5. `demotion_reason: "minority_of_one_non_security"`.

## Demotion rule

- Severity scale: critical(4) → high(3) → medium(2) → low(1)
- One-level demotion: high becomes medium, medium becomes low, low stays low
- Only security category is exempt; all other categories (correctness, performance, style, maintainability, reliability) are subject to demotion

## Acceptance assertions

- `expected_stage6_output.severity == "medium"` (demoted from high)
- `expected_stage6_output.severity_demoted == true`
- `expected_stage6_output.original_severity == "high"`
- `expected_stage6_output.minority_of_one == true`
- `expected_stage6_output.exemption_applied == null` (no exemption)

## FR/Spec reference

- FR-MR14b: Stage 6 minority-of-one detection — standard demotion path
- Task 30: Stage 6 implementation

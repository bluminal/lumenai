# Fixture (d): minority-of-one-security-not-demoted

## What this tests

Stage 6 minority-of-one detection (FR-MR14b) with the **security category exemption**: a security finding raised by only one reviewer is NOT demoted because security findings are exempt from minority-of-one demotion.

## Setup

One consolidated finding (`security.resetPassword.token-not-single-use`):
- Category: `security`
- Severity: `high`
- Confidence: `medium`
- `raised_by`: exactly 1 entry (only `security-reviewer`)

This is a minority-of-one finding: only one reviewer raised it.

## Expected behavior

1. Stage 6 detects minority-of-one: `raised_by.length == 1`.
2. Stage 6 checks category: `security` → **security exemption fires**.
3. Demotion is **skipped** — severity remains `high`.
4. `exemption_applied: "security_category_exemption"` recorded in output metadata.
5. `severity_demoted: false`.

## Rationale for security exemption

Security findings may only be raised by one reviewer because other reviewers missed the vulnerability — not because the finding is incorrect. Demoting a legitimate security finding based on the minority-of-one rule would create false confidence. Therefore security-category findings are exempt from minority-of-one demotion.

## Acceptance assertions

- `expected_stage6_output.severity == "high"` (unchanged)
- `expected_stage6_output.severity_demoted == false`
- `expected_stage6_output.minority_of_one == true`
- `expected_stage6_output.exemption_applied == "security_category_exemption"`

## FR/Spec reference

- FR-MR14b: Stage 6 minority-of-one detection with security exemption
- Task 30: Stage 6 implementation

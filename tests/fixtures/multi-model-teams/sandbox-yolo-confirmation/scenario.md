# Scenario: sandbox-yolo configured + spawn-time confirmation prompt

**Surface:** `/synthex-plus:start-review-team` Step 5a, `/synthex:review-code` Step 1c, `/synthex:performance-audit` Step 1c (Task 83).
**Permission mode:** `sandbox-yolo` (Pattern 2 / ADR-003 / D27 / FR-MMT21)
**Trigger:** Any CLI in the resolved roster has `multi_model_review.external_permission_mode.<cli-name>: sandbox-yolo`.

## Flow under test

1. Project's `.synthex/config.yaml` overrides the default and sets `multi_model_review.external_permission_mode.gemini: sandbox-yolo`.
2. The user invokes `/synthex:review-code` (or one of the other two commands) with a roster that includes the gemini adapter.
3. After routing is resolved (Step 1b), the command enters Step 1c (or Step 5a for start-review-team).
4. The command displays the verbatim warning string per D25 / NFR-MMT7:
   `⚠ gemini is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.`
5. The command prompts: `Continue review with sandbox-yolo CLI(s)? [y/N]`
6. If the user enters `y`: continue to the next workflow step.
7. If the user enters `n` (or just presses Enter — default N): abort cleanly without invoking any reviewer.

## Why this matters

This fixture pins the trust-boundary UX: the user must explicitly opt into Pattern 2 every
time the command runs in sandbox-yolo configuration. The verbatim warning string is locked
per D25 / NFR-MMT7 (string copy locked), and the default-N semantics ensure that
unattended runs (e.g., scripted invocations, CI) abort by default rather than silently
escalating to full tool permissions.

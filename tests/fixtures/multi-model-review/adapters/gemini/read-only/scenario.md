# Scenario: Gemini `--approval-mode default` invocation (Pattern 1)

**Adapter:** `gemini-review-prompter`
**Permission mode:** `read-only` (Pattern 1 / ADR-003 / D27 / FR-MMT21)
**CLI invocation:** `gemini -p "<prompt>" --approval-mode default --output-format json`

## Flow under test

1. Adapter resolves `multi_model_review.external_permission_mode.gemini` → `read-only` (the default per Task 82's defaults.yaml).
2. Adapter invokes Gemini with `--approval-mode default` so headless (non-interactive) invocation denies and excludes every tool that requires confirmation — shell exec, file writes, and other destructive actions — because there is no TTY to confirm on (Task 25 / FR-HM44; supersedes a removed prior-generation flag probe, which never worked because neither of the flags it looked for exists in the Gemini CLI).
3. Gemini reads the prompt + bundle, performs the review entirely in its own context (no tool-use), and emits a JSON envelope on stdout shaped `{ response, stats, error? }`; the adapter unwraps `.response` to reach the findings array and usage.
4. Adapter parses the unwrapped JSON, normalizes findings into the canonical envelope per FR-MR8 Step 7, and returns success.

## Why this matters

This is the v1 happy-path for Pattern 1 — the universal safe default for adapters that
lack native parent-mediated approval proxying. `--approval-mode default` is the trust boundary; no destructive tool-use can occur even if the model attempts it, because headless
mode has no TTY to approve on. The fixture proves the documented invocation flag set is
asserted in the recorded CLI invocation string and that the canonical envelope normalization
preserves Pattern 1's safety guarantees.

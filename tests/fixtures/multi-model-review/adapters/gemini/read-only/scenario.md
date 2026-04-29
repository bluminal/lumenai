# Scenario: Gemini `--readonly` invocation (Pattern 1)

**Adapter:** `gemini-review-prompter`
**Permission mode:** `read-only` (Pattern 1 / ADR-003 / D27 / FR-MMT21)
**CLI invocation:** `gemini -p "<prompt>" --output-format json --readonly`

## Flow under test

1. Adapter resolves `multi_model_review.external_permission_mode.gemini` → `read-only` (the default per Task 82's defaults.yaml).
2. Adapter invokes Gemini with `--readonly` so the CLI cannot execute tools that write to disk or perform destructive actions.
3. Gemini reads the prompt + bundle, performs the review entirely in its own context (no tool-use), and emits a JSON envelope on stdout containing the findings array and usage.
4. Adapter parses the JSON, normalizes findings into the canonical envelope per FR-MR8 Step 7, and returns success.

## Why this matters

This is the v1 happy-path for Pattern 1 — the universal safe default for adapters that
lack native parent-mediated approval proxying. The `--readonly` flag is the trust boundary;
no destructive tool-use can occur even if the model attempts it. The fixture proves the
documented invocation flag set is asserted in the recorded CLI invocation string and that
the canonical envelope normalization preserves Pattern 1's safety guarantees.

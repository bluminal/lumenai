# Scenario: Codex `app-server` requestApproval flow proxied to parent (Pattern 3)

**Adapter:** `codex-review-prompter`
**Permission mode:** `parent-mediated` (Pattern 3 / ADR-003 / D27 / FR-MMT21)
**CLI invocation:** `codex app-server --json <prompt>`

## Flow under test

1. Adapter resolves `multi_model_review.external_permission_mode.codex` → `parent-mediated` (the default per Task 82's defaults.yaml).
2. Adapter probes `codex app-server --help` (exit 0) and invokes `codex app-server --json <prompt>`.
3. Codex emits a JSON-RPC `requestApproval` message on stdout (proposing to read `src/secrets/keys.ts`).
4. Adapter intercepts the message and surfaces it as a fenced `codex-approval-request` block to the parent Claude session.
5. Parent decides `approve` (with no argument modification) and SendMessages the decision to the adapter.
6. Adapter writes a JSON-RPC `result` envelope to Codex's stdin.
7. Codex completes the review and emits a final findings envelope (one `security` finding, normalized into the canonical envelope by Step 7 of FR-MR8).

## Why this matters

This is the v1 happy-path for Pattern 3. It validates that the documented protocol round-trip
(`requestApproval` → fenced block → parent decision → JSON-RPC `result` → continued execution)
is correctly described in the agent markdown — the structural contract reviewers depend on.

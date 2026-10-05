# Scenario: parent-mediated resolves to read-only (Pattern 3 not implemented)

**Adapter:** `codex-review-prompter`
**Permission mode:** `parent-mediated` (the shipped default for `codex`, ADR-003 / D27 / FR-MMT21)
**Effective pattern:** Pattern 1 (read-only)
**CLI invocation:** `codex exec --sandbox read-only --ephemeral ...` (see `recorded-cli-invocation.txt`)

## Flow under test

1. Adapter resolves `multi_model_review.external_permission_mode.codex` to `parent-mediated` (the default in defaults.yaml).
2. Pattern 3 would have to drive the real `codex app-server` protocol: `initialize`, then `thread/start`, then `turn/start` with the prompt, proxying `item/commandExecution/requestApproval`, `item/fileChange/requestApproval` and the other approval requests to the parent session, and collecting `turn/completed`. The adapter does not implement that, so it logs one WARN line and runs Pattern 1.
3. The adapter does not probe `codex app-server --help`. On Codex CLI 0.160.0 that command exits 0, so a probe-based fallback would always pick the unimplemented Pattern 3.
4. `codex exec` writes the schema-shaped answer to the `-o` last-message file, and its JSONL stream ends with `turn.completed` carrying usage. Step 5 normalizes both into the canonical envelope (`expected-envelope.json`).

## Why this matters

An earlier revision documented a Pattern 3 flow built on a bare `requestApproval` JSON-RPC method and a terminal `result` message. Neither exists in the Codex app-server protocol (`codex app-server generate-json-schema`), and the `--help` probe never fell back, so the default configuration could not produce a review. This fixture pins the working default: parent-mediated runs read-only and says so.

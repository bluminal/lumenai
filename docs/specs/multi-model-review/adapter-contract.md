# Adapter Contract — Input/Output Envelope (FR-MR9)

> The canonical envelope contract that every multi-model review adapter (`*-review-prompter`) must conform to. Defines the input shape (what the orchestrator sends), the output shape (what the adapter returns), and the error_code enum (FR-MR16).

## Status: Normative

## Source Authority

- FR-MR9 (input/output envelope)
- FR-MR16 (error_code enum)
- NFR-MR4 (usage object surfaces verbatim from CLI envelope)
- D14 (every adapter registered in plugin.json)
- Cross-reference: [`canonical-finding-schema.md`](../../../plugins/synthex/agents/_shared/canonical-finding-schema.md) — the schema for entries in `findings[]`

## Related Documentation

- [`architecture.md`](./architecture.md) — Overall multi-model review architecture (Task 3)
- `adapter-recipes.md` — Per-adapter install/auth (forthcoming, Task 50)
- `failure-modes.md` — error_code reference and fallback flows (forthcoming, Task 51)

---

## 1. Input Envelope (orchestrator → adapter)

The orchestrator invokes each adapter via the Task tool with this JSON shape:

```json
{
  "command": "review-code | write-implementation-plan",
  "context_bundle": {
    "manifest": { "...": "..." },
    "files": [
      { "path": "...", "content": "...", "summarized": false }
    ]
  },
  "config": {
    "model": "<resolved model id>",
    "family": "<family override or null>",
    "raw_output_path": "docs/reviews/raw/<adapter>-<uuid>.json"
  }
}
```

### Field semantics

- **command** — informs the adapter which command-context it's serving; used in prompt selection (review-code's "diff review" prompt vs. write-implementation-plan's "plan review" prompt).
- **context_bundle** — assembled by `context-bundle-assembler` (Task 5); identical across all proposers in a given invocation per D5.
- **config.model** — resolved model id (e.g., `gpt-5`, `gemini-2.5-pro`, `qwen2.5-coder:32b`).
- **config.family** — optional family tag override; null means use the adapter's default.
- **config.raw_output_path** — adapter MUST write its raw CLI output here for audit trail (FR-MR24 §6).

---

## 2. Output Envelope (adapter → orchestrator)

The adapter returns this JSON shape:

```json
{
  "status": "success | failed",
  "error_code": null,
  "error_message": null,
  "findings": [
    {
      "finding_id": "...",
      "severity": "critical | high | medium | low",
      "category": "...",
      "title": "...",
      "description": "...",
      "file": "...",
      "symbol": "... | null",
      "line_range": null,
      "source": {
        "reviewer_id": "<adapter agent name>",
        "family": "<family>",
        "source_type": "external"
      },
      "confidence": "low | medium | high"
    }
  ],
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "model": "<echoed model id>"
  },
  "raw_output_path": "docs/reviews/raw/<adapter>-<uuid>.json"
}
```

### Field semantics

- **status** — `success` means findings array is well-formed (may be empty if no issues found); `failed` means the adapter could not complete its review.
- **error_code** — REQUIRED when `status: "failed"`; MUST be one of the FR-MR16 enum below. NULL when `status: "success"`.
- **error_message** — human-readable detail when failed. NULL when success.
- **findings** — array of canonical findings per `canonical-finding-schema.md`. May be empty array on success (clean review).
- **usage** — surfaces the CLI's reported token usage VERBATIM per NFR-MR4. When the CLI does not report usage, the adapter sets the entire `usage` object to `null`.
- **raw_output_path** — echo of the input config; confirms the adapter wrote its raw output where requested.

### `findings[]` source attribution

Every finding from an external adapter MUST set `source.source_type: "external"`. The `source.reviewer_id` MUST match the adapter's agent name (e.g., `codex-review-prompter`, `gemini-review-prompter`). The `source.family` reflects the adapter's declared family (or the user's `family:` override per Q5).

---

## 3. error_code Enum (FR-MR16)

When `status: "failed"`, `error_code` MUST be one of:

| Value | Meaning | Trigger |
|-------|---------|---------|
| `cli_missing` | The adapter's CLI is not installed or not in PATH | `which <cli>` returns non-zero |
| `cli_auth_failed` | The CLI is installed but not authenticated | Adapter-specific auth check fails |
| `cli_failed` | The CLI ran but returned a non-zero exit | Subprocess exited with status ≠ 0 |
| `parse_failed` | The CLI returned output but it could not be parsed into the canonical envelope | JSON parse error or schema mismatch after retry |
| `timeout` | The adapter exceeded its per-reviewer timeout | Per-reviewer timeout fires |
| `sandbox_violation` | The CLI attempted an operation forbidden by the sandbox flags | Sandbox enforcement |
| `unknown_error` | Catch-all for unexpected failures | Last-resort fallback |

Adapters MUST NOT introduce new error_code values. Any new failure mode requires updating FR-MR16 and this contract.

### Retry behavior

`parse_failed` triggers a single retry with an appended clarification prompt (FR-MR8 step 3). If the retry also fails to parse, `error_code: parse_failed` is returned terminally.

`cli_missing`, `cli_auth_failed`, and `sandbox_violation` are NOT retried — they are terminal.

`timeout`, `cli_failed`, and `unknown_error` are NOT automatically retried by the adapter; the orchestrator may surface them to FR-MR17 native-only continuation logic.

---

## 4. Examples

### Example 1: successful review with findings

```json
{
  "status": "success",
  "error_code": null,
  "error_message": null,
  "findings": [
    {
      "finding_id": "security.handleLogin.missing-csrf-check",
      "severity": "high",
      "category": "security",
      "title": "Missing CSRF check in handleLogin",
      "description": "The handleLogin function does not validate CSRF tokens.",
      "file": "src/auth/handleLogin.ts",
      "symbol": "handleLogin",
      "source": {
        "reviewer_id": "codex-review-prompter",
        "family": "openai",
        "source_type": "external"
      }
    }
  ],
  "usage": {
    "input_tokens": 4521,
    "output_tokens": 312,
    "model": "gpt-5"
  },
  "raw_output_path": "docs/reviews/raw/codex-abc123.json"
}
```

### Example 2: clean review (success, no findings)

```json
{
  "status": "success",
  "error_code": null,
  "error_message": null,
  "findings": [],
  "usage": { "input_tokens": 4521, "output_tokens": 89, "model": "gpt-5" },
  "raw_output_path": "docs/reviews/raw/codex-abc124.json"
}
```

### Example 3: CLI missing

```json
{
  "status": "failed",
  "error_code": "cli_missing",
  "error_message": "The 'gemini' CLI is not installed. See adapter-recipes.md for installation.",
  "findings": [],
  "usage": null,
  "raw_output_path": "docs/reviews/raw/gemini-abc125.json"
}
```

### Example 4: parse_failed (terminal after retry)

```json
{
  "status": "failed",
  "error_code": "parse_failed",
  "error_message": "Adapter could not parse codex output as canonical envelope after retry. Raw output preserved at raw_output_path.",
  "findings": [],
  "usage": { "input_tokens": 4521, "output_tokens": 156, "model": "gpt-5" },
  "raw_output_path": "docs/reviews/raw/codex-abc126.json"
}
```

---

## 5. Validation Surface

Layer 1 validators MUST enforce:

- `status` ∈ {`success`, `failed`}
- When `status: "failed"`, `error_code` MUST be in the FR-MR16 enum (no null, no unknown values)
- When `status: "success"`, `error_code` MUST be null
- `findings[]` entries MUST validate against `canonical-finding-schema.md`
- `usage` MUST be either `null` or an object with `input_tokens`, `output_tokens`, `model` (NFR-MR4)

Implemented in `tests/schemas/adapter-envelope.ts` (Task 11). This document is the source of truth for that validator.

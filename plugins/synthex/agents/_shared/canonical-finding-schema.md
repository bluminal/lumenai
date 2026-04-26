# Canonical Finding Schema

> The normative contract for the shape of every finding flowing through the multi-model review orchestrator. All proposers (native + external adapters) emit findings conforming to this schema. The orchestrator's consolidation pipeline consumes them.

## Status: Normative

## Source authority

- FR-MR13 (multi-model-review.md)
- D17 (aggregator tier table — uses `family` field)
- D18 (Stage 4 — uses `finding_id` for fingerprint dedup)

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://synthex.bluminal.dev/schemas/canonical-finding.json",
  "title": "Canonical Finding",
  "type": "object",
  "required": ["finding_id", "severity", "category", "title", "description", "file", "source"],
  "additionalProperties": false,
  "properties": {
    "finding_id": {
      "type": "string",
      "description": "Stable identifier for fingerprint dedup (Stage 1). MUST NOT contain line numbers — line numbers shift across edits and would break dedup.",
      "pattern": "^[a-z0-9][a-z0-9._:-]*$",
      "not": { "pattern": ":\\d+|L\\d+|line[-_]\\d+" }
    },
    "severity": {
      "type": "string",
      "enum": ["critical", "high", "medium", "low"]
    },
    "category": {
      "type": "string",
      "description": "e.g. security, correctness, performance, style, maintainability, reliability"
    },
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "description": { "type": "string", "minLength": 1 },
    "file": { "type": "string", "minLength": 1 },
    "symbol": { "type": ["string", "null"] },
    "line_range": {
      "type": ["object", "null"],
      "required": ["start", "end"],
      "properties": {
        "start": { "type": "integer", "minimum": 1 },
        "end": { "type": "integer", "minimum": 1 }
      }
    },
    "source": {
      "type": "object",
      "required": ["reviewer_id", "family", "source_type"],
      "properties": {
        "reviewer_id": { "type": "string", "minLength": 1 },
        "family": { "type": "string", "minLength": 1, "description": "openai | google | anthropic | local-<model> | etc." },
        "source_type": {
          "type": "string",
          "enum": ["native-team", "external", "native-recovery"]
        }
      }
    },
    "confidence": {
      "type": "string",
      "enum": ["low", "medium", "high"]
    },
    "raised_by": {
      "type": "array",
      "description": "Populated post-consolidation: list of reviewer attributions for this consolidated finding.",
      "items": {
        "type": "object",
        "required": ["reviewer_id", "family", "source_type"],
        "properties": {
          "reviewer_id": { "type": "string" },
          "family": { "type": "string" },
          "source_type": { "type": "string", "enum": ["native-team", "external", "native-recovery"] }
        }
      }
    },
    "superseded_by_verification": { "type": "boolean" },
    "verification_reasoning": { "type": "string" }
  }
}
```

## Field semantics

- **finding_id** — Stable identifier for Stage 1 fingerprint dedup. MUST NOT include line numbers (line numbers shift across edits, breaking dedup). Recommended pattern: `<category>.<symbol>.<short-slug>` (e.g., `security.handleLogin.missing-csrf-check`).
- **severity** — One of four levels. Stage 5 reconciles divergent severities across reviewers per FR-MR14a.
- **source** — Identifies the proposer that emitted the finding. `source_type` distinguishes native team members, external adapters, and recovered findings (FR-MMT24).
- **raised_by** — Empty when emitted by a single proposer; populated by the orchestrator's consolidation stages with the full attribution list after dedup/merge.
- **superseded_by_verification** — Set by Stage 5 contradiction-CoVe (Task 29b) when a finding loses an adjudicated contradiction.

## Examples

### Valid finding (single proposer, pre-consolidation)
```json
{
  "finding_id": "security.handleLogin.missing-csrf-check",
  "severity": "high",
  "category": "security",
  "title": "Missing CSRF check in handleLogin",
  "description": "The handleLogin function does not validate CSRF tokens, allowing cross-site request forgery.",
  "file": "src/auth/handleLogin.ts",
  "symbol": "handleLogin",
  "source": {
    "reviewer_id": "security-reviewer",
    "family": "anthropic",
    "source_type": "native-team"
  }
}
```

### Invalid finding (line number in finding_id — breaks fingerprint dedup)
```json
{
  "finding_id": "security.handleLogin:42",
  ...
}
```
`finding_id` contains `:42` — INVALID. Line numbers belong in `line_range` only.

### Invalid finding (missing required source)
```json
{
  "finding_id": "security.handleLogin.missing-csrf-check",
  "severity": "high",
  "category": "security",
  "title": "Missing CSRF check",
  "description": "...",
  "file": "src/auth/handleLogin.ts"
}
```
Missing required `source` field — INVALID.

## Used by

- Task 7 (context-bundle.ts schema validator — references finding shape)
- Task 11 (adapter-envelope.ts validator — findings array entries match this schema)
- Task 22 (orchestrator-output.ts validator — consolidated findings include raised_by populated)
- Task 24 (Stage 1 fingerprint dedup — reads finding_id)
- Task 26 (Stage 4 LLM tiebreaker — reads finding_id, source.family)

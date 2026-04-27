# Scenario: Successful Ollama Review (Text-Only Tier)

## What Is Tested

The adapter successfully completes the full happy-path flow for a local Ollama invocation:

1. `which ollama` returns a valid binary path AND HTTP probe to `http://localhost:11434/api/tags`
   succeeds (FR-MR8 step 1 — CLI Presence Check passes).
2. Auth check is N/A — Ollama runs locally with no remote auth (FR-MR8 step 2 — skipped).
3. Prompt is constructed from `command: "review-code"` and `context_bundle` (FR-MR8 step 3).
4. POST to `http://localhost:11434/api/generate` with `format: <canonical-finding-json-schema>`
   to get schema-constrained structured output (FR-MR8 step 4).
5. `response.response` parses as valid JSON; one finding parses successfully (FR-MR8 step 5).
6. No retry needed (FR-MR8 step 6 — skipped).
7. Finding is normalized: `source.reviewer_id = "ollama-review-prompter"`,
   `source.family = "local-qwen2.5-coder"`, `source.source_type = "external"` (FR-MR8 step 7).
8. Canonical envelope is returned with `status: "success"`, one finding, verbatim usage object
   (NFR-MR4), and echoed `raw_output_path` (FR-MR8 step 8).

## Text-Only Tier

Ollama is `capability_tier: text-only`. This means the context bundle assembled by
`context-bundle-assembler` is the **only** context Ollama sees. Unlike `agentic` adapters
(codex, gemini) that can autonomously read files inside their sandboxes, Ollama has no
autonomous file-reading capability. Bundle-only context is the sole input.

## Family Resolution (Dynamic Pattern)

The `family` field uses the dynamic pattern `local-<configured-model>`. It is NOT a static
value — it is resolved at orchestrator-time from
`multi_model_review.per_reviewer.ollama-review-prompter.model` in `.synthex/config.yaml`.

In this fixture, the configured model is `qwen2.5-coder:32b`, so the resolved family is
`local-qwen2.5-coder` (the tag suffix `:32b` is stripped, keeping only the base model name).

Other examples of resolved families:
- `local-llama3.2` (when model is `llama3.2`)
- `local-deepseek-v3` (when model is `deepseek-v3`)

## Usage Mapping (NFR-MR4)

Ollama's HTTP response includes token counts using its own field names. The adapter maps
these verbatim to the canonical usage object:

| Ollama field        | Canonical field  | Value in this fixture |
|---------------------|------------------|-----------------------|
| `prompt_eval_count` | `input_tokens`   | 6240                  |
| `eval_count`        | `output_tokens`  | 287                   |
| `model`             | `model`          | `qwen2.5-coder:32b`   |

When `prompt_eval_count` or `eval_count` are absent (older Ollama versions may omit them),
the entire `usage` object is set to `null`.

## Sandbox Flags

Sandbox flags are **not applicable** to Ollama. Ollama runs as a local server with no
remote network or filesystem access beyond model storage. There are no `--sandbox` or
`--approval-mode` flags in the invocation.

## FR-MR26 Parity Check (HTTP API Form)

Per FR-MR26, the parity assertion for Ollama substitutes "documented HTTP API invocation
string" for "documented sandbox flags" (sandbox flags do not apply to local execution).

The parity check asserts:
- `recorded-cli-invocation.txt` contains the HTTP API endpoint `http://localhost:11434/api/generate`
- The same endpoint string appears verbatim in `plugins/synthex/agents/ollama-review-prompter.md`
  (the adapter's source-authority document)

This confirms the recorded invocation string is consistent with the documented adapter
behavior — a direct analog to the sandbox-flag substring match used for codex/gemini.

## Fixture Files

- `fixture.json` — recorded raw Ollama HTTP response body (the `ollama_raw_response` object)
- `recorded-cli-invocation.txt` — exact HTTP API call (`curl`) recorded for this invocation
- `expected_envelope.json` — normalized canonical envelope the adapter must produce
- `scenario.md` — this file; narrative description of what this fixture exercises

# G3: normal review with `--json-schema` (D30 evidence)

**Purpose:** decide whether `--json-schema` works together with D25's `--deny '*'` (U10).

**Prompt:** the same review prompt and diff as G2. The argv adds `--json-schema` with a strict findings schema: the canonical finding fields minus `source`, every field required, `additionalProperties: false`, and enums for `severity` and `confidence`.

**Observed:** exit 0 in 65 s (G2 took 21 s), with empty stderr. The wrapper had `stopReason: "end_turn"`, `num_turns: 1` and a top-level `structuredOutput` object with 3 schema-valid findings. `.text` holds the same JSON, serialized. `--deny '*'` did not block the structured-output mechanism.

**Expected runner mapping:**
- Incomplete-run guard passes.
- `structuredOutput` is present, so the runner serializes it and passes it to `validate-findings`. The result is `status: success` with 3 findings, and `source` is injected with family `xai`.
- `--usage-json` gets `{"input_tokens": 10944, "output_tokens": 5108, "model": "grok-4.7-build"}`.

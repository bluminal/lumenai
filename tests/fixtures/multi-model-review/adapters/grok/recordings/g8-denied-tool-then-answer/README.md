# G8: denied tool attempt, then an answer (U26)

**Purpose:** measure how many turns a text-only review needs when the model tries a tool anyway.

**Prompt:** the same neutral file-read request as G7, with `--max-turns 3`.

**Observed:** exit 0 in 20 s with empty stderr. `stopReason` was `end_turn`, with `num_turns: 2` and `modelCalls: 2`. The tool attempt was denied, and the denial was returned to the model, which then answered on turn 2. Its finding explains that the only tool call was "denied by a permission policy that blocks every tool". The target file's contents did not appear, and the scratch dir held only `prompt.txt`. The canary value did not appear in any output.

`.text` is a prose preamble followed directly by the JSON object, with no separator or code fence: `I'll open the review target and quote its first line in the finding.{"findings": [...]}`.

**Expected runner mapping:**
- Incomplete-run guard passes (`end_turn`).
- Text path: `validate-findings` returns `parse_failed`, because it tolerates prose only around a fenced block. The runner retries once (a billed call).
- With `--json-schema` (D30 recommendation), the answer would land in `structuredOutput`. This case was not recorded with the schema.
- The run cost 2 model calls, roughly twice G2's input tokens.

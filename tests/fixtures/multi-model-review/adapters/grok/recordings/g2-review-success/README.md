# G2: normal review (text path)

**Purpose:** the success baseline under the full D25 flag set (minus `--sandbox`; see `../sandbox-read-only-refused`), with `--max-turns 3`.

**Prompt:** a review instruction ("You have NO tools", "Respond with ONLY a JSON object") followed by a small diff of `src/users.js` with two planted defects: SQL built by string concatenation, and a retry loop that swallows every error.

**Observed:** exit 0 in 21 s with empty stderr. The wrapper had `stopReason: "end_turn"` and `num_turns: 1`, and `.text` was bare JSON holding 4 findings. They covered both planted defects (`critical` SQL injection and `high` swallowed errors) plus two related `retryFetch` issues. `modelUsage` was keyed `grok-4.7-build`, and `total_cost_usd` was present on this grok.com session.

**Expected runner mapping:**
- Incomplete-run guard passes (`end_turn`, exit 0, no `max turns reached`).
- No `structuredOutput`, so the runner unwraps `.text`. `validate-findings` returns `status: success` with 4 findings and `source.family: xai`.
- `--usage-json` gets `{"input_tokens": 11093, "output_tokens": 1758, "model": "grok-4.7-build"}`. `input_tokens` is uncached only, per the Grok headless docs.
- Passing the whole wrapper to `validate-findings` without unwrapping it returns `success` with 0 findings today. That is the D32 gap Task 66 closes.

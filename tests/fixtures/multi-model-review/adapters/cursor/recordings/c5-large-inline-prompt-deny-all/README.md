# C5: 158,339-byte inline prompt with the deny file (U19, decision b)

**Purpose:** check that a large review prompt can go inline as the argv prompt, so the `review-input.txt` file route is unnecessary.

**Prompt:** the normal review prompt plus 1,500 filler "context" lines, 158,339 bytes in total, passed inline. `<scratch>/.cursor/cli.json` held `../deny-all.cli.json`. In this recording the `user` event's text is replaced by `<158339-byte prompt>`, and `argv.txt` uses the same placeholder.

**Observed:** exit 0 after 31 s wall clock (`duration_ms` 21,024), empty stderr.
- No tool calls. `result.result` is bare JSON with 3 findings, covering both planted defects.
- `usage`: `inputTokens` 51,996, `outputTokens` 497, `cacheReadTokens` 512.
- The scratch dir held only `.cursor/cli.json`.

**Expected runner mapping:** `success`, 3 findings.

**Platform caveat:** recorded on macOS, where `ARG_MAX` is 1 MiB (shared with the environment). Linux caps a single argument at 131,072 bytes (`MAX_ARG_STRLEN`), so a prompt this size would fail at exec there. See decision (b) in the spike report.

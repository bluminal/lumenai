# C3b: normal review, Auto model

**Purpose:** the baseline. The normal review prompt with `--model auto` (the only model the Free plan allows) and no deny file.

**Prompt:** the same 1,094-byte review prompt as C3. It tells the model it has no tools and asks for bare JSON.

**Observed:** exit 0 after 20 s wall clock (`duration_ms` 13,692), empty stderr, empty scratch dir.
- Event sequence: `system:init`, `user`, 23 `thinking:delta`, `thinking:completed`, one `assistant`, `result:success`. No tool calls.
- `result.result` is the bare findings JSON (3 findings, covering both planted defects). It equals the only `assistant` message.
- `usage`: `inputTokens` 16,490, `outputTokens` 576, `cacheReadTokens` 0, `cacheWriteTokens` 0. That is about 16k input tokens for a 1 KB prompt, so Cursor's own system prompt dominates the cost of a small review.
- `system:init`: `model: "Auto"`, `permissionMode: "default"` (despite `--mode ask`), `apiKeySource: "login"`.

**Expected runner mapping:** `success`, 3 findings, unwrapped from the last `assistant` message. Usage via `--usage-json`: `input_tokens` = `inputTokens`, `output_tokens` = `outputTokens`, and `model` = the configured slug (`init.model` is a display name, here `Auto`).

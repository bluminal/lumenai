# C8: 158,339-byte prompt on stdin with the deny file (U18, decision b)

**Purpose:** check that `cursor-agent -p` reads its prompt from stdin when argv carries no prompt argument. If it does, the prompt avoids Linux's 131,072-byte limit on a single argument (`MAX_ARG_STRLEN`) and needs no size guard.

**Prompt:** the same 158,339-byte prompt as C5, fed on stdin; argv ends at `--model auto`. `<scratch>/.cursor/cli.json` held `../deny-all.cli.json`. In this recording the `user` event's text is replaced by `<158339-byte prompt>`, and `argv.txt` shows the redirect with a placeholder.

**Observed:** exit 0 after 17 s wall clock (`duration_ms` 11,688), empty stderr.
- Event sequence: `system:init`, `user`, 26 `thinking:delta`, `thinking:completed`, one `assistant`, `result:success`. No tool calls.
- The `user` event echoed the whole prompt, byte for byte the text C5 passed inline, so stdin was read in full.
- `result.result` is bare JSON with 3 findings, covering both planted defects. It equals the only `assistant` message.
- `usage`: `inputTokens` 49,308, `outputTokens` 669, `cacheReadTokens` 3,200.
- The meta file recorded only the exit code, the seconds and the scratch path: `$W` was not listed and the canary marker was not checked.

**Expected runner mapping:** `success`, 3 findings, unwrapped from the last `assistant` message.

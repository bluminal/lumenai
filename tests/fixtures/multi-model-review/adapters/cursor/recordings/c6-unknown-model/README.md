# C6: unknown model

**Purpose:** record the error for a slug the account cannot use.

**Prompt:** the normal review prompt, with `--model not-a-real-model`.

**Observed:** exit 1 after 2 s.
- stdout is empty: no `system:init` and no `user` echo, so no session started and no prompt was sent.
- stderr is one line, `Cannot use this model: not-a-real-model. Available models: auto, gpt-5.3-codex-low, …`. It names the account's full slug list, the same list as `../c2-models.txt`.

**Expected runner mapping:** `cli_failed`. The message names the configured slug and points the user at `cursor-agent models`; the runner truncates the slug list. This is not `cli_auth_failed`: the brief's auth regex does not match this stderr. No retry.

# G9: invalid model id

**Purpose:** record the error shape for a run that fails before any prompt reaches the model.

**Argv:** the D25 set plus `-m grok-nonexistent-model`.

**Observed:** exit 1 within 1 s. stdout was a single line, `{"type":"error","message":"Couldn't set model 'grok-nonexistent-model': Invalid params: \"unknown model id\". Run 'grok models' to see available models."}`, and stderr repeated the message after `Error: `. There was no `stopReason`, `usage` or cost field.

**Expected runner mapping:** `cli_failed`, with `.message` (truncated) as the error message.
- The auth regex must not match this message. It names `grok models`, not `grok login`.
- Passing this object to `validate-findings` unchanged returns `success` with 0 findings today (the D32 gap). The runner must branch on `.type == "error"` before parsing.

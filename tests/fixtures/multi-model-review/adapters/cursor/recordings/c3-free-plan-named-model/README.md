# C3: named model on the Free plan (D26, decision e)

**Purpose:** run the production argv shape (D26: an explicit, non-Auto model) on this account, which is on Cursor's Free plan.

**Prompt:** the normal review prompt (1,094 bytes; a diff with two planted defects), inline, with `--model gemini-3.7-flash-high`. No deny file.

**Observed:** exit 1 after 6 s.
- stdout holds only `system:init` (`model: "Gemini 3.7 Flash High"`, `permissionMode: "default"`, `apiKeySource: "login"`) and the `user` echo of the prompt. There is no `result` event and no usage.
- stderr: `ActionRequiredError: Named models unavailable Free plans can only use Auto. Switch to Auto or upgrade plans to continue.`
- The scratch dir stayed empty, and the canary marker was not created.

The stream echoed the prompt before the plan check failed, so assume the bundle reached Cursor even though nothing was reviewed.

**Expected runner mapping:**
- `cli_failed`, not `cli_auth_failed`: the login is valid, and the brief's auth regex (`/not authenticated|login/i`) does not match this stderr.
- The message is actionable: Cursor's Free plan allows only Auto, so `cursor-review-prompter` needs a paid Cursor plan for a named model; otherwise remove it from `reviewers`. D26 is kept, so the runner never falls back to Auto.
- No retry.

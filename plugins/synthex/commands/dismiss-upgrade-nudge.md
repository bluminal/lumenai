---
model: haiku
---

# Dismiss Synthex Upgrade Nudge

Silence the synthex SessionStart upgrade nudge for this project. After running this command, the one-line nudge that appears on session start (when synthex has been upgraded across a feature-introducing version threshold) will not print again — even on future sessions where the threshold check would otherwise fire.

The dismiss flag is durable across version updates per FR-UO23. To un-dismiss, manually delete `.synthex/state.json` and re-run `/synthex:configure-multi-model` to opt back into nudges.

This command takes no arguments. It is idempotent — running it twice in a row is safe.

## Workflow

### 1. Resolve paths

- `project_root` = `$CLAUDE_PROJECT_DIR` if set, else `pwd`
- `state_file` = `<project_root>/.synthex/state.json`
- `plugin_json` = the synthex plugin manifest (resolve relative to this command's plugin)

Read `current_version` from the synthex `plugin.json` `version` field. If `plugin.json` cannot be read, exit with a one-line error: `Could not read synthex plugin.json. The dismiss state was not written.` Do NOT create state without a version.

### 2. Ensure `.synthex/` directory exists

- If `<project_root>/.synthex/` does not exist, print: `No .synthex/ directory in this project. Run /synthex:init first.` Exit without creating files.
- If `.synthex/` exists, proceed.

### 3. Read existing state (if any)

If `<project_root>/.synthex/state.json` exists:
  - Parse it. If parse fails (malformed JSON), treat as missing — overwrite per FR-UO18.
  - Read `last_seen_version` from the file. If absent, fall back to `current_version`.
If the file does not exist:
  - `last_seen_version` defaults to `current_version` (we have no history).

### 4. Write the dismissed state

Atomically write the following to `<project_root>/.synthex/state.json` (use the **Write** tool):

```json
{
  "schema_version": 1,
  "last_seen_version": "<last_seen_version from step 3 or current_version>",
  "dismissed": true,
  "updated_at": "<current UTC ISO 8601 timestamp>"
}
```

Notes:
- Preserve `last_seen_version` from existing state if available; do not regress it. (The user may have last-seen an older version; preserving that history is harmless.)
- Always set `dismissed: true`.
- Always update `updated_at` to the current UTC timestamp.

### 5. Confirm

Print exactly:

```
Synthex upgrade nudge dismissed. The nudge will not print on future sessions for this project.

To re-enable nudges, delete .synthex/state.json. To configure multi-model review now, run /synthex:configure-multi-model.
```

## Anti-pattern: do NOT modify config

This command writes ONLY to `.synthex/state.json`. It does NOT modify `.synthex/config.yaml` and does NOT touch the `multi_model_review` block. Dismiss is a UX preference, not a configuration choice.

## Anti-pattern: do NOT prompt the user

This command takes no arguments and asks no questions. It performs a single deterministic write and prints a confirmation. Do NOT use `AskUserQuestion`.

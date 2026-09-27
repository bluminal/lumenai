---
model: haiku
---

# Dismiss Synthex Upgrade Nudge

Silence the synthex SessionStart upgrade nudge for this project. After running this command, the one-line nudge that appears on session start (when synthex has been upgraded across a feature-introducing version threshold) will not print again — even on future sessions where the threshold check would otherwise fire.

The dismiss flag is durable across version updates per FR-UO23. To un-dismiss, manually delete `.synthex/state.json` and re-run `/synthex:configure-multi-model` to opt back into nudges.

This command takes no arguments. It is idempotent — running it twice in a row is safe.

## Workflow (FR-HM18 — one Bash call)

### 1. Resolve paths

- `project_root` = `$CLAUDE_PROJECT_DIR` if set, else `pwd`
- `state_file` = `<project_root>/.synthex/state.json`

### 2. Ensure `.synthex/` directory exists

- If `<project_root>/.synthex/` does not exist, print: `No .synthex/ directory in this project. Run /synthex:init first.` Exit without running the script.
- If `.synthex/` exists, proceed.

### 3. Run the state-flag script

Run `plugins/synthex/scripts/state-flag.sh dismissed` (resolved from the installed plugin root — Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/state-flag.sh" dismissed`) as ONE Bash call. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

The script atomically sets `"dismissed": true` in `state_file`, reusing `upgrade-nudge.sh`'s field-preservation rules: every other existing field — including `last_seen_version` and `plugin_root` (both written by the upgrade-nudge hook) — is preserved untouched. Preserve `last_seen_version` from existing state if available; do not regress it (the user may have last-seen an older version; preserving that history is harmless). If `state.json` does not exist yet, or fails to parse (malformed JSON, FR-UO18), the script treats it as missing and creates a fresh document (`schema_version: 1`, `"dismissed": true`, `updated_at`) instead — idempotent either way.

**Fallback (no shell tool, or the script is missing):** use the **Write** tool to write `state_file` yourself: keep every existing field, set `"dismissed": true` and `updated_at` to the current UTC ISO 8601 time, and start from `{"schema_version": 1}` if the file is missing or malformed.

Interpret the script's exit code:
- `0` — success. Proceed to step 4.
- `2` — `.synthex/` does not exist (step 2 should already have caught this). Print the step 2 message.
- `5` — the state directory was not writable. Print: `Could not write .synthex/state.json — check directory permissions.` and stop.

### 4. Confirm

Print exactly:

```
Synthex upgrade nudge dismissed. The nudge will not print on future sessions for this project.

To re-enable nudges, delete .synthex/state.json. To configure multi-model review now, run /synthex:configure-multi-model.
```

## Anti-pattern: do NOT modify config

This command writes ONLY to `.synthex/state.json`. It does NOT modify `.synthex/config.yaml` and does NOT touch the `multi_model_review` block. Dismiss is a UX preference, not a configuration choice.

## Anti-pattern: do NOT prompt the user

This command takes no arguments and asks no questions. It performs a single deterministic write and prints a confirmation. Do NOT use `AskUserQuestion`.

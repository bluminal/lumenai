---
model: haiku
---

# Star the Lumenai Repository

Ask the user whether they'd like to star the Lumenai marketplace repository on GitHub, then help them do so. Stars increase visibility — more developers find the project, which means more eyes on new features and bug fixes. This command is friendly, idempotent, and non-blocking.

This command takes no arguments.

## Workflow

### 1. Resolve paths and check state

- `project_root` = `$CLAUDE_PROJECT_DIR` if set, else `pwd`
- `state_file` = `<project_root>/.synthex/state.json`
- `repo_url` = `https://github.com/bluminal/lumenai`

If `<project_root>/.synthex/` does not exist, print:

```
No .synthex/ directory in this project. Run /synthex:init first, or visit https://github.com/bluminal/lumenai to star the repo directly.
```

Then exit without writing state.

If `state.json` exists and contains `"starred": true`, print:

```
Thanks — you've already starred the Lumenai repo. ★
```

Then exit. (Idempotent: do not re-prompt.)

### 2. Ask the user

Use the `AskUserQuestion` tool with this question:

> **Would you like to star the Lumenai marketplace on GitHub?**
>
> Stars help us get the project in front of more developers — which means more eyeballs for new features and bug fixes. It takes about three seconds and means a lot to the Bluminal Labs team.
>
> Repo: https://github.com/bluminal/lumenai

Options:

1. **Yes, take me there** — Open the repo in your browser
2. **Maybe later** — Ask again on the next upgrade
3. **No thanks** — Don't ask again for this project

### 3. Apply the user's choice

#### Yes, take me there

1. Print the repo URL clearly so the user can click or copy it:

   ```
   Thank you! Visit this URL and click the ★ Star button in the top right:

     https://github.com/bluminal/lumenai

   ```

2. Attempt to open the URL in the user's default browser using a single, best-effort shell command (do NOT fail the command if this fails). Try platform-appropriate openers in order:

   - macOS: `open "https://github.com/bluminal/lumenai"`
   - Linux: `xdg-open "https://github.com/bluminal/lumenai"`
   - Windows (PowerShell): `Start-Process "https://github.com/bluminal/lumenai"`

   If none of the openers succeed, that's fine — the URL is already printed. Do not surface opener errors.

3. Set `starred: true` in `state_file` (FR-HM18 — one Bash call). Run `plugins/synthex/scripts/state-flag.sh starred` (resolved from the installed plugin root — Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/state-flag.sh" starred`). On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

   The script atomically sets `"starred": true`, reusing `upgrade-nudge.sh`'s field-preservation rules: every other existing field — `last_seen_version`, `dismissed`, `star_dismissed`, `plugin_root` — is preserved untouched.

   Interpret the exit code: `0` — success, proceed. `2` — `.synthex/` does not exist (already caught by step 1). `5` — the state directory was not writable; print `Could not write .synthex/state.json — check directory permissions.` and stop (the URL is already printed, so this is non-fatal to the user's ability to star manually).

#### Maybe later

Print:

```
No problem — we'll mention this again on the next upgrade.
```

Do NOT write state. The upgrade-nudge hook will surface this prompt again on the next version bump.

#### No thanks

1. Print:

   ```
   Got it — we won't ask again for this project. If you change your mind, the repo is at https://github.com/bluminal/lumenai.
   ```

2. Set `star_dismissed: true` in `state_file` (FR-HM18 — one Bash call). Run `plugins/synthex/scripts/state-flag.sh star_dismissed` (resolved from the installed plugin root — Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/state-flag.sh" star_dismissed`). On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

   The script atomically sets `"star_dismissed": true`, preserving every other existing field (`last_seen_version`, `dismissed`, `starred`, `plugin_root`) untouched.

   Interpret the exit code the same way as the "Yes, take me there" branch above: `0` success, `2` `.synthex/` missing (already caught by step 1), `5` writability failure (print the same message and stop).

## State schema

The `.synthex/state.json` file is per-developer/per-clone (gitignored). This command extends it with two optional fields:

| Field | Type | Meaning |
|-------|------|---------|
| `starred` | boolean | User accepted the star prompt and was directed to the repo |
| `star_dismissed` | boolean | User declined; suppress future star nudges |

If both are `false` (or absent), the upgrade-nudge hook will re-prompt on the next upgrade.

## Anti-pattern: do NOT actually star on the user's behalf

Starring a repo requires the user's GitHub credentials. This command must never attempt to call the GitHub API, run `gh api`, or otherwise simulate the star action — it only opens the URL and lets the user click the button themselves.

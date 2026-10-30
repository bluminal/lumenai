# Auto-Decide Mode (`next-priority --auto-decide`)

Read this only when `--auto-decide` is set. It adds to the directive in `next-priority.md` Step 5; it never touches `[H]` approval (Step 7).

## 1. Arm the hook (Claude Code only)

Before Step 1, run once:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/auto-decide-gate.sh" on
```

On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

If it fails (empty session id, or a host without the hook), carry on: the rest of this doc still applies, and you take recommended options yourself instead of asking.

The hook (`hooks/auto-decide-gate.md`) is a PreToolUse hook on `AskUserQuestion`, active only in the armed session. When every question has exactly one `(Recommended)` option and none mentions `[H]`, it answers with that option, skips the dialog, and logs the decision with `HEAD` before it to `.synthex/auto-decide/<session_id>.jsonl`. Any other question reaches the user as usual.

## 2. Mark your recommendation

Whenever you call `AskUserQuestion` — including relaying a Tech Lead escalation — label exactly one option per question `(Recommended)` if there is a recommendation. Never do this on an `[H]` approval question, and always put `[H]` in that question's text.

## 3. Commit trailer for every decision

Every auto-decision — answered by the hook or taken by an agent without asking — gets an `Auto-Decision: <question> => <choice>` trailer on the first commit after it:

```bash
git commit --trailer 'Auto-Decision: Which cache? => Redis' -F - <<'MSG'
feat(cache): add Redis read-through cache
MSG
```

`git log --grep '^Auto-Decision:'` finds the commit; `<sha>^` is the code before the decision. Merge with `--ff-only` or a merge commit, never a squash, so trailers survive.

## 4. Pull request

Any PR for work done under `--auto-decide` — opened now or later in the session — must start its description, before the summary, with a bold section:

```markdown
**Auto-decisions (made without asking — please review):**
- **Which cache?** → Redis (alternatives: Memcached, none) — `a1b2c3d`
```

Build it from `git log <base>..HEAD --format='%h %(trailers:key=Auto-Decision,valueonly,separator=%x3B )'` and the `.jsonl` log. If there were none, write `**Auto-decisions: none.**` List the same decisions first in your final report to the user.

## 5. Disarm

When the command finishes (under `--loop`, when the loop ends for any reason), run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/auto-decide-gate.sh" off`. The log stays.

On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

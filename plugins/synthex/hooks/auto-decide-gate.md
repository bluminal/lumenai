# PreToolUse hook: auto-decide-gate

Companion doc for `scripts/auto-decide-gate.sh`, the PreToolUse hook (matcher `AskUserQuestion`) behind `/synthex:next-priority --auto-decide`. The script header is the full contract.

## What it does

`next-priority --auto-decide` arms the hook for the current session (`auto-decide-gate.sh on` creates `.synthex/auto-decide/<session_id>.active`) and disarms it when the command ends (`off`). In any other session the hook does nothing.

In an armed session, an `AskUserQuestion` call is answered automatically when:

- every question has exactly one option whose label contains `(Recommended)`, and
- no question text or header contains `[H]`. Human-validated acceptance criteria always reach the user.

The hook then:

1. Appends one line per question to `.synthex/auto-decide/<session_id>.jsonl`: time, `before` (the `HEAD` commit before the decision), question, choice, alternatives, and the trailer line.
2. Returns `permissionDecision: "allow"` with `updatedInput.answers`, so the dialog never opens.
3. Returns `additionalContext` telling the model to add `Auto-Decision: <question> => <choice>` as a trailer on its next commit, and to list the decision at the top of the PR.

Anything else (no recommendation, two recommendations, `[H]`, no node, unreadable payload, unwritable log) exits 0 with no output, and the user is asked as usual.

## Finding a decision later

```bash
git log --grep '^Auto-Decision:' --format='%h %(trailers:key=Auto-Decision,valueonly)'
git checkout <sha>^   # the code before that decision
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Always in hook mode (fail open). The answer, if any, is in the JSON on stdout. |
| 1 | `on`/`off` only: `$CLAUDE_CODE_SESSION_ID` is empty. |

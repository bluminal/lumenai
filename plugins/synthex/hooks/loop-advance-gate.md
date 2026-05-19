# Loop Advance Gate (Stop hook)

> Behavioral spec for the Stop hook that prevents silent termination of Synthex `--loop` iterations. This is the runtime backstop for the prompt-side fixes in [`commands/loop.md`](../commands/loop.md) and [`commands/next-priority.md`](../commands/next-priority.md).

- Shell entry point: `plugins/synthex/scripts/loop-advance-gate.sh`
- Hook registration: `plugins/synthex/hooks/hooks.json` (event: `Stop`)
- Config: none — the gate is always on. To disable for a single loop, run `/synthex:cancel-loop <loop-id>`.

The shell shim contains the full enforcement logic (jq + grep). There is no LLM-side review step on Stop — by the time the hook fires, the model has already produced its final message; the gate's job is to either let the turn end or rewind the model with a `decision: "block"` reason.

---

## Why this hook exists

Without it, a session running `/synthex:next-priority --loop …` or `/synthex:loop …` can end mid-flight if the model finishes one iteration's workflow and ends the turn with text like "## Iteration 1 — Complete / re-fire to continue" rather than re-entering the iteration body inline. The framework is self-driven (the harness does NOT re-invoke between iterations), so any unguarded turn-end **silently breaks the loop** and forces the user to manually re-fire. Forensic analysis of session transcripts over April–May 2026 attributed ≥4 user re-fires across two projects to this single failure mode.

The prompt fixes in `commands/*.md` reduce the rate; this hook is the backstop for the residual cases where the model misreads the prompt or context-window pressure overrides the instructions.

---

## Trigger

Event: `Stop`. Fires every time the assistant signals end-of-turn while the user has not yet sent a new message.

Input (Claude Code Stop hook contract — JSON on stdin):

| Field | Type | Used for |
|-------|------|----------|
| `session_id` | string | Matching the active loop's `session_id` field |
| `transcript_path` | string | Reading the last assistant message |
| `cwd` | string | Locating `.synthex/loops/` |
| `stop_hook_active` | boolean | Suppressing re-fire (the hook never blocks twice in a row) |

---

## Skip conditions (in order — each exits 0 = allow stop)

1. **stdin empty** — caller is not Claude Code; exit 0.
2. **`jq` not on PATH** — cannot parse safely; exit 0. (Never block on tooling absence.)
3. **`stop_hook_active == true`** — the gate already fired this turn; exit 0 to avoid an infinite block loop.
4. **`.synthex/loops/` does not exist** — no loops in this project; exit 0.
5. **No state file with `status: "running"` AND `session_id == <hook's session_id>`** — no live loop in this session; exit 0. (Loops from sibling sessions are ignored — they belong to a different process.)
6. **Transcript file unreadable** — cannot determine the last assistant message; exit 0.
7. **Last assistant message empty** — nothing to scan; exit 0.

If any skip condition matches, the gate is silent. No stdout, no warning.

---

## Allow condition (after skips)

Allow the stop (exit 0) if either:

- **Iteration marker present:** the last assistant message contains the regex `\[loop <loop_id> iteration [0-9]+/[0-9]+\]` — the model advanced the iteration counter and printed the marker, which means the loop body ran at least once this turn. The next iteration (or terminal exit) will happen on the *next* Stop event, so this turn-end is fine.
- **Completion promise emitted:** the last assistant message contains the regex `<promise>\s*<completion_promise>\s*</promise>` (literal text from the state file's `completion_promise` field, with regex metacharacters escaped). This is the framework's designed termination signal.

Both checks are done on the concatenated `message.content[*].text` of the most recent transcript entry with `type == "assistant"`.

---

## Block condition

If a running loop exists for this session AND neither the iteration marker nor the promise tag is in the last assistant message, the gate writes a `decision: "block"` JSON object to stdout:

```json
{
  "decision": "block",
  "reason": "Synthex loop \"<loop_id>\" is status:running but this turn neither advanced the iteration counter (no `[loop <loop_id> iteration N/M]` marker in your last message) nor emitted `<promise><completion_promise></promise>`. The Synthex `--loop` framework is self-driven — re-enter the iteration body in the SAME turn (boundary check → increment + persist counter → print marker → execute workflow → emit promise OR loop back). Do NOT end your turn waiting for the user to re-fire; the harness does not re-invoke you. See plugins/synthex/commands/next-priority.md § \"Imperative Loop Protocol\" or plugins/synthex/commands/loop.md § 4 for the full per-iteration checklist. To stop the loop intentionally, either emit the completion promise on its own line or run `/synthex:cancel-loop <loop_id>`."
}
```

The model receives `reason` in its next decoding cycle and re-enters the loop body or emits the promise; the user is not interrupted.

`stop_hook_active` is set to `true` by Claude Code after a block, so the gate cannot fire twice in a row on the same turn — if the model still doesn't advance the loop on the second try (e.g., because it deliberately wants to abandon the loop), the stop is allowed and the loop state file remains `running`. The user can clean it up via `/synthex:cancel-loop`.

---

## Edge cases handled

- **macOS lacks `tac`** — the script uses `awk '{a[NR]=$0} END {for (i=NR;i>0;i--) print a[i]}'` to reverse the JSONL file, so it works on both Linux and macOS.
- **Promise text contains regex metacharacters** — escaped via `sed 's/[.[\*^$()+?{}|\\]/\\&/g'` before grep.
- **Multiple running loops in one session** — only the first one matched is enforced. If the model needs to advance loop A and emit the promise for loop B in the same turn, both signals can coexist; the gate just needs one of them in the last message for loop A to be satisfied. (Multi-loop per session is rare in practice.)
- **Stop hook fires after a subagent finishes** — `transcript_path` is the parent transcript, so the subagent's iteration marker (if it printed one) shows up in the parent's tool result block, not in `type == "assistant"` text. This means subagent-isolation loops (`--loop-isolated`) cannot rely on the marker to pass the gate; they should emit the promise or rely on the outer iteration boundary. The gate falls back to its skip conditions in that case.

---

## Exit code summary

| Exit code | Meaning | When |
|-----------|---------|------|
| 0 (with no stdout) | Allow stop | Any skip condition met, or iteration marker / promise found |
| 0 (with `{"decision":"block"}` on stdout) | Block stop | Running loop exists, neither marker nor promise present in last assistant message |

Non-zero exit codes are reserved — the script always exits 0 even on internal errors, by design (so a buggy hook never wedges the user's session).

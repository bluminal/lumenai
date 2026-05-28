# Loop Advance Gate (Stop hook)

> Behavioral spec for the Stop hook that drives Synthex `--loop` iterations. Synthex looping is **turn-per-iteration** (ADR-003): a `--loop` command does one iteration's work and may end its turn; this hook re-drives the next iteration by returning `decision: "block"`. The hook is the loop **engine**, not a one-shot backstop. It is the runtime counterpart to the prompt-side instructions in [`commands/loop.md`](../commands/loop.md) and [`commands/next-priority.md`](../commands/next-priority.md).

- Shell entry point: `plugins/synthex/scripts/loop-advance-gate.sh`
- Hook registration: `plugins/synthex/hooks/hooks.json` (event: `Stop`)
- Config: none — always on. Override the block cap with `SYNTHEX_LOOP_BLOCK_CAP` (default 7). To stop a loop intentionally, emit its completion promise or run `/synthex:cancel-loop <loop-id>`.

The shell shim contains the full enforcement logic (jq + grep). There is no LLM-side review step on Stop — by the time the hook fires, the model has already produced its final message; the gate's job is to either let the turn end or re-invoke the model with a `decision: "block"` reason.

---

## Why this hook exists

Synthex's looping is self-paced: the harness does not re-invoke the model between iterations. Without this hook, a session running `/synthex:next-priority --loop …` or `/synthex:loop …` dies the moment the model ends its turn mid-loop — e.g. with a hand-off like "The loop is still running at iteration 15/20. Want me to resume it now?". That is the single most common loop-breakdown pattern, and it cannot be reliably prevented with prose alone because ending the turn to consult the user is one of the model's strongest priors.

This hook makes the turn-end **recoverable**: it re-drives the next iteration instead of letting the loop silently stall. Per ADR-003, this mirrors how Claude Code's native `/goal` works (a prompt-based Stop hook that keeps the model working across turns), but uses a deterministic shell decision — Synthex already has a crisp completion signal (the `<promise>` tag and the state-file `status`), so no per-turn LLM evaluation is needed.

---

## Trigger

Event: `Stop`. Fires every time the assistant signals end-of-turn while the user has not yet sent a new message.

Input (Claude Code Stop hook contract — JSON on stdin):

| Field | Type | Used for |
|-------|------|----------|
| `session_id` | string | Matching the active loop's `session_id` field |
| `transcript_path` | string | Reading the last assistant message |
| `cwd` | string | Locating `.synthex/loops/` |
| `stop_hook_active` | boolean | **Not used.** Reading it to early-exit (the old behavior) yields after one block and silently breaks the loop — the bug ADR-003 fixes. Runaway is bounded by the progress-aware counter below, not by `stop_hook_active`. |

---

## Skip conditions (in order — each exits 0 = allow stop)

1. **stdin empty** — caller is not Claude Code; exit 0.
2. **`jq` not on PATH** — cannot parse safely; exit 0. (Never block on tooling absence.)
3. **`session_id` missing** — exit 0.
4. **`.synthex/loops/` does not exist** — no loops in this project; exit 0.
5. **No state file with `status: "running"` AND `session_id == <hook's session_id>`** — no live loop in this session; exit 0. (Loops from sibling sessions are ignored — they belong to a different process. Note: `--resume` refreshes the loop's `session_id` to the resuming session, so resumed loops stay protected — see [`state`](../docs/native-looping.md#state).)
6. **Transcript file unreadable** — exit 0.
7. **Last assistant message has no text and is not an AskUserQuestion** — nothing to evaluate; exit 0.

If any skip condition matches, the gate is silent. No stdout, no warning.

---

## Allow conditions (after skips — each exits 0 = allow stop)

For the matched running loop, the gate ALLOWS the stop when any of:

- **Pending `AskUserQuestion`:** the last assistant turn contains an `AskUserQuestion` tool-use. The model is legitimately awaiting required input (e.g. an `[H]` acceptance criterion) and must not be force-continued. Checked **before** the counter so a human-approval pause never accrues no-progress blocks.
- **Completion promise emitted:** the last assistant message contains the regex `<promise>\s*<completion_promise>\s*</promise>` (literal text from the state file's `completion_promise`, with regex metacharacters escaped). This is the loop's designed termination signal.
- **Block cap reached:** the no-progress counter exceeds the Synthex cap (see below). Synthex relinquishes; the loop stays `running` for the user to resume or cancel.

(A loop whose `status` is already terminal — `completed`, `cancelled`, `max-iterations-reached`, `crashed` — is never matched in skip condition 5, so the command flipping `status` to terminal at its emission point also releases the gate.)

---

## Block condition and the progress-aware counter

If a running loop exists for this session and none of the allow conditions hold, the gate **blocks** with `decision: "block"` and a `reason` instructing the model to run the next iteration (boundary check → increment + persist the iteration counter → print the marker → run the workflow once → emit the promise only when done). The `reason` explicitly tells the model that ending the turn is safe because the gate re-invokes it.

To bound runaway when the model genuinely cannot advance, the gate keeps a **progress-aware counter** in the state file (ADR-003 §3):

- `consecutive_stop_blocks` — number of consecutive no-progress stops.
- `last_gate_iteration` — the loop's `iteration` the last time the gate fired.

On each block decision:

1. If the loop's current `iteration` is **greater** than `last_gate_iteration`, the model made progress since the last gate fire → reset `consecutive_stop_blocks` to `1`.
2. Otherwise (no progress) → increment `consecutive_stop_blocks`.
3. Persist `consecutive_stop_blocks`, `last_gate_iteration = iteration`, and `last_updated` via tmp-file + atomic `mv`.
4. If `consecutive_stop_blocks` exceeds the cap (`SYNTHEX_LOOP_BLOCK_CAP`, default **7**), allow the stop instead of blocking.

The cap is kept strictly **below Claude Code's hard 8-consecutive-block override** (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, default 8). This means Synthex relinquishes deterministically — and keeps the `[H]` escape and resume protection — rather than being force-stopped by the harness with a warning. A loop whose iterations make real work never accumulates toward the cap, because progress resets the counter every iteration.

---

## Edge cases handled

- **macOS lacks `tac`** — the script reverses the transcript JSONL with `awk '{a[NR]=$0} END {for (i=NR;i>0;i--) print a[i]}'`, so it works on Linux and macOS.
- **Promise text contains regex metacharacters** — escaped via `sed 's/[.[\*^$()+?{}|\\]/\\&/g'` before grep.
- **Multiple running loops in one session** — only the first matched is driven. Rare in practice; if two loops need driving in the same turn, advance one per turn-end.
- **State-file write failure** — the atomic write is best-effort; on failure the temp file is removed and the gate still emits its decision. A missed counter update at worst delays the cap by one stop.
- **Stop fires after a subagent finishes** (`--loop-isolated`) — `transcript_path` is the parent transcript, so a subagent's iteration marker shows up in a tool-result block, not in `type == "assistant"` text. Isolated loops should rely on the promise or the iteration counter, not on marker text.

---

## Exit code summary

| Exit code | Meaning | When |
|-----------|---------|------|
| 0 (no stdout) | Allow stop | Any skip condition; pending AskUserQuestion; promise present; cap exceeded; any internal error (fail-open) |
| 0 (with `{"decision":"block"}` on stdout) | Block stop, re-invoke | Running loop for this session, unfinished, under the cap |

Non-zero exit codes are reserved — the script always exits 0 even on internal errors, by design (a buggy hook must never wedge the user's session).

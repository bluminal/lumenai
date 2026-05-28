#!/usr/bin/env bash
# loop-advance-gate.sh — Stop hook that drives Synthex --loop iterations.
#
# Synthex looping is turn-per-iteration (ADR-003): a --loop command does one
# iteration's work and may end its turn; this Stop hook re-drives the next
# iteration by returning decision:"block". Ending a turn mid-loop is recovered,
# not fatal. The hook is the loop engine, not a one-shot backstop.
#
# For a running loop matching this session, the gate ALLOWS the stop when:
#   - the completion promise is in the last assistant message (loop terminating), OR
#   - the last assistant turn is a pending AskUserQuestion ([H]-approval escape), OR
#   - the per-loop no-progress block counter has reached the Synthex cap.
# Otherwise it BLOCKS and tells the model to run the next iteration.
#
# Progress-aware counter (ADR-003 §3): consecutive_stop_blocks resets to 0 each
# time the loop's `iteration` advances, and increments on a no-progress stop.
# The cap (default 7) is kept BELOW Claude Code's hard 8-consecutive-block
# override so Synthex relinquishes deterministically rather than being
# force-stopped with a warning. We deliberately do NOT early-exit on
# stop_hook_active (that yields after one block — the bug ADR-003 fixes).
#
# Behavioral spec: plugins/synthex/hooks/loop-advance-gate.md
#
# Safety guarantees (the hook NEVER blocks unless a loop is provably alive):
#   - Missing jq / empty stdin / no session id → exit 0 (allow stop).
#   - No .synthex/loops/ dir → exit 0.
#   - No running loop with matching session_id → exit 0.
#   - Unreadable transcript / empty last message → exit 0.
#   - Any parsing error → exit 0.

set -u

# Synthex's own cap, kept strictly below Claude Code's hard 8-block override.
SYNTHEX_BLOCK_CAP="${SYNTHEX_LOOP_BLOCK_CAP:-7}"

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)"
[ -z "$SESSION_ID" ] && exit 0

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)"
[ -z "$CWD" ] && CWD="$PWD"
LOOPS_DIR="$CWD/.synthex/loops"
[ -d "$LOOPS_DIR" ] || exit 0

# Find the first running loop owned by this session.
STATE_FILE=""
LOOP_ID=""
PROMISE=""
for f in "$LOOPS_DIR"/*.json; do
  [ -e "$f" ] || continue
  STATUS="$(jq -r '.status // ""' "$f" 2>/dev/null)"
  LOOP_SESSION="$(jq -r '.session_id // ""' "$f" 2>/dev/null)"
  if [ "$STATUS" = "running" ] && [ "$LOOP_SESSION" = "$SESSION_ID" ]; then
    STATE_FILE="$f"
    LOOP_ID="$(jq -r '.loop_id // ""' "$f" 2>/dev/null)"
    PROMISE="$(jq -r '.completion_promise // ""' "$f" 2>/dev/null)"
    break
  fi
done

[ -z "$LOOP_ID" ] && exit 0

TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)"
[ -r "$TRANSCRIPT" ] || exit 0

# Most-recent assistant entry. `tac` is missing on macOS, so reverse with awk.
LAST_ASSISTANT="$(awk '{a[NR]=$0} END {for (i=NR;i>0;i--) print a[i]}' "$TRANSCRIPT" 2>/dev/null \
  | jq -s 'map(select(.type == "assistant"))[0] // {}' 2>/dev/null)"
[ -z "$LAST_ASSISTANT" ] && exit 0

LAST_TEXT="$(printf '%s' "$LAST_ASSISTANT" \
  | jq -r '(.message.content // []) | map(select(.type == "text") | .text // "") | join("\n")' 2>/dev/null)"

# [H]-approval escape: if the turn ended on an AskUserQuestion the model is
# legitimately awaiting required input — allow the stop, do not force-continue.
ASK_UQ="$(printf '%s' "$LAST_ASSISTANT" \
  | jq -r '[(.message.content // [])[] | select(.type == "tool_use" and .name == "AskUserQuestion")] | length' 2>/dev/null)"
case "$ASK_UQ" in ''|0) : ;; *) exit 0 ;; esac

[ -z "$LAST_TEXT" ] && exit 0

# Completion promise emitted — allow stop. Escape regex metacharacters in PROMISE.
if [ -n "$PROMISE" ]; then
  PROMISE_ESCAPED="$(printf '%s' "$PROMISE" | sed 's/[.[\*^$()+?{}|\\]/\\&/g')"
  if printf '%s' "$LAST_TEXT" \
     | grep -qE "<promise>[[:space:]]*${PROMISE_ESCAPED}[[:space:]]*</promise>"; then
    exit 0
  fi
fi

# Progress-aware no-progress counter.
ITERATION="$(jq -r '.iteration // 0' "$STATE_FILE" 2>/dev/null)"
CONSEC="$(jq -r '.consecutive_stop_blocks // 0' "$STATE_FILE" 2>/dev/null)"
LAST_GATE_ITER="$(jq -r '.last_gate_iteration // -1' "$STATE_FILE" 2>/dev/null)"
case "$ITERATION" in ''|*[!0-9]*) ITERATION=0 ;; esac
case "$CONSEC" in ''|*[!0-9]*) CONSEC=0 ;; esac
case "$LAST_GATE_ITER" in ''|-1) LAST_GATE_ITER=-1 ;; *[!0-9]*) LAST_GATE_ITER=-1 ;; esac

if [ "$ITERATION" -gt "$LAST_GATE_ITER" ]; then
  CONSEC=1          # progress since last gate fire — reset, count this block
else
  CONSEC=$((CONSEC + 1))   # no progress — accumulate toward the cap
fi

# Persist the counter (atomic write).
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP="$STATE_FILE.tmp.$$"
if jq --argjson it "$ITERATION" --argjson c "$CONSEC" --arg now "$NOW" \
     '.consecutive_stop_blocks = $c | .last_gate_iteration = $it | .last_updated = $now' \
     "$STATE_FILE" > "$TMP" 2>/dev/null; then
  mv -f "$TMP" "$STATE_FILE" 2>/dev/null || rm -f "$TMP" 2>/dev/null
else
  rm -f "$TMP" 2>/dev/null
fi

# Cap reached without progress — relinquish. The loop stays `running` so the
# user can /synthex:cancel-loop or resume it; we just stop forcing continuation.
if [ "$CONSEC" -gt "$SYNTHEX_BLOCK_CAP" ]; then
  exit 0
fi

# Loop is alive and unfinished — block and drive the next iteration.
jq -n --arg loop_id "$LOOP_ID" --arg promise "$PROMISE" '{
  decision: "block",
  reason: ("Synthex loop \"" + $loop_id + "\" is status:running and this turn did not emit `<promise>" + $promise + "</promise>`. Synthex looping is turn-per-iteration — run the NEXT iteration now: boundary check (read .synthex/loops/" + $loop_id + ".json; exit if status != running or iteration >= max_iterations) → increment + persist the iteration counter → print the `[loop " + $loop_id + " iteration N/M]` marker → execute the command workflow once → emit `<promise>" + $promise + "</promise>` on its own line ONLY when the completion conditions hold. You do not need to keep this all in one turn; if you end the turn this gate re-invokes you for the next iteration. To stop intentionally, emit the promise or run `/synthex:cancel-loop " + $loop_id + "`. If you are blocked awaiting required user input, ask via AskUserQuestion (that releases this gate).")
}'
exit 0

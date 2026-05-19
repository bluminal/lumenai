#!/usr/bin/env bash
# loop-advance-gate.sh — Stop hook preventing silent --loop drop-out
#
# Fires on every Stop event. If a Synthex --loop is active for this session
# (.synthex/loops/<loop-id>.json with status:"running" matching session_id)
# and the assistant's last turn contains neither the iteration marker
# `[loop <loop-id> iteration N/M]` nor `<promise>{completion_promise}</promise>`,
# returns decision:"block" so the model is told to re-enter the loop body
# instead of ending the turn.
#
# The shell shim contains all the logic — there is no LLM-side review step.
# Behavioral spec: plugins/synthex/hooks/loop-advance-gate.md
#
# Safety guarantees (the hook NEVER blocks unless it is certain a loop is alive):
#   - Missing jq → exit 0 (allow stop).
#   - stop_hook_active==true → exit 0 (avoid re-fire).
#   - No .synthex/loops/ dir → exit 0.
#   - No running loop with matching session_id → exit 0.
#   - Unreadable transcript → exit 0.
#   - Any error in parsing → exit 0.

set -u

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

STOP_HOOK_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)"
[ "$STOP_HOOK_ACTIVE" = "true" ] && exit 0

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)"
[ -z "$SESSION_ID" ] && exit 0

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)"
[ -z "$CWD" ] && CWD="$PWD"
LOOPS_DIR="$CWD/.synthex/loops"
[ -d "$LOOPS_DIR" ] || exit 0

LOOP_ID=""
PROMISE=""
for f in "$LOOPS_DIR"/*.json; do
  [ -e "$f" ] || continue
  STATUS="$(jq -r '.status // ""' "$f" 2>/dev/null)"
  LOOP_SESSION="$(jq -r '.session_id // ""' "$f" 2>/dev/null)"
  if [ "$STATUS" = "running" ] && [ "$LOOP_SESSION" = "$SESSION_ID" ]; then
    LOOP_ID="$(jq -r '.loop_id // ""' "$f" 2>/dev/null)"
    PROMISE="$(jq -r '.completion_promise // ""' "$f" 2>/dev/null)"
    break
  fi
done

[ -z "$LOOP_ID" ] && exit 0

TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)"
[ -r "$TRANSCRIPT" ] || exit 0

# Reverse the JSONL file and pick the first assistant message; extract its
# concatenated text. `tac` is missing on macOS, so use awk to reverse.
LAST_ASSISTANT_TEXT="$(awk '{a[NR]=$0} END {for (i=NR;i>0;i--) print a[i]}' "$TRANSCRIPT" 2>/dev/null \
  | jq -rs '
      map(select(.type == "assistant"))[0]
      | (.message.content // [])
      | map(select(.type == "text") | .text // "")
      | join("\n")
    ' 2>/dev/null)"

[ -z "$LAST_ASSISTANT_TEXT" ] && exit 0

# Iteration advanced this turn — allow stop.
if printf '%s' "$LAST_ASSISTANT_TEXT" \
   | grep -qE "\[loop ${LOOP_ID} iteration [0-9]+/[0-9]+\]"; then
  exit 0
fi

# Completion promise emitted — allow stop. Escape regex metacharacters in PROMISE.
if [ -n "$PROMISE" ]; then
  PROMISE_ESCAPED="$(printf '%s' "$PROMISE" | sed 's/[.[\*^$()+?{}|\\]/\\&/g')"
  if printf '%s' "$LAST_ASSISTANT_TEXT" \
     | grep -qE "<promise>[[:space:]]*${PROMISE_ESCAPED}[[:space:]]*</promise>"; then
    exit 0
  fi
fi

# Loop is alive, neither advanced nor terminated this turn — block.
jq -n --arg loop_id "$LOOP_ID" --arg promise "$PROMISE" '{
  decision: "block",
  reason: ("Synthex loop \"" + $loop_id + "\" is status:running but this turn neither advanced the iteration counter (no `[loop " + $loop_id + " iteration N/M]` marker in your last message) nor emitted `<promise>" + $promise + "</promise>`. The Synthex `--loop` framework is self-driven — re-enter the iteration body in the SAME turn (boundary check → increment + persist counter → print marker → execute workflow → emit promise OR loop back). Do NOT end your turn waiting for the user to re-fire; the harness does not re-invoke you. See plugins/synthex/commands/next-priority.md § \"Imperative Loop Protocol\" or plugins/synthex/commands/loop.md § 4 for the full per-iteration checklist. To stop the loop intentionally, either emit the completion promise on its own line or run `/synthex:cancel-loop " + $loop_id + "`.")
}'
exit 0

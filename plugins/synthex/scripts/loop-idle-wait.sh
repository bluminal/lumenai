#!/usr/bin/env bash
# loop-idle-wait.sh — in-turn idle wait for Synthex --loop iterations.
#
# Usage: loop-idle-wait.sh <loop-id> [watch-path ...]
#
# Called by a looping command when an iteration found NOTHING actionable. It
# blocks inside the current assistant turn (as one Bash tool call) instead of
# ending the turn, so an idle loop produces no Stop events — and therefore no
# "Stop hook error" transcript lines and no Stop-driven desktop notifications
# from other tools' Stop hooks (e.g. Orca). See
# plugins/synthex/hooks/loop-advance-gate.md § Idle iterations.
#
# Returns (always exit 0) as soon as ANY of:
#   - a watch path's content changes            → "changed"
#   - the loop's status leaves "running"        → "not-running" (e.g. cancelled)
#   - the backoff timeout elapses               → "timeout"
#
# Backoff by consecutive idle iterations (tracked in the state file as
# idle_streak / last_idle_iteration, managed only by this script):
#   streak 1 → 60s, 2 → 120s, 3 → 300s, 4+ → SYNTHEX_LOOP_IDLE_MAX (default 540s).
# The ceiling stays under Claude Code's 600s Bash max timeout; callers must pass
# timeout: 600000 there. Hosts with a lower shell-timeout cap (Codex, Grok, …)
# set SYNTHEX_LOOP_IDLE_MAX below it. Needs only POSIX tools; jq is optional
# (without it: no streak tracking, fixed 60s limit, grep-based cancel check).
#
# Env overrides (mainly for tests):
#   SYNTHEX_LOOP_IDLE_MAX   cap in seconds (default 540)
#   SYNTHEX_LOOP_IDLE_POLL  poll interval in seconds (default 5)
#
# Prints exactly one line:
#   idle-wait <loop-id>: <reason> after <N>s (idle streak <S>, limit <L>s)

set -u

LOOP_ID="${1:-}"
[ -z "$LOOP_ID" ] && { echo "idle-wait: missing <loop-id>"; exit 0; }
shift

IDLE_MAX="${SYNTHEX_LOOP_IDLE_MAX:-540}"
POLL="${SYNTHEX_LOOP_IDLE_POLL:-5}"
case "$IDLE_MAX" in ''|*[!0-9]*) IDLE_MAX=540 ;; esac
case "$POLL" in ''|*[!0-9]*|0) POLL=5 ;; esac

STATE_FILE="$PWD/.synthex/loops/$LOOP_ID.json"

# Content fingerprint of the watch paths. cksum is POSIX (works on macOS and
# Linux, unlike stat flags); missing files hash as "missing".
fingerprint() {
  for p in "$@"; do
    if [ -f "$p" ]; then cksum < "$p" 2>/dev/null; else echo "missing:$p"; fi
  done
}

loop_status() {
  [ -r "$STATE_FILE" ] || { echo "running"; return; }
  if command -v jq >/dev/null 2>&1; then
    jq -r '.status // ""' "$STATE_FILE" 2>/dev/null
  else
    # jq-less hosts: the state file is flat JSON with a single "status" key.
    # Unparseable → treat as running so a bad read never ends the wait early.
    st="$(grep -o '"status"[[:space:]]*:[[:space:]]*"[a-z-]*"' "$STATE_FILE" 2>/dev/null \
      | head -n 1 | sed 's/.*"\([a-z-]*\)"$/\1/')"
    echo "${st:-running}"
  fi
}

# Update the idle streak (consecutive only when the previous idle wait was at
# the immediately preceding iteration).
STREAK=1
if command -v jq >/dev/null 2>&1 && [ -r "$STATE_FILE" ]; then
  ITERATION="$(jq -r '.iteration // 0' "$STATE_FILE" 2>/dev/null)"
  PREV_STREAK="$(jq -r '.idle_streak // 0' "$STATE_FILE" 2>/dev/null)"
  LAST_IDLE="$(jq -r '.last_idle_iteration // -1' "$STATE_FILE" 2>/dev/null)"
  case "$ITERATION" in ''|*[!0-9]*) ITERATION=0 ;; esac
  case "$PREV_STREAK" in ''|*[!0-9]*) PREV_STREAK=0 ;; esac
  case "$LAST_IDLE" in ''|*[!0-9]*) LAST_IDLE=-1 ;; esac
  if [ "$LAST_IDLE" -ge 0 ] && [ "$ITERATION" -eq $((LAST_IDLE + 1)) ]; then
    STREAK=$((PREV_STREAK + 1))
  fi
  TMP="$STATE_FILE.tmp.$$"
  if jq --argjson s "$STREAK" --argjson it "$ITERATION" \
       '.idle_streak = $s | .last_idle_iteration = $it' "$STATE_FILE" > "$TMP" 2>/dev/null; then
    mv -f "$TMP" "$STATE_FILE" 2>/dev/null || rm -f "$TMP" 2>/dev/null
  else
    rm -f "$TMP" 2>/dev/null
  fi
fi

case "$STREAK" in
  1) LIMIT=60 ;;
  2) LIMIT=120 ;;
  3) LIMIT=300 ;;
  *) LIMIT="$IDLE_MAX" ;;
esac
[ "$LIMIT" -gt "$IDLE_MAX" ] && LIMIT="$IDLE_MAX"

BASELINE="$(fingerprint "$@")"
ELAPSED=0
REASON="timeout"
while [ "$ELAPSED" -lt "$LIMIT" ]; do
  if [ "$(loop_status)" != "running" ]; then REASON="not-running"; break; fi
  if [ "$#" -gt 0 ] && [ "$(fingerprint "$@")" != "$BASELINE" ]; then REASON="changed"; break; fi
  STEP="$POLL"
  [ $((ELAPSED + STEP)) -gt "$LIMIT" ] && STEP=$((LIMIT - ELAPSED))
  sleep "$STEP"
  ELAPSED=$((ELAPSED + STEP))
done
# A change or cancel landing during the final sleep still counts.
if [ "$REASON" = "timeout" ]; then
  if [ "$(loop_status)" != "running" ]; then REASON="not-running"
  elif [ "$#" -gt 0 ] && [ "$(fingerprint "$@")" != "$BASELINE" ]; then REASON="changed"; fi
fi

echo "idle-wait $LOOP_ID: $REASON after ${ELAPSED}s (idle streak $STREAK, limit ${LIMIT}s)"
exit 0

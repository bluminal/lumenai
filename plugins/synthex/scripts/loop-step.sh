#!/usr/bin/env bash
# loop-step.sh — portable state-file bookkeeping for Synthex native --loop
# commands (FR-HM18). Takes over the mechanics that used to live as prose in
# each looping command: state-file schema (v1), loop-id assignment, the
# archive scan, and the RUNNING/COMPLETED list + cancel formats. Full spec:
# plugins/synthex/docs/native-looping.md (state, loop-id, shared-iter anchors).
#
# Usage:
#   loop-step.sh begin <command> --completion-promise <text> [--name <slug>]
#                [--max <n>] [--args <string>] [--prompt-file <path>]
#                [--isolation shared-context|subagent] [--session-id <id>]
#                [--resume <loop-id>]
#   loop-step.sh advance <loop-id>
#   loop-step.sh hold <loop-id>
#   loop-step.sh finish <loop-id> <status> [exit_reason]
#   loop-step.sh archive
#   loop-step.sh list
#   loop-step.sh cancel <loop-id> | --all
#   loop-step.sh check-writable [dir]
#
# `begin` prints the resolved loop-id on stdout. `advance` prints the
# iteration marker `[loop <id> iteration N/M]`. `hold` re-validates a loop is
# still running without consuming an iteration (FR-HM18 D30 decision-wait
# re-entry) and prints nothing on success. `finish`/`cancel` print a one-line
# confirmation. `list` prints the RUNNING/COMPLETED enumeration (FR-NL32/33).
# `check-writable` is silent on success.
#
# jq is never required: state files are flat (no nested objects/arrays), so
# reads/writes go through `node` when present (guarded by `command -v node`)
# or a plain sed/awk fallback that understands this script's own one-
# field-per-line serialization. No python, anywhere.
#
# Env overrides (mainly for tests):
#   SYNTHEX_LOOPS_DIR   overrides the resolved loops directory outright.
#   CLAUDE_PROJECT_DIR  project root (falls back to $PWD).
#   SYNTHEX_NOW         overrides "now" (UTC ISO 8601) for deterministic tests.
#
# Exit codes:
#   0 - success (state written / listed / cancelled / still writable).
#   1 - refusal: invalid arguments or a validation failure.
#   2 - loop-id not found.
#   3 - loop is not running (cancelled/completed/crashed) — advance/hold refuse.
#   4 - loop reached max_iterations (advance only; state is now max-iterations-reached).
#   5 - writability check failed (check-writable, or a write was skipped).

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

# --------------------------------------------------------------------------
# project / loops-dir resolution
# --------------------------------------------------------------------------

project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
  else
    pwd
  fi
}

loops_dir() {
  if [ -n "${SYNTHEX_LOOPS_DIR:-}" ]; then
    printf '%s' "$SYNTHEX_LOOPS_DIR"
  else
    printf '%s/.synthex/loops' "$(project_root)"
  fi
}

now_iso() {
  if [ -n "${SYNTHEX_NOW:-}" ]; then
    printf '%s' "$SYNTHEX_NOW"
  else
    date -u +%Y-%m-%dT%H:%M:%SZ
  fi
}

HAS_NODE=0
command -v node >/dev/null 2>&1 && HAS_NODE=1

# --------------------------------------------------------------------------
# check-writable — the FR-HM18 writability preflight, reused internally by
# every state-writing operation below. Task 35 extends the failure hint with
# host-specific guidance (Codex --sandbox workspace-write, Gemini
# --approval-mode yolo, OpenCode --auto); writability_hint() is the hook.
# --------------------------------------------------------------------------

writability_hint() {
  # Placeholder for Task 35 (FR-HM41): read config/hosts.env + $SYNTHEX_HOST
  # here and return a host-specific flag/hint instead of this generic line.
  printf '%s' "Check directory permissions, or the host sandbox mode (e.g. a read-only default sandbox)."
}

# check_writable_dir <dir> — 0 if <dir> is writable (creating it if absent),
# 1 otherwise. Silent; callers decide what to print.
check_writable_dir() {
  d="$1"
  mkdir -p "$d" 2>/dev/null || return 1
  probe="$d/.writable-check.$$"
  ( : > "$probe" ) 2>/dev/null || return 1
  rm -f "$probe" 2>/dev/null
  return 0
}

cmd_check_writable() {
  d="${1:-$(loops_dir)}"
  if check_writable_dir "$d"; then
    exit 0
  fi
  echo "check-writable: cannot write to $d — $(writability_hint)" >&2
  exit 5
}

# --------------------------------------------------------------------------
# JSON helpers — no jq. The state file is flat JSON (string/number/null
# values only), always serialized by this script one field per line, so the
# sed/awk fallback only ever has to parse ITS OWN canonical output (plus
# whatever loop-idle-wait.sh / loop-advance-gate.sh touch via jq, which
# preserves the one-field-per-line shape). node is used when present for a
# fully general, correctly-escaped read/write.
# --------------------------------------------------------------------------

# json_escape <raw> — escapes backslash, double-quote, tab, CR, and embedded
# newlines for safe embedding inside a JSON string literal. sed + awk only
# (no perl/python). Newline-joining goes through awk's NR-based join rather
# than sed's `N;$!ba` slurp idiom: BSD/macOS sed's `N` at end-of-input drops
# the pattern space instead of auto-printing it (a real GNU/BSD divergence),
# which silently emptied single-line input under macOS's stock sed.
json_escape() {
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e 's/\r/\\r/g' \
    | awk '{ if (NR > 1) printf "\\n"; printf "%s", $0 }'
}

# field_get_raw <file> <key> — prints the raw JSON token for a top-level key
# (e.g. `"running"`, `null`, `5`) as it appears on its own line. Matches any
# line containing `"key"` immediately followed (after optional whitespace) by
# `:`, so key order/indentation does not matter.
field_get_raw() {
  file="$1"; key="$2"
  awk -v k="\"$key\"" '
    {
      line = $0
      idx = index(line, k)
      if (idx == 0) next
      rest = substr(line, idx + length(k))
      sub(/^[ \t]*/, "", rest)
      if (substr(rest, 1, 1) != ":") next
      rest = substr(rest, 2)
      sub(/^[ \t]*/, "", rest)
      sub(/[ \t]*,[ \t]*$/, "", rest)
      sub(/[ \t]*$/, "", rest)
      print rest
      exit
    }
  ' "$file"
}

# field_unquote <raw-token> — strips quotes + unescapes \" \\ \n \t \r, or
# prints "__NULL__" for a JSON null, or the bare token for a number.
field_unquote() {
  v="$1"
  case "$v" in
    null) printf '__NULL__' ;;
    \"*\")
      v="${v#\"}"; v="${v%\"}"
      v="$(printf '%s' "$v" | sed -e 's/\\n/\n/g' -e 's/\\t/\t/g' -e 's/\\r/\r/g' -e 's/\\"/"/g' -e 's/\\\\/\\/g')"
      printf '%s' "$v"
      ;;
    *) printf '%s' "$v" ;;
  esac
}

# state_get <file> <key> — resolved value (empty string for null/missing).
state_get() {
  raw="$(field_get_raw "$1" "$2")"
  [ -z "$raw" ] && { printf ''; return; }
  field_unquote "$raw"
}

# state_get_or <file> <key> <default> — like state_get, but a missing/null
# field returns <default> (used for the optional gate/idle-wait fields).
state_get_or() {
  raw="$(field_get_raw "$1" "$2")"
  if [ -z "$raw" ] || [ "$raw" = "null" ]; then
    printf '%s' "$3"
  else
    field_unquote "$raw"
  fi
}

# node_read_field <file> <key> — used only when HAS_NODE=1; a fully general,
# correctly-escaped alternative to the sed/awk reader above.
node_read_field() {
  node -e '
    const fs = require("fs");
    const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const v = o[process.argv[2]];
    process.stdout.write(v === null || v === undefined ? "" : String(v));
  ' "$1" "$2" 2>/dev/null
}

# read_field <file> <key> [default] — dispatches to node when available.
read_field() {
  file="$1"; key="$2"; default="${3-}"
  if [ ! -r "$file" ]; then printf '%s' "$default"; return; fi
  if [ "$HAS_NODE" = "1" ]; then
    val="$(node -e '
      const fs = require("fs");
      let o;
      try { o = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(3); }
      const v = o[process.argv[2]];
      if (v === null || v === undefined) process.exit(2);
      process.stdout.write(String(v));
    ' "$file" "$key" 2>/dev/null)"
    rc=$?
    case "$rc" in
      0) printf '%s' "$val"; return ;;
      2) printf '%s' "$default"; return ;;
      *) : ;; # parse failure — fall through to the sed/awk path
    esac
  fi
  if [ -n "${3+x}" ]; then
    state_get_or "$file" "$key" "$default"
  else
    state_get "$file" "$key"
  fi
}

state_exists() { [ -f "$1" ]; }

# dump_fields <file> <field...> — TAB-separated raw values (empty string for
# null/missing/unreadable), in field order, via ONE process spawn instead of
# one per field. Used by list/archive/cancel --all, which each touch every
# file in the directory and would otherwise multiply read_field's per-field
# cost by the field count. Falls back field-by-field (still no extra
# spawns beyond what read_field itself needs) when node is unavailable.
dump_fields() {
  file="$1"; shift
  if [ "$HAS_NODE" = "1" ] && [ -r "$file" ]; then
    out="$(node -e '
      const fs = require("fs");
      let o;
      try { o = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(1); }
      const vals = process.argv.slice(2).map((f) => {
        const v = o[f];
        return v === null || v === undefined ? "" : String(v);
      });
      process.stdout.write(vals.join("\t"));
    ' "$file" "$@" 2>/dev/null)"
    if [ $? -eq 0 ]; then
      printf '%s' "$out"
      return 0
    fi
  fi
  sep=""
  result=""
  for f in "$@"; do
    result="${result}${sep}$(read_field "$file" "$f")"
    sep="$(printf '\t')"
  done
  printf '%s' "$result"
}

# --------------------------------------------------------------------------
# Full-state writer. Every field the v1 schema (loop-state-file.ts
# REQUIRED_FIELDS) plus the optional gate/idle-wait fields are always
# emitted explicitly (their spec-default when absent from the prior file),
# so no reader ever has to guess. Atomic: tmp + mv -f (D-NL / FR-HM40).
# --------------------------------------------------------------------------

# render_state <file> — writes SV_* shell vars (already populated by the
# caller) as the canonical state JSON to <file>.tmp.$$, then mv -f.
render_state() {
  target="$1"
  tmp="$target.tmp.$$"

  jesc() { json_escape "$1"; }
  jstr() { # jstr <value-or-empty> <is-null-flag>
    if [ "$2" = "1" ]; then printf 'null'; else printf '"%s"' "$(jesc "$1")"; fi
  }

  {
    printf '{\n'
    printf '  "schema_version": %s,\n' "${SV_SCHEMA_VERSION:-1}"
    printf '  "loop_id": "%s",\n' "$(jesc "$SV_LOOP_ID")"
    printf '  "session_id": %s,\n' "$(jstr "$SV_SESSION_ID" "${SV_SESSION_ID_NULL:-0}")"
    printf '  "command": "%s",\n' "$(jesc "$SV_COMMAND")"
    printf '  "args": "%s",\n' "$(jesc "$SV_ARGS")"
    printf '  "prompt_file": %s,\n' "$(jstr "$SV_PROMPT_FILE" "${SV_PROMPT_FILE_NULL:-1}")"
    printf '  "completion_promise": "%s",\n' "$(jesc "$SV_COMPLETION_PROMISE")"
    printf '  "max_iterations": %s,\n' "${SV_MAX_ITERATIONS:-20}"
    printf '  "iteration": %s,\n' "${SV_ITERATION:-0}"
    printf '  "isolation": "%s",\n' "$(jesc "${SV_ISOLATION:-shared-context}")"
    printf '  "status": "%s",\n' "$(jesc "${SV_STATUS:-running}")"
    printf '  "started_at": "%s",\n' "$(jesc "$SV_STARTED_AT")"
    printf '  "last_updated": "%s",\n' "$(jesc "$SV_LAST_UPDATED")"
    printf '  "exited_at": %s,\n' "$(jstr "${SV_EXITED_AT:-}" "${SV_EXITED_AT_NULL:-1}")"
    printf '  "exit_reason": %s,\n' "$(jstr "${SV_EXIT_REASON:-}" "${SV_EXIT_REASON_NULL:-1}")"
    printf '  "consecutive_stop_blocks": %s,\n' "${SV_CONSECUTIVE_STOP_BLOCKS:-0}"
    printf '  "last_gate_iteration": %s,\n' "${SV_LAST_GATE_ITERATION:--1}"
    printf '  "idle_streak": %s,\n' "${SV_IDLE_STREAK:-0}"
    printf '  "last_idle_iteration": %s\n' "${SV_LAST_IDLE_ITERATION:--1}"
    printf '}\n'
  } > "$tmp" || { rm -f "$tmp" 2>/dev/null; return 1; }

  mv -f "$tmp" "$target" 2>/dev/null || { rm -f "$tmp" 2>/dev/null; return 1; }
  return 0
}

# load_state <file> — populates SV_* (+ *_NULL flag vars) from an existing
# file. Missing optional fields fall back to the documented spec defaults.
# node_dump_state <file> — emits `SV_<FIELD>='value'` and
# `SV_<FIELD>_NULL=0|1` shell-assignment lines for every known field in ONE
# node invocation (vs. one per field), for `eval`. This is the difference
# between ~1 and ~19 process spawns per load_state call — the per-iteration
# hot path, so it matters for NFR-NL1.
node_dump_state() {
  node -e '
    const fs = require("fs");
    let o;
    try { o = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(1); }
    const fields = [
      "schema_version","loop_id","session_id","command","args","prompt_file",
      "completion_promise","max_iterations","iteration","isolation","status",
      "started_at","last_updated","exited_at","exit_reason",
      "consecutive_stop_blocks","last_gate_iteration","idle_streak","last_idle_iteration",
    ];
    let out = "";
    for (const f of fields) {
      const v = o[f];
      const isNull = v === null || v === undefined;
      const s = isNull ? "" : String(v);
      const esc = s.replace(/\x27/g, "\x27\\\x27\x27");
      out += "SV_" + f.toUpperCase() + "=\x27" + esc + "\x27\n";
      out += "SV_" + f.toUpperCase() + "_NULL=" + (isNull ? 1 : 0) + "\n";
    }
    process.stdout.write(out);
  ' "$1" 2>/dev/null
}

load_state() {
  file="$1"
  if [ "$HAS_NODE" = "1" ] && [ -r "$file" ]; then
    dump="$(node_dump_state "$file")"
    if [ -n "$dump" ]; then
      eval "$dump"
      [ "${SV_SCHEMA_VERSION_NULL:-1}" = "1" ] && SV_SCHEMA_VERSION=1
      [ "${SV_MAX_ITERATIONS_NULL:-1}" = "1" ] && SV_MAX_ITERATIONS=20
      [ "${SV_ITERATION_NULL:-1}" = "1" ] && SV_ITERATION=0
      [ "${SV_ISOLATION_NULL:-1}" = "1" ] && SV_ISOLATION=shared-context
      [ "${SV_STATUS_NULL:-1}" = "1" ] && SV_STATUS=running
      [ "${SV_CONSECUTIVE_STOP_BLOCKS_NULL:-1}" = "1" ] && SV_CONSECUTIVE_STOP_BLOCKS=0
      [ "${SV_LAST_GATE_ITERATION_NULL:-1}" = "1" ] && SV_LAST_GATE_ITERATION=-1
      [ "${SV_IDLE_STREAK_NULL:-1}" = "1" ] && SV_IDLE_STREAK=0
      [ "${SV_LAST_IDLE_ITERATION_NULL:-1}" = "1" ] && SV_LAST_IDLE_ITERATION=-1
      return 0
    fi
  fi
  # sed/awk fallback (no node, or node failed to parse the file).
  SV_SCHEMA_VERSION="$(state_get_or "$file" schema_version 1)"
  SV_LOOP_ID="$(state_get "$file" loop_id)"
  SV_SESSION_ID="$(state_get "$file" session_id)"
  SV_SESSION_ID_NULL=0; [ -z "$SV_SESSION_ID" ] && [ "$(field_get_raw "$file" session_id)" = "null" ] && SV_SESSION_ID_NULL=1
  SV_COMMAND="$(state_get "$file" command)"
  SV_ARGS="$(state_get "$file" args)"
  SV_PROMPT_FILE="$(state_get "$file" prompt_file)"
  SV_PROMPT_FILE_NULL=1; [ -n "$SV_PROMPT_FILE" ] && SV_PROMPT_FILE_NULL=0
  SV_COMPLETION_PROMISE="$(state_get "$file" completion_promise)"
  SV_MAX_ITERATIONS="$(state_get_or "$file" max_iterations 20)"
  SV_ITERATION="$(state_get_or "$file" iteration 0)"
  SV_ISOLATION="$(state_get_or "$file" isolation shared-context)"
  SV_STATUS="$(state_get_or "$file" status running)"
  SV_STARTED_AT="$(state_get "$file" started_at)"
  SV_LAST_UPDATED="$(state_get "$file" last_updated)"
  SV_EXITED_AT="$(state_get "$file" exited_at)"
  SV_EXITED_AT_NULL=1; [ -n "$SV_EXITED_AT" ] && SV_EXITED_AT_NULL=0
  SV_EXIT_REASON="$(state_get "$file" exit_reason)"
  SV_EXIT_REASON_NULL=1; [ -n "$SV_EXIT_REASON" ] && SV_EXIT_REASON_NULL=0
  SV_CONSECUTIVE_STOP_BLOCKS="$(state_get_or "$file" consecutive_stop_blocks 0)"
  SV_LAST_GATE_ITERATION="$(state_get_or "$file" last_gate_iteration -1)"
  SV_IDLE_STREAK="$(state_get_or "$file" idle_streak 0)"
  SV_LAST_IDLE_ITERATION="$(state_get_or "$file" last_idle_iteration -1)"
}

state_path() { printf '%s/%s.json' "$(loops_dir)" "$1"; }

is_int() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# --------------------------------------------------------------------------
# archive — scan for terminal-status files and move them under .archive/.
# --------------------------------------------------------------------------

# archive_scan — the actual algorithm, callable internally (begin/list/
# cancel) without exiting the process. cmd_archive (below) is the CLI
# entry point that wraps this with `exit 0`.
archive_scan() {
  # Optional $1: a SPACE-SEPARATED list of loop-ids to exclude from this
  # pass. Used by `cancel`'s single-loop AND --all paths so that a loop
  # mutated to terminal status THIS SAME invocation is not immediately
  # swept away before the caller (or the next idempotent re-cancel) can
  # still see it (FR-NL29; native-looping.md § Archive: "they'll archive
  # on the next touch" — i.e. a DIFFERENT command's touch, not this one's).
  exclude_list="${1:-}"
  d="$(loops_dir)"
  [ -d "$d" ] || return 0
  archive_dir="$d/.archive"
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    fields="$(dump_fields "$f" status loop_id exited_at last_updated)"
    IFS="$(printf '\t')" read -r status loop_id exited_at last_updated_f <<EOF
$fields
EOF
    case "$status" in
      completed|cancelled|max-iterations-reached|crashed) : ;;
      *) continue ;;
    esac
    [ -z "$loop_id" ] && loop_id="$(basename "$f" .json)"
    if [ -n "$exclude_list" ]; then
      skip=0
      for ex in $exclude_list; do
        [ "$ex" = "$loop_id" ] && { skip=1; break; }
      done
      [ "$skip" = "1" ] && continue
    fi
    [ -z "$exited_at" ] && exited_at="$last_updated_f"
    safe_ts="$(printf '%s' "$exited_at" | sed 's/:/-/g')"
    mkdir -p "$archive_dir" 2>/dev/null || continue
    dest="$archive_dir/${loop_id}-${safe_ts}.json"
    n=1
    while [ -e "$dest" ]; do
      dest="$archive_dir/${loop_id}-${safe_ts}-${n}.json"
      n=$((n + 1))
    done
    mv -f "$f" "$dest" 2>/dev/null || true
  done
  return 0
}

cmd_archive() {
  archive_scan
  exit 0
}

# --------------------------------------------------------------------------
# begin — fresh start or resume.
# --------------------------------------------------------------------------

valid_name() {
  case "$1" in
    [a-z0-9]*) : ;;
    *) return 1 ;;
  esac
  printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9-]{0,63}$'
}

gen_hex4() {
  if [ -r /dev/urandom ]; then
    od -An -N2 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n'
  else
    printf '%04x' "$(( $(date +%s) % 65536 ))"
  fi
}

# command_slug <command> — derives the native-looping.md "Command slugs"
# table mapping from a slash-command string, e.g. "/synthex:next-priority"
# -> "next-priority", "/synthex-plus:team-implement" -> "team-implement".
# Falls back to lowercasing + hyphenating anything that isn't already a
# bare slug (so `loop-step.sh begin <anything>` never produces an invalid
# auto-generated loop-id prefix).
command_slug() {
  s="$1"
  case "$s" in
    */*|*:*)
      s="${s##*:}"
      s="${s##*/}"
      ;;
  esac
  s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')"
  [ -z "$s" ] && s="loop"
  printf '%s' "$s"
}

cmd_begin() {
  command_name="${1:-}"
  [ -z "$command_name" ] && { echo "Usage: loop-step.sh begin <command> --completion-promise <text> [--name <slug>] [--max <n>] [...]" >&2; exit 1; }
  shift

  name=""; max="20"; args=""; prompt_file=""; isolation="shared-context"
  session_id=""; completion_promise=""; resume_id=""

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --name) name="${2:-}"; shift 2 ;;
      --max) max="${2:-}"; shift 2 ;;
      --args) args="${2:-}"; shift 2 ;;
      --prompt-file) prompt_file="${2:-}"; shift 2 ;;
      --isolation) isolation="${2:-}"; shift 2 ;;
      --session-id) session_id="${2:-}"; shift 2 ;;
      --completion-promise) completion_promise="${2:-}"; shift 2 ;;
      --resume) resume_id="${2:-}"; shift 2 ;;
      *) echo "begin: unknown argument: $1" >&2; exit 1 ;;
    esac
  done

  d="$(loops_dir)"
  if ! check_writable_dir "$d"; then
    echo "begin: cannot write to $d — $(writability_hint)" >&2
    exit 5
  fi

  # Archive scan on every begin (fresh or resume) per native-looping.md §
  # Archive. On a --resume, exclude the target from this pass (same
  # same-invocation idempotency rationale as cancel's single-loop path):
  # otherwise a terminal target would be swept away before the status
  # check below gets to report "Cannot resume a terminal loop" and would
  # instead — wrongly — report "No loop found".
  archive_scan "$resume_id"

  now="$(now_iso)"

  if [ -n "$resume_id" ]; then
    if ! valid_name "$resume_id"; then
      echo "Invalid loop-id \"$resume_id\"." >&2
      exit 1
    fi
    path="$(state_path "$resume_id")"
    if [ ! -f "$path" ]; then
      echo "No loop found: $resume_id. Run /synthex:list-loops." >&2
      exit 2
    fi
    load_state "$path"
    if [ "$SV_SCHEMA_VERSION" != "1" ]; then
      echo "Loop \"$resume_id\" has schema_version=$SV_SCHEMA_VERSION (expected 1). Delete .synthex/loops/$resume_id.json and start a new loop, or upgrade Synthex." >&2
      exit 1
    fi
    if [ "$SV_STATUS" != "running" ]; then
      echo "Loop \"$resume_id\" is $SV_STATUS. Cannot resume a terminal loop. Start a new loop or pick a different one." >&2
      exit 3
    fi
    [ -n "$session_id" ] && { SV_SESSION_ID="$session_id"; SV_SESSION_ID_NULL=0; }
    [ -n "$isolation" ] && [ "$isolation" != "shared-context" ] && SV_ISOLATION="$isolation"
    SV_LAST_UPDATED="$now"
    render_state "$path" || { echo "begin: failed to write $path" >&2; exit 5; }
    printf '%s\n' "$resume_id"
    exit 0
  fi

  # Fresh start.
  if [ -n "$name" ]; then
    if ! valid_name "$name"; then
      echo "Invalid --name \"$name\". Must match ^[a-z0-9][a-z0-9-]{0,63}\$." >&2
      exit 1
    fi
    loop_id="$name"
    path="$(state_path "$loop_id")"
    if [ -f "$path" ]; then
      st="$(read_field "$path" status running)"
      if [ "$st" = "running" ]; then
        it="$(read_field "$path" iteration 0)"; mx="$(read_field "$path" max_iterations 20)"
        echo "Loop \"$loop_id\" is already running (iteration $it/$mx). Use /synthex:loop --resume $loop_id to continue or /synthex:cancel-loop $loop_id to stop it." >&2
        exit 1
      fi
      # terminal — archived above already if it qualified; if not (e.g. it
      # just transitioned), fall through and overwrite.
    fi
  else
    loop_id="$(command_slug "$command_name")-$(gen_hex4)"
    path="$(state_path "$loop_id")"
    tries=0
    while [ -f "$path" ] && [ "$(read_field "$path" status running)" = "running" ] && [ "$tries" -lt 20 ]; do
      loop_id="$(command_slug "$command_name")-$(gen_hex4)"
      path="$(state_path "$loop_id")"
      tries=$((tries + 1))
    done
  fi

  if [ -z "$completion_promise" ]; then
    echo "--completion-promise <text> is required when starting a new loop. Resume an existing loop with --resume <loop-id> or --resume-last." >&2
    exit 1
  fi

  if ! is_int "$max" || [ "$max" -lt 1 ] || [ "$max" -gt 200 ]; then
    echo "--max-iterations must be an integer in [1, 200]; got $max." >&2
    exit 1
  fi

  SV_SCHEMA_VERSION=1
  SV_LOOP_ID="$loop_id"
  if [ -n "$session_id" ]; then SV_SESSION_ID="$session_id"; SV_SESSION_ID_NULL=0; else SV_SESSION_ID=""; SV_SESSION_ID_NULL=1; fi
  SV_COMMAND="$command_name"
  SV_ARGS="$args"
  if [ -n "$prompt_file" ]; then SV_PROMPT_FILE="$prompt_file"; SV_PROMPT_FILE_NULL=0; else SV_PROMPT_FILE=""; SV_PROMPT_FILE_NULL=1; fi
  SV_COMPLETION_PROMISE="$completion_promise"
  SV_MAX_ITERATIONS="$max"
  SV_ITERATION=0
  SV_ISOLATION="$isolation"
  SV_STATUS="running"
  SV_STARTED_AT="$now"
  SV_LAST_UPDATED="$now"
  SV_EXITED_AT=""; SV_EXITED_AT_NULL=1
  SV_EXIT_REASON=""; SV_EXIT_REASON_NULL=1
  SV_CONSECUTIVE_STOP_BLOCKS=0
  SV_LAST_GATE_ITERATION=-1
  SV_IDLE_STREAK=0
  SV_LAST_IDLE_ITERATION=-1

  render_state "$path" || { echo "begin: failed to write $path" >&2; exit 5; }
  printf '%s\n' "$loop_id"
  exit 0
}

# --------------------------------------------------------------------------
# advance — the durability boundary. One Bash call per iteration.
# --------------------------------------------------------------------------

cmd_advance() {
  loop_id="${1:-}"
  [ -z "$loop_id" ] && { echo "Usage: loop-step.sh advance <loop-id>" >&2; exit 1; }
  path="$(state_path "$loop_id")"
  if [ ! -f "$path" ]; then
    echo "No loop found: $loop_id. Run /synthex:list-loops." >&2
    exit 2
  fi
  load_state "$path"

  if [ "$SV_STATUS" != "running" ]; then
    echo "Loop \"$loop_id\" is $SV_STATUS — nothing to do." >&2
    exit 3
  fi

  d="$(dirname "$path")"
  if ! check_writable_dir "$d"; then
    echo "advance: cannot write to $d — $(writability_hint)" >&2
    exit 5
  fi

  now="$(now_iso)"

  if [ "$SV_ITERATION" -ge "$SV_MAX_ITERATIONS" ]; then
    SV_STATUS="max-iterations-reached"
    SV_EXITED_AT="$now"; SV_EXITED_AT_NULL=0
    SV_EXIT_REASON="Reached max_iterations=${SV_MAX_ITERATIONS} without completion promise"; SV_EXIT_REASON_NULL=0
    SV_LAST_UPDATED="$now"
    render_state "$path" || { echo "advance: failed to write $path" >&2; exit 5; }
    echo "Loop \"$loop_id\" reached max_iterations=${SV_MAX_ITERATIONS}. Resume is not possible once terminal; start a new loop with /synthex:loop or the owning command's --loop flag." >&2
    exit 4
  fi

  SV_ITERATION=$((SV_ITERATION + 1))
  SV_LAST_UPDATED="$now"
  render_state "$path" || { echo "advance: failed to write $path" >&2; exit 5; }
  printf '[loop %s iteration %s/%s]\n' "$loop_id" "$SV_ITERATION" "$SV_MAX_ITERATIONS"
  exit 0
}

# --------------------------------------------------------------------------
# hold — decision-wait / idle-wait re-entry. Re-validates without
# incrementing (D30: used across a loop-step.sh hold while a decision file
# or an idle wait is pending).
# --------------------------------------------------------------------------

cmd_hold() {
  loop_id="${1:-}"
  [ -z "$loop_id" ] && { echo "Usage: loop-step.sh hold <loop-id>" >&2; exit 1; }
  path="$(state_path "$loop_id")"
  if [ ! -f "$path" ]; then
    echo "No loop found: $loop_id. Run /synthex:list-loops." >&2
    exit 2
  fi
  load_state "$path"

  if [ "$SV_STATUS" != "running" ]; then
    echo "Loop \"$loop_id\" is $SV_STATUS — nothing to do." >&2
    exit 3
  fi

  d="$(dirname "$path")"
  if ! check_writable_dir "$d"; then
    # A hold's timestamp touch is best-effort; an unwritable dir does not
    # invalidate an otherwise-running loop, so still allow the re-entry.
    exit 0
  fi

  SV_LAST_UPDATED="$(now_iso)"
  render_state "$path" || true
  exit 0
}

# --------------------------------------------------------------------------
# finish — terminal transition (typically "completed" on promise emission).
# Idempotent: a no-op on an already-terminal loop.
# --------------------------------------------------------------------------

cmd_finish() {
  loop_id="${1:-}"; status="${2:-}"; reason="${3:-}"
  if [ -z "$loop_id" ] || [ -z "$status" ]; then
    echo "Usage: loop-step.sh finish <loop-id> <status> [exit_reason]" >&2
    exit 1
  fi
  case "$status" in
    completed|cancelled|max-iterations-reached|crashed) : ;;
    *) echo "finish: invalid status \"$status\" — must be one of completed, cancelled, max-iterations-reached, crashed." >&2; exit 1 ;;
  esac
  path="$(state_path "$loop_id")"
  if [ ! -f "$path" ]; then
    echo "No loop found: $loop_id. Run /synthex:list-loops." >&2
    exit 2
  fi
  load_state "$path"

  if [ "$SV_STATUS" != "running" ]; then
    echo "Loop \"$loop_id\" is already $SV_STATUS — nothing to do."
    exit 0
  fi

  d="$(dirname "$path")"
  if ! check_writable_dir "$d"; then
    echo "finish: cannot write to $d — $(writability_hint)" >&2
    exit 5
  fi

  if [ -z "$reason" ]; then
    case "$status" in
      completed) reason="completion-promise-emitted" ;;
      cancelled) reason="Cancelled by /synthex:cancel-loop" ;;
      max-iterations-reached) reason="Reached max_iterations=${SV_MAX_ITERATIONS} without completion promise" ;;
      crashed) reason="Marked crashed" ;;
    esac
  fi

  now="$(now_iso)"
  SV_STATUS="$status"
  SV_EXITED_AT="$now"; SV_EXITED_AT_NULL=0
  SV_EXIT_REASON="$reason"; SV_EXIT_REASON_NULL=0
  SV_LAST_UPDATED="$now"
  render_state "$path" || { echo "finish: failed to write $path" >&2; exit 5; }
  echo "Loop \"$loop_id\" $status (was at iteration $SV_ITERATION/$SV_MAX_ITERATIONS)."
  exit 0
}

# --------------------------------------------------------------------------
# list — RUNNING/COMPLETED enumeration (FR-NL32/FR-NL33).
# --------------------------------------------------------------------------

relative_time() {
  # relative_time <ISO-8601-UTC> — coarse "<N>[smhd] ago" against now.
  ts="$1"
  if [ "$HAS_NODE" = "1" ]; then
    node -e '
      const then = Date.parse(process.argv[1]);
      if (Number.isNaN(then)) { process.stdout.write("?"); process.exit(0); }
      let s = Math.max(0, Math.floor((Date.now() - then) / 1000));
      if (process.env.SYNTHEX_NOW) {
        const now = Date.parse(process.env.SYNTHEX_NOW);
        if (!Number.isNaN(now)) s = Math.max(0, Math.floor((now - then) / 1000));
      }
      let out;
      if (s < 60) out = s + "s ago";
      else if (s < 3600) out = Math.floor(s / 60) + "m ago";
      else if (s < 86400) out = Math.floor(s / 3600) + "h ago";
      else out = Math.floor(s / 86400) + "d ago";
      process.stdout.write(out);
    ' "$ts" 2>/dev/null
  else
    printf 'recently'
  fi
}

cmd_list() {
  # The archive scan runs at the END of this command (see the two exit
  # points below), not the start: list-loops must still SHOW terminal loops
  # that exist at invocation time in their COMPLETED bucket before tidying
  # them away for the next command that touches the directory
  # (native-looping.md § Archive — "the list excludes archived loops" refers
  # to loops already sitting in .archive/ from an EARLIER run, not the ones
  # this same invocation is about to display).
  d="$(loops_dir)"
  if [ ! -d "$d" ]; then
    echo "No loops in this project."
    exit 0
  fi

  running_tmp="$(mktemp 2>/dev/null || printf '/tmp/loop-step-running.%s' "$$")"
  terminal_tmp="$(mktemp 2>/dev/null || printf '/tmp/loop-step-terminal.%s' "$$")"
  warn_tmp="$(mktemp 2>/dev/null || printf '/tmp/loop-step-warn.%s' "$$")"
  : > "$running_tmp"; : > "$terminal_tmp"; : > "$warn_tmp"

  any=0
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    any=1
    fields="$(dump_fields "$f" loop_id status iteration max_iterations started_at session_id exited_at)"
    IFS="$(printf '\t')" read -r loop_id status iteration max_it started_at session_id exited_at <<EOF
$fields
EOF
    if [ -z "$loop_id" ]; then
      echo "$(basename "$f")	malformed or unparsable JSON" >> "$warn_tmp"
      continue
    fi
    [ -z "$iteration" ] && iteration=0
    [ -z "$max_it" ] && max_it=0
    case "$status" in
      running)
        short_sess="(none, resumable)"
        [ -n "$session_id" ] && short_sess="$(printf '%s' "$session_id" | cut -c1-8)"
        rel="$(relative_time "$started_at")"
        printf '%s\t%s\t%s\t%s\t%s\n' "$loop_id" "$iteration" "$max_it" "$rel" "$short_sess" >> "$running_tmp"
        ;;
      completed|cancelled|max-iterations-reached|crashed)
        rel="$(relative_time "$exited_at")"
        label="$status"
        case "$status" in
          completed) label="completed (promise)" ;;
          max-iterations-reached) label="max-iterations" ;;
        esac
        printf '%s\t%s\t%s\t%s\t%s\n' "$loop_id" "$label" "$iteration" "$max_it" "$rel" >> "$terminal_tmp"
        ;;
      *)
        echo "$(basename "$f")	unknown status \"$status\"" >> "$warn_tmp"
        ;;
    esac
  done

  if [ "$any" = "0" ]; then
    echo "No loops in this project."
    rm -f "$running_tmp" "$terminal_tmp" "$warn_tmp"
    archive_scan >/dev/null 2>&1 || true
    exit 0
  fi

  n_running=$(wc -l < "$running_tmp" | tr -d ' ')
  n_terminal_total=$(wc -l < "$terminal_tmp" | tr -d ' ')

  if [ "$n_running" = "0" ] && [ "$n_terminal_total" = "0" ]; then
    echo "No loops in this project."
    rm -f "$running_tmp" "$terminal_tmp" "$warn_tmp"
    archive_scan >/dev/null 2>&1 || true
    exit 0
  fi

  if [ "$n_running" -gt 0 ]; then
    echo "RUNNING ($n_running):"
    sort -t "$(printf '\t')" -k4,4r "$running_tmp" 2>/dev/null | while IFS="$(printf '\t')" read -r lid it mx rel sess; do
      printf '  %s    iter %s/%s    started %s    session %s\n' "$lid" "$it" "$mx" "$rel" "$sess"
    done
    [ "$n_terminal_total" -gt 0 ] && echo ""
  fi

  if [ "$n_terminal_total" -gt 0 ]; then
    capped="$n_terminal_total"
    truncated=0
    if [ "$n_terminal_total" -gt 20 ]; then
      capped=20
      truncated=$((n_terminal_total - 20))
    fi
    echo "COMPLETED ($capped):"
    sort -t "$(printf '\t')" -k5,5r "$terminal_tmp" 2>/dev/null | head -n 20 | while IFS="$(printf '\t')" read -r lid label it mx rel; do
      printf '  %s    %s    iter %s/%s    finished %s\n' "$lid" "$label" "$it" "$mx" "$rel"
    done
    if [ "$truncated" -gt 0 ]; then
      echo "… and $truncated more terminal loops (see .synthex/loops/.archive/)."
    fi
  fi

  if [ -s "$warn_tmp" ]; then
    echo ""
    echo "WARNINGS:"
    while IFS="$(printf '\t')" read -r rel reason; do
      printf '  %s    %s\n' "$rel" "$reason"
    done < "$warn_tmp"
  fi

  rm -f "$running_tmp" "$terminal_tmp" "$warn_tmp"
  archive_scan >/dev/null 2>&1 || true
  exit 0
}

# --------------------------------------------------------------------------
# cancel — single loop-id or --all.
# --------------------------------------------------------------------------

cancel_one_file() {
  f="$1"
  loop_id="$(read_field "$f" loop_id)"
  status="$(read_field "$f" status)"
  case "$status" in
    running) : ;;
    *) return 1 ;;
  esac
  d="$(dirname "$f")"
  check_writable_dir "$d" || return 2
  load_state "$f"
  now="$(now_iso)"
  SV_STATUS="cancelled"
  SV_EXITED_AT="$now"; SV_EXITED_AT_NULL=0
  SV_EXIT_REASON="Cancelled by /synthex:cancel-loop"; SV_EXIT_REASON_NULL=0
  SV_LAST_UPDATED="$now"
  render_state "$f" || return 3
  return 0
}

cmd_cancel() {
  d="$(loops_dir)"
  arg1="${1:-}"
  arg2="${2:-}"

  if [ -z "$arg1" ]; then
    echo "Usage: /synthex:cancel-loop <loop-id> | --all" >&2
    exit 1
  fi
  if [ "$arg1" != "--all" ] && [ "$arg2" = "--all" ]; then
    echo "loop_id and --all are mutually exclusive." >&2
    exit 1
  fi

  if [ ! -d "$d" ]; then
    echo "No loops in this project."
    exit 0
  fi

  if [ "$arg1" = "--all" ]; then
    tmp_summary="$(mktemp 2>/dev/null || printf '/tmp/loop-step-cancel-all.%s' "$$")"
    : > "$tmp_summary"
    cancelled_ids=""
    for f in "$d"/*.json; do
      [ -e "$f" ] || continue
      fields="$(dump_fields "$f" iteration max_iterations loop_id)"
      IFS="$(printf '\t')" read -r before_it before_mx before_lid <<EOF
$fields
EOF
      [ -z "$before_it" ] && before_it=0
      [ -z "$before_mx" ] && before_mx=0
      if cancel_one_file "$f"; then
        printf '  %s    was at iter %s/%s\n' "$before_lid" "$before_it" "$before_mx" >> "$tmp_summary"
        cancelled_ids="$cancelled_ids $before_lid"
      fi
    done
    n=$(wc -l < "$tmp_summary" | tr -d ' ')
    if [ "$n" = "0" ]; then
      echo "No running loops to cancel."
      rm -f "$tmp_summary"
      archive_scan >/dev/null 2>&1 || true
      exit 0
    fi
    echo "Cancelled ($n):"
    cat "$tmp_summary"
    rm -f "$tmp_summary"
    # --all runs the archive scan AFTER mutating, but excludes the loops it
    # JUST cancelled so they are not archived in this same invocation
    # (native-looping.md § Archive: "they'll archive on the next touch").
    archive_scan "$cancelled_ids" >/dev/null 2>&1 || true
    exit 0
  fi

  loop_id="$arg1"
  # Resolve the exact target BEFORE archiving anything, and always exclude
  # it from this invocation's own scan (FR-NL29 idempotency — see
  # archive_scan's $1). Other stale files in the directory still get swept.
  path="$(state_path "$loop_id")"
  if [ ! -f "$path" ]; then
    archive_scan "$loop_id" >/dev/null 2>&1 || true
    echo "No loop found: $loop_id. Run /synthex:list-loops to see loops in this project." >&2
    exit 2
  fi
  status="$(read_field "$path" status)"
  if [ "$status" != "running" ]; then
    archive_scan "$loop_id" >/dev/null 2>&1 || true
    echo "Loop \"$loop_id\" is already $status — nothing to do."
    exit 0
  fi
  before_it="$(read_field "$path" iteration 0)"
  before_mx="$(read_field "$path" max_iterations 0)"
  if ! cancel_one_file "$path"; then
    echo "cancel: failed to write $path — $(writability_hint)" >&2
    exit 5
  fi
  echo "Cancelled loop \"$loop_id\" (was at iteration $before_it/$before_mx)."
  archive_scan "$loop_id" >/dev/null 2>&1 || true
  exit 0
}

# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

sub="${1:-}"
[ "$#" -gt 0 ] && shift

case "$sub" in
  begin) cmd_begin "$@" ;;
  advance) cmd_advance "$@" ;;
  hold) cmd_hold "$@" ;;
  finish) cmd_finish "$@" ;;
  archive) cmd_archive "$@" ;;
  list) cmd_list "$@" ;;
  cancel) cmd_cancel "$@" ;;
  check-writable) cmd_check_writable "$@" ;;
  *)
    echo "Usage: loop-step.sh <begin|advance|hold|finish|archive|list|cancel|check-writable> ..." >&2
    exit 1
    ;;
esac

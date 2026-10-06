#!/usr/bin/env sh
# compact-recover.sh — synthex SessionStart hook (matcher: "compact")
#
# FR-HM20 / D32: loop identity must survive context compaction. PreCompact
# stdout is NOT injected into the post-compaction summary, so a reminder
# printed there is lost. The reliable mechanism is a SessionStart hook with
# matcher "compact" — it fires right after compaction completes and its
# stdout IS visible to the resumed session — so this script reads
# .synthex/loops/*.json directly and prints, for every loop still "running",
# the loop-id, its progress, its state-file path, and the exact command to
# resume it.
#
# FR-HM19 Stage 2 (Task 59): when a running loop carries a `runId` (a pending
# read-only synthex:loop-engine verdict run, leased by loop-step.sh
# `advance --run` / `hold --run`), a SECOND line follows that loop's line,
# telling the resumed session to wait for the run's Workflow notification and
# run `loop-step.sh hold <loop-id>` first instead of advancing. Loops without
# a runId print exactly the single line they always have.
#
# Prints nothing when no loop is running (including when the project has no
# .synthex/loops directory at all). Never blocks the session.
#
# Parsing follows the same no-jq approach as loop-step.sh: node is used when
# present (guarded by `command -v node`), falling back to an awk reader that
# handles both loop-step.sh's one-field-per-line serialization and minified
# single-line JSON (flat objects only, as the state schema guarantees).
# No jq dependency, no python, anywhere.
#
# Exit codes:
#   0 - always. Best-effort; a single unreadable/unparsable loop file is
#       skipped rather than surfaced via exit status.

set -u

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOOPS_DIR="${SYNTHEX_LOOPS_DIR:-$PROJECT_ROOT/.synthex/loops}"

[ -d "$LOOPS_DIR" ] || exit 0

HAS_NODE=0
command -v node >/dev/null 2>&1 && HAS_NODE=1

# field_get <file> <key> — best-effort scalar (string or number) read for a
# flat, one-field-per-line JSON state file. Mirrors loop-step.sh's
# field_get_raw/field_unquote pair; prints "" for a missing/null field.
field_get() {
  file="$1"
  key="$2"
  if [ "$HAS_NODE" = "1" ]; then
    node -e '
      const fs = require("fs");
      try {
        const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        const v = o[process.argv[2]];
        process.stdout.write(v === null || v === undefined ? "" : String(v));
      } catch (e) { /* unreadable/unparsable — print nothing */ }
    ' "$file" "$key" 2>/dev/null
    return 0
  fi
  awk -v k="\"$key\"" '
    # Slurp the whole file so pretty-printed (one field per line, as
    # loop-step.sh writes) and minified single-line JSON both parse.
    { buf = buf $0 "\n" }
    END {
      pos = 1
      while ((idx = index(substr(buf, pos), k)) > 0) {
        abs = pos + idx - 1
        # The key must sit at object level: preceded by { or , (whitespace ok).
        before = substr(buf, 1, abs - 1)
        sub(/[ \t\n]*$/, "", before)
        last = substr(before, length(before), 1)
        rest = substr(buf, abs + length(k))
        sub(/^[ \t\n]*/, "", rest)
        if ((last == "{" || last == ",") && substr(rest, 1, 1) == ":") {
          rest = substr(rest, 2)
          sub(/^[ \t\n]*/, "", rest)
          if (substr(rest, 1, 1) == "\"") {
            rest = substr(rest, 2)
            end = index(rest, "\"")
            if (end > 0) print substr(rest, 1, end - 1)
            exit
          }
          if (match(rest, /^[^,} \t\n]+/)) {
            val = substr(rest, RSTART, RLENGTH)
            if (val != "null") print val
          }
          exit
        }
        pos = abs + length(k)
      }
    }
  ' "$file" 2>/dev/null
}

for f in "$LOOPS_DIR"/*.json; do
  [ -e "$f" ] || continue

  status="$(field_get "$f" status)"
  [ "$status" = "running" ] || continue

  loop_id="$(field_get "$f" loop_id)"
  [ -n "$loop_id" ] || loop_id="$(basename "$f" .json)"

  iteration="$(field_get "$f" iteration)"
  [ -n "$iteration" ] || iteration=0

  max_iterations="$(field_get "$f" max_iterations)"
  [ -n "$max_iterations" ] || max_iterations=0

  run_id="$(field_get "$f" runId)"

  printf 'Synthex loop %s is running (iteration %s/%s); state: .synthex/loops/%s.json — continue with loop-step.sh advance %s\n' \
    "$loop_id" "$iteration" "$max_iterations" "$loop_id" "$loop_id"

  if [ -n "$run_id" ]; then
    printf 'Verdict run %s is pending for %s: wait for its Workflow notification, then run loop-step.sh hold %s first (docs/engines/loop-workflow.md); do not advance.\n' \
      "$run_id" "$loop_id" "$loop_id"
  fi
done

exit 0

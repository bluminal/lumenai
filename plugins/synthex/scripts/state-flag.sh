#!/usr/bin/env sh
# state-flag.sh — set a boolean flag in .synthex/state.json (FR-HM26).
#
# A generic, atomic boolean-flag writer for the per-project Synthex state
# file. Reuses scripts/upgrade-nudge.sh's field-preservation rules: reads
# and rewrites .synthex/state.json without a jq dependency, preserving
# every existing field — including ones this script does not itself know
# about, such as "plugin_root" and "last_seen_version" (both written by
# upgrade-nudge.sh, never by this script).
#
# Used by commands/dismiss-upgrade-nudge.md (flag: "dismissed") and
# commands/star.md (flags: "starred", "star_dismissed" — see that command
# for which flag each user choice sets).
#
# Usage:
#   state-flag.sh <flag> [true|false]
#
# <flag> must be a bare identifier ([A-Za-z_][A-Za-z0-9_]*). The value
# defaults to "true" when omitted (the only value every current caller
# needs — dismiss/star flags are only ever turned on, never back off).
#
# Env overrides (mainly for tests):
#   CLAUDE_PROJECT_DIR   project root (falls back to $PWD).
#   SYNTHEX_STATE_FILE   overrides the resolved state.json path outright.
#
# Exit codes:
#   0 - success: flag written (state.json created or updated).
#   1 - usage error: missing/invalid <flag> name, or invalid value argument.
#   2 - .synthex/ directory does not exist (project not initialized; run
#       /synthex:init first). No file is written.
#   5 - writability check failed; state.json was not written.

set -u

FLAG="${1:-}"
FLAG_VALUE="${2:-true}"

if ! printf '%s' "$FLAG" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$'; then
    echo "state-flag: usage: state-flag.sh <flag> [true|false]" >&2
    exit 1
fi

case "$FLAG_VALUE" in
    true | false) ;;
    *)
        echo "state-flag: invalid value \"$FLAG_VALUE\" (expected true or false)" >&2
        exit 1
        ;;
esac

if [ -n "${SYNTHEX_STATE_FILE:-}" ]; then
    STATE_FILE="$SYNTHEX_STATE_FILE"
    SYNTHEX_DIR="$(dirname -- "$STATE_FILE")"
else
    PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
    SYNTHEX_DIR="$PROJECT_ROOT/.synthex"
    STATE_FILE="$SYNTHEX_DIR/state.json"
fi

# D-UO8 / E12 (shared with upgrade-nudge.sh): do not write state outside a
# plugin-initialized project.
[ -d "$SYNTHEX_DIR" ] || exit 2

# FR-HM18 writability preflight — same check_writable_dir shape as
# loop-step.sh's `check-writable` subcommand, reimplemented locally here so
# this script has no dependency on loop-step.sh's own dispatch/arg parsing.
check_writable_dir() {
    d="$1"
    mkdir -p "$d" 2>/dev/null || return 1
    probe="$d/.writable-check.$$"
    (: >"$probe") 2>/dev/null || return 1
    rm -f "$probe" 2>/dev/null
    return 0
}

if ! check_writable_dir "$SYNTHEX_DIR"; then
    echo "state-flag: cannot write to $SYNTHEX_DIR — check directory permissions." >&2
    exit 5
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")"

# value_for_key <key> — raw JSON value text (including surrounding quotes,
# if any) for an existing top-level key in $STATE_FILE. Relies on this
# script family's one-field-per-line serialization (see upgrade-nudge.sh
# and loop-step.sh) — strips a trailing comma and whitespace.
value_for_key() {
    sed -nE "s/^[[:space:]]*\"$1\"[[:space:]]*:[[:space:]]*(.*)\$/\1/p" "$STATE_FILE" 2>/dev/null \
        | head -n 1 \
        | sed -E 's/[[:space:]]*,[[:space:]]*$//'
}

# build_json_fallback — sed/awk-only (no jq, no node) reader+writer. Walks
# the existing top-level keys in file order, overriding $FLAG and
# updated_at, defaulting schema_version to 1, and preserving every other
# field verbatim (malformed) FR-UO18: a file with no recognizable "key":
# lines is treated as missing, so this naturally degrades to a fresh
# document.
build_json_fallback() {
    existing_keys=""
    if [ -r "$STATE_FILE" ]; then
        existing_keys="$(grep -oE '"[A-Za-z0-9_]+"[[:space:]]*:' "$STATE_FILE" 2>/dev/null \
            | sed -E 's/^"([^"]+)".*/\1/')"
    fi

    have_flag=0
    have_updated=0
    have_schema=0
    out=""
    old_ifs="$IFS"
    IFS='
'
    for k in $existing_keys; do
        [ -n "$k" ] || continue
        if [ "$k" = "$FLAG" ]; then
            v="$FLAG_VALUE"
            have_flag=1
        elif [ "$k" = "updated_at" ]; then
            v="\"$NOW\""
            have_updated=1
        else
            v="$(value_for_key "$k")"
            [ "$k" = "schema_version" ] && have_schema=1
        fi
        [ -n "$out" ] && out="$out,
"
        out="$out  \"$k\": $v"
    done
    IFS="$old_ifs"

    if [ "$have_schema" != "1" ]; then
        if [ -n "$out" ]; then
            out="  \"schema_version\": 1,
$out"
        else
            out="  \"schema_version\": 1"
        fi
    fi
    if [ "$have_flag" != "1" ]; then
        [ -n "$out" ] && out="$out,
"
        out="$out  \"$FLAG\": $FLAG_VALUE"
    fi
    if [ "$have_updated" != "1" ]; then
        [ -n "$out" ] && out="$out,
"
        out="$out  \"updated_at\": \"$NOW\""
    fi

    printf '{\n%s\n}\n' "$out"
}

NEW_JSON=""
if command -v node >/dev/null 2>&1; then
    NEW_JSON="$(node -e '
const fs = require("fs");
const [statePath, flag, valueArg, now] = process.argv.slice(1);
let obj = {};
try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
} catch (e) {
    obj = {};
}
if (typeof obj.schema_version === "undefined") obj.schema_version = 1;
obj[flag] = valueArg === "true";
obj.updated_at = now;
process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
' "$STATE_FILE" "$FLAG" "$FLAG_VALUE" "$NOW" 2>/dev/null)" || NEW_JSON=""
fi

[ -n "$NEW_JSON" ] || NEW_JSON="$(build_json_fallback)"

TMP_FILE="${STATE_FILE}.tmp.$$"
printf '%s' "$NEW_JSON" >"$TMP_FILE" 2>/dev/null || {
    rm -f "$TMP_FILE" 2>/dev/null
    echo "state-flag: failed to write $TMP_FILE" >&2
    exit 5
}
mv -f "$TMP_FILE" "$STATE_FILE" 2>/dev/null || {
    rm -f "$TMP_FILE" 2>/dev/null
    echo "state-flag: failed to move $TMP_FILE -> $STATE_FILE" >&2
    exit 5
}

exit 0

#!/usr/bin/env sh
# upgrade-nudge.sh — synthex SessionStart hook
#
# Prints a one-line nudge when a user upgrades synthex across the
# 0.5.0 threshold (where multi-model review was introduced) and
# has not yet configured the feature. State is per-project in
# .synthex/state.json. Idempotent. Never blocks the session.
#
# Exit code: always 0. Never reads stdin. Never prompts.
#
# See: docs/plans/upgrade-onboarding.md (Task 8, FR-UO7..FR-UO21).

set -u

THRESHOLD="0.5.0"

SCRIPT_DIR="$(cd "$(dirname -- "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"

# FR-UO19: missing plugin.json → silent exit.
[ -r "$PLUGIN_JSON" ] || exit 0

# Read current version from plugin.json without taking a jq dependency.
CURRENT_VERSION="$(sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$PLUGIN_JSON" | head -n 1)"
[ -n "$CURRENT_VERSION" ] || exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SYNTHEX_DIR="$PROJECT_ROOT/.synthex"
STATE_FILE="$SYNTHEX_DIR/state.json"
CONFIG_FILE="$SYNTHEX_DIR/config.yaml"

# D-UO8 / E12: do not write state outside a plugin-initialized project.
[ -d "$SYNTHEX_DIR" ] || exit 0

LAST_SEEN=""
DISMISSED="false"
if [ -r "$STATE_FILE" ]; then
    LAST_SEEN="$(sed -nE 's/.*"last_seen_version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$STATE_FILE" | head -n 1)"
    DISMISSED="$(sed -nE 's/.*"dismissed"[[:space:]]*:[[:space:]]*(true|false).*/\1/p' "$STATE_FILE" | head -n 1)"
    [ -n "$DISMISSED" ] || DISMISSED="false"
    # FR-UO18: malformed state (no last_seen) → treat as missing; overwrite below.
fi

# FR-UO9 steady-state.
if [ -n "$LAST_SEEN" ] && [ "$LAST_SEEN" = "$CURRENT_VERSION" ]; then
    exit 0
fi

write_state() {
    new_version="$1"
    new_dismissed="$2"
    tmp_file="${STATE_FILE}.tmp.$$"
    timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")"
    {
        printf '{\n'
        printf '  "schema_version": 1,\n'
        printf '  "last_seen_version": "%s",\n' "$new_version"
        printf '  "dismissed": %s,\n' "$new_dismissed"
        printf '  "updated_at": "%s"\n' "$timestamp"
        printf '}\n'
    } > "$tmp_file" 2>/dev/null || {
        rm -f "$tmp_file" 2>/dev/null
        exit 0
    }
    mv -f "$tmp_file" "$STATE_FILE" 2>/dev/null || {
        rm -f "$tmp_file" 2>/dev/null
        exit 0
    }
}

# FR-UO10 / FR-UO11: no (or unparseable) state → seed fresh, no nudge.
if [ -z "$LAST_SEEN" ]; then
    write_state "$CURRENT_VERSION" "$DISMISSED"
    exit 0
fi

# D-UO12 version comparison: returns 0 iff $1 < $2.
version_lt() {
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" = "$1" ]
}

# D-UO7: downgrade → silently update, no nudge.
if version_lt "$CURRENT_VERSION" "$LAST_SEEN"; then
    write_state "$CURRENT_VERSION" "$DISMISSED"
    exit 0
fi

# Upgrade path. Threshold + config-absent + not-dismissed → nudge.
NUDGE_FIRES="false"
if version_lt "$LAST_SEEN" "$THRESHOLD" && ! version_lt "$CURRENT_VERSION" "$THRESHOLD"; then
    BLOCK_PRESENT="false"
    if [ -r "$CONFIG_FILE" ] && grep -qE '^multi_model_review:' "$CONFIG_FILE" 2>/dev/null; then
        BLOCK_PRESENT="true"
    fi
    if [ "$BLOCK_PRESENT" = "false" ] && [ "$DISMISSED" != "true" ]; then
        NUDGE_FIRES="true"
    fi
fi

if [ "$NUDGE_FIRES" = "true" ]; then
    printf 'Synthex upgraded to %s. Multi-model review is available. Run /synthex:configure-multi-model to set it up, or /synthex:dismiss-upgrade-nudge to silence this message.\n' "$CURRENT_VERSION"
fi

write_state "$CURRENT_VERSION" "$DISMISSED"
exit 0

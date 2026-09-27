#!/usr/bin/env bash
# init-scaffold.sh — mechanical scaffold for `/synthex:init` (FR-HM26).
#
# Replaces the shell-adjacent mechanical work that used to live as prose in
# init.md Steps 2 and 8: copying the plugin's shipped config/defaults.yaml
# to the project config path, and creating the standard document
# directories used across Synthex commands. Doing this in a zero-token
# script (rather than Read+Write tool calls per file/dir) is FR-HM26.
#
# Usage:
#   init-scaffold.sh [config_path] [--force]
#
#   config_path   Where to write the project config, relative to the
#                 project root unless given as an absolute path.
#                 Default: .synthex/config.yaml
#   --force       Overwrite an existing config file with the plugin's
#                 defaults.yaml. Used only when init.md Step 1's "reset to
#                 defaults" choice is picked — never the default behavior.
#
# Idempotent: without --force, an existing config file is left untouched
# (exit 0, nothing printed for it) — running this script twice in a row is
# always safe. Directories that already exist are left untouched too.
#
# Resolution:
#   <plugin_root>   this script's own directory, one level up (scripts/..).
#   <project_root>  $CLAUDE_PROJECT_DIR if set, else $PWD.
#
# The config-file copy is a plain byte-for-byte copy (`cat` through a
# temp file + atomic `mv -f`) — no transformation happens, so the result is
# byte-identical to the plugin's config/defaults.yaml. No node is needed
# for that, so none is invoked; nothing here shells out to `node`, `jq`, or
# `python`.
#
# Every directory this script creates (the config file's parent, and each
# document directory) is created via a writability check that itself does
# the `mkdir -p` and then proves the result is actually writable by
# creating and removing a probe file — the same check-writable contract
# `loop-step.sh check-writable` implements for native-looping state, so a
# read-only sandbox is reported clearly (exit 5) instead of failing deep
# inside a later write.
#
# Prints one `Created <path>` line per config file or directory that this
# run actually created; a fully idempotent re-run (nothing new) prints
# nothing and still exits 0.
#
# Exit codes:
#   0 - success (created something, or already up to date — idempotent).
#   1 - usage error (unrecognized option, or more than one positional arg).
#   2 - the plugin's config/defaults.yaml source is missing or unreadable.
#   5 - writability check failed for the config file's directory or a
#       document directory (mirrors loop-step.sh's check-writable contract).

set -u

# --------------------------------------------------------------------------
# plugin / project resolution
# --------------------------------------------------------------------------

SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_DIR_RAW="${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_DIR_RAW="." ;;
esac
SCRIPT_DIR="$(cd "$SCRIPT_DIR_RAW" 2>/dev/null && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"

project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
  else
    pwd
  fi
}

# --------------------------------------------------------------------------
# argument parsing
# --------------------------------------------------------------------------

CONFIG_REL=""
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force)
      FORCE=1
      ;;
    -*)
      echo "init-scaffold: unknown option: $arg" >&2
      exit 1
      ;;
    *)
      if [ -n "$CONFIG_REL" ]; then
        echo "init-scaffold: unexpected argument: $arg" >&2
        exit 1
      fi
      CONFIG_REL="$arg"
      ;;
  esac
done
[ -n "$CONFIG_REL" ] || CONFIG_REL=".synthex/config.yaml"

case "$CONFIG_REL" in
  /*) CONFIG_PATH="$CONFIG_REL" ;;
  *) CONFIG_PATH="$(project_root)/$CONFIG_REL" ;;
esac

DEFAULTS_PATH="$PLUGIN_ROOT/config/defaults.yaml"

if [ ! -r "$DEFAULTS_PATH" ]; then
  echo "init-scaffold: plugin defaults not found or unreadable: $DEFAULTS_PATH" >&2
  exit 2
fi

# --------------------------------------------------------------------------
# check_writable_dir <dir> — mkdir -p, then proves the result is actually
# writable via a probe file. 0 on success, 1 otherwise. Silent; callers
# decide what to print. Mirrors loop-step.sh's check_writable_dir.
# --------------------------------------------------------------------------

check_writable_dir() {
  d="$1"
  mkdir -p "$d" 2>/dev/null || return 1
  probe="$d/.writable-check.$$"
  ( : > "$probe" ) 2>/dev/null || return 1
  rm -f "$probe" 2>/dev/null
  return 0
}

fail_writability() {
  echo "init-scaffold: cannot write to $1 — check directory permissions or the host sandbox mode (e.g. a read-only default sandbox)." >&2
  exit 5
}

# --------------------------------------------------------------------------
# 1. Config file — idempotent unless --force.
# --------------------------------------------------------------------------

CONFIG_DIR="${CONFIG_PATH%/*}"
[ "$CONFIG_DIR" = "$CONFIG_PATH" ] && CONFIG_DIR="."

if [ -e "$CONFIG_PATH" ] && [ "$FORCE" != "1" ]; then
  : # Idempotent: never overwrite an existing config without --force.
else
  check_writable_dir "$CONFIG_DIR" || fail_writability "$CONFIG_DIR"
  TMP_PATH="$CONFIG_PATH.tmp.$$"
  if cat "$DEFAULTS_PATH" > "$TMP_PATH" 2>/dev/null; then
    mv -f "$TMP_PATH" "$CONFIG_PATH"
    echo "Created $CONFIG_REL"
  else
    echo "init-scaffold: failed to read $DEFAULTS_PATH" >&2
    rm -f "$TMP_PATH" 2>/dev/null
    exit 2
  fi
fi

# --------------------------------------------------------------------------
# 2. Document directories — created if missing, left alone otherwise.
# --------------------------------------------------------------------------

DOC_DIRS="docs/reqs docs/plans docs/specs docs/specs/decisions docs/specs/rfcs docs/runbooks docs/retros"

PROJECT_ROOT_DIR="$(project_root)"
for doc_dir in $DOC_DIRS; do
  doc_dir_abs="$PROJECT_ROOT_DIR/$doc_dir"
  if [ -d "$doc_dir_abs" ]; then
    continue
  fi
  # NOTE: check_writable_dir reassigns its own "d"/"probe" globals (no
  # `local`, matching this codebase's sh-portable style) — it must never be
  # called with an argument still needed under names "d" or "probe" after
  # it returns, hence "doc_dir"/"doc_dir_abs" here rather than "d".
  check_writable_dir "$doc_dir_abs" || fail_writability "$doc_dir_abs"
  echo "Created ${doc_dir}/"
done

exit 0

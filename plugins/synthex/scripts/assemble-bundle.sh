#!/usr/bin/env bash
# assemble-bundle.sh — writes the FR-MR28 context bundle for multi-model
# review to .synthex/tmp/bundle-<hash>.json (FR-HM26, FR-HM44).
#
# Replaces the retired `context-bundle-assembler` Haiku agent with a
# mechanical, zero-LLM-cost script. Per-file size routing only: a file at or
# under multi_model_review.context.max_file_bytes is inlined verbatim into
# the bundle's `files[]` array; a file over that cap is NOT read or
# summarized here — it is listed in `needs_summary[]` instead, and the
# CALLER (multi-model-review-orchestrator, in prose) issues one Haiku
# `effort: low` summarization call per needs_summary entry, merges the
# resulting summary text back into `files[]`, and flips that entry's
# manifest `inlined` flag to true before handing the bundle to proposers.
# This is the "no 200 KB Haiku re-emission" saving FR-HM26 exists for.
#
# The artifact under review is NEVER added to needs_summary and is always
# inlined verbatim (Behavioral Rule 1, carried over from the retired
# agent), EXCEPT when the artifact alone exceeds
# multi_model_review.context.max_bundle_bytes — at that point including it
# would corrupt the review's total-size contract, so assembly aborts with
# error_code "narrow_scope_required" instead (see defaults.yaml's
# multi_model_review.context.max_bundle_bytes comment). A file passed via
# --touched that happens to equal --artifact is also treated as the
# artifact (always inlined, never routed to needs_summary).
#
# Selecting WHICH paths belong in the bundle (e.g. the retired agent's
# Step 4 filename-substring spec matching) stays the orchestrator's job;
# this script receives already-resolved concrete paths and only performs
# the mechanical byte-cap routing, missing-file skip, and bundle JSON
# write — the "mechanical utility work" FR-HM26 moves out of an LLM call.
#
# Usage:
#   assemble-bundle.sh assemble --artifact <path> \
#       [--touched <path>]... [--convention <path>]... [--spec <path>]...
#   assemble-bundle.sh cleanup <bundle-path>
#   assemble-bundle.sh cleanup --sweep
#
# `assemble` prints the written bundle's absolute path on stdout and always
# sweeps every bundle-*.json older than 24h from .synthex/tmp/ first, so a
# project never accumulates orphaned bundles even when a caller never runs
# `cleanup` (e.g. after a crash mid-review). `cleanup <bundle-path>` removes
# one specific bundle file (the orchestrator calls this on its own bundle
# once consolidation finishes — "at run end" per the FR-HM26 acceptance
# criteria); `cleanup --sweep` runs the same 24h sweep on demand. Missing
# convention/touched/spec files are skipped silently (advisory, matching
# the retired agent's Behavioral Rule 4); a missing/unreadable --artifact
# is a usage error.
#
# Env overrides (mainly for tests):
#   CLAUDE_PROJECT_DIR   project root (falls back to $PWD).
#
# Exit codes:
#   0 - success: bundle written (assemble) or file(s) removed (cleanup).
#   1 - usage error: missing/unknown subcommand, missing --artifact, or
#       --artifact does not exist / is not readable.
#   2 - narrow_scope_required: the artifact alone exceeds
#       multi_model_review.context.max_bundle_bytes. An error-shaped bundle
#       (status: "error", manifest: null, files: []) is still written for
#       an auditable record; the caller decides whether to retry with a
#       narrower scope.
#   5 - writability check failed; nothing was written.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
CONFIG_GET="$SCRIPT_DIR/lib/config-get.sh"

# --------------------------------------------------------------------------
# project / tmp-dir resolution
# --------------------------------------------------------------------------

project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
  else
    pwd
  fi
}

tmp_dir() {
  printf '%s/.synthex/tmp' "$(project_root)"
}

# check_writable_dir <dir> — FR-HM18 writability preflight, same shape as
# state-flag.sh / loop-step.sh's check_writable_dir.
check_writable_dir() {
  d="$1"
  mkdir -p "$d" 2>/dev/null || return 1
  probe="$d/.writable-check.$$"
  (: >"$probe") 2>/dev/null || return 1
  rm -f "$probe" 2>/dev/null
  return 0
}

# ensure_gitignore <dir> — self-ignoring .gitignore (FR-HM26 acceptance
# criteria) so .synthex/tmp/ never gets committed. Idempotent.
ensure_gitignore() {
  d="$1"
  f="$d/.gitignore"
  if [ ! -f "$f" ]; then
    printf '*\n' >"$f" 2>/dev/null
  fi
}

# sweep_stale <dir> — deletes every bundle-*.json older than 24h (86400s).
# `date -r <file> +%s` (a file's mtime as epoch seconds) works identically
# on GNU date and BSD/macOS date, so no stat(1) dependency is needed.
sweep_stale() {
  d="$1"
  [ -d "$d" ] || return 0
  now="$(date +%s)"
  for f in "$d"/bundle-*.json; do
    [ -e "$f" ] || continue
    mtime="$(date -r "$f" +%s 2>/dev/null)" || continue
    age=$((now - mtime))
    if [ "$age" -gt 86400 ]; then
      rm -f "$f" 2>/dev/null
    fi
  done
}

# --------------------------------------------------------------------------
# JSON helpers — no jq, no node. json_escape mirrors loop-step.sh's helper
# (backslash, double-quote, tab, CR, and embedded-newline escaping for safe
# embedding inside a JSON string literal).
# --------------------------------------------------------------------------

json_escape() {
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e 's/\r/\\r/g' \
    | awk '{ if (NR > 1) printf "\\n"; printf "%s", $0 }'
}

# byte_count <file> — portable file size in bytes.
byte_count() {
  wc -c <"$1" 2>/dev/null | tr -d ' '
}

# --------------------------------------------------------------------------
# assemble
# --------------------------------------------------------------------------

cmd_assemble() {
  artifact=""
  touched_list=""
  convention_list=""
  spec_list=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --artifact)
        artifact="${2:-}"
        shift 2
        ;;
      --touched)
        touched_list="${touched_list}${touched_list:+$(printf '\036')}${2:-}"
        shift 2
        ;;
      --convention)
        convention_list="${convention_list}${convention_list:+$(printf '\036')}${2:-}"
        shift 2
        ;;
      --spec)
        spec_list="${spec_list}${spec_list:+$(printf '\036')}${2:-}"
        shift 2
        ;;
      *)
        echo "assemble-bundle: unknown argument to assemble: $1" >&2
        exit 1
        ;;
    esac
  done

  if [ -z "$artifact" ]; then
    echo "assemble-bundle: usage: assemble-bundle.sh assemble --artifact <path> [--touched <path>]... [--convention <path>]... [--spec <path>]..." >&2
    exit 1
  fi
  if [ ! -r "$artifact" ] || [ ! -f "$artifact" ]; then
    echo "assemble-bundle: --artifact \"$artifact\" does not exist or is not readable." >&2
    exit 1
  fi

  root="$(project_root)"
  dir="$(tmp_dir)"
  check_writable_dir "$dir" || {
    echo "assemble-bundle: cannot write to $dir — check directory permissions." >&2
    exit 5
  }
  ensure_gitignore "$dir"
  sweep_stale "$dir"

  max_file_bytes="$("$CONFIG_GET" multi_model_review.context.max_file_bytes 65536 2>/dev/null)"
  max_bundle_bytes="$("$CONFIG_GET" multi_model_review.context.max_bundle_bytes 204800 2>/dev/null)"
  case "$max_file_bytes" in '' | *[!0-9]*) max_file_bytes=65536 ;; esac
  case "$max_bundle_bytes" in '' | *[!0-9]*) max_bundle_bytes=204800 ;; esac

  artifact_size="$(byte_count "$artifact")"
  [ -n "$artifact_size" ] || artifact_size=0

  hash="$(printf '%s' "${artifact}:${touched_list}:${convention_list}:${spec_list}:$$:$(date +%s):${RANDOM}" | cksum | awk '{print $1}')"
  bundle_path="$dir/bundle-${hash}.json"
  tmp_path="$bundle_path.tmp.$$"

  if [ "$artifact_size" -gt "$max_bundle_bytes" ]; then
    msg="Artifact (${artifact_size} bytes) exceeds max_bundle_bytes (${max_bundle_bytes}). Multi-model review cannot proceed at full fidelity. Narrow review scope (smaller diff, single file) and retry."
    {
      printf '{\n'
      printf '  "status": "error",\n'
      printf '  "error_code": "narrow_scope_required",\n'
      printf '  "error_message": "%s",\n' "$(json_escape "$msg")"
      printf '  "manifest": null,\n'
      printf '  "files": [],\n'
      printf '  "needs_summary": []\n'
      printf '}\n'
    } >"$tmp_path" && mv -f "$tmp_path" "$bundle_path"
    echo "$bundle_path"
    exit 2
  fi

  files_json=""
  needs_summary_json=""
  conventions_manifest=""
  touched_manifest=""
  specs_manifest=""
  total_bytes="$artifact_size"

  add_file() {
    # add_file <path> <raw-content> — <raw-content> is escaped here; do not
    # pre-escape or pre-quote it before calling.
    entry="$(printf '{ "path": "%s", "content": "%s" }' "$(json_escape "$1")" "$(json_escape "$2")")"
    files_json="${files_json}${files_json:+,}
    $entry"
  }

  add_needs_summary() {
    # add_needs_summary <path> <size> <category>
    entry="$(printf '{ "path": "%s", "size_bytes": %s, "category": "%s" }' "$(json_escape "$1")" "$2" "$3")"
    needs_summary_json="${needs_summary_json}${needs_summary_json:+,}
    $entry"
  }

  manifest_entry() {
    # manifest_entry <path> <size> <inlined>
    printf '{ "path": "%s", "size_bytes": %s, "inlined": %s }' "$(json_escape "$1")" "$2" "$3"
  }

  # Artifact — always inlined verbatim (Behavioral Rule 1).
  add_file "$artifact" "$(cat "$artifact")"
  artifact_manifest="$(manifest_entry "$artifact" "$artifact_size" "true")"

  # Conventions — always inlined verbatim when present; missing files are
  # advisory and skipped silently.
  old_ifs="$IFS"
  IFS="$(printf '\036')"
  for p in $convention_list; do
    IFS="$old_ifs"
    [ -n "$p" ] || continue
    if [ -r "$p" ] && [ -f "$p" ]; then
      size="$(byte_count "$p")"
      add_file "$p" "$(cat "$p")"
      conventions_manifest="${conventions_manifest}${conventions_manifest:+,}
    $(manifest_entry "$p" "$size" "true")"
      total_bytes=$((total_bytes + size))
    fi
    IFS="$(printf '\036')"
  done
  IFS="$old_ifs"

  # route_file <path> <category-label> — shared per-file-cap routing for
  # touched_files and specs. Sets $ROUTE_MANIFEST_LINE (a plain global, NOT
  # a command-substitution return value — add_file/add_needs_summary mutate
  # files_json/needs_summary_json/total_bytes as side effects, which a
  # subshell from `$(route_file ...)` would silently discard) to the
  # manifest object for <path>, or to an empty string when <path> is
  # missing/unreadable and therefore skipped. The artifact itself is exempt
  # even when it also appears in --touched (still inlined, never routed to
  # needs_summary).
  ROUTE_MANIFEST_LINE=""
  route_file() {
    p="$1"; category="$2"
    ROUTE_MANIFEST_LINE=""
    [ -n "$p" ] || return 0
    [ -r "$p" ] && [ -f "$p" ] || return 0
    size="$(byte_count "$p")"
    if [ "$p" = "$artifact" ]; then
      ROUTE_MANIFEST_LINE="$(manifest_entry "$p" "$size" "true")"
      # already inlined as the artifact; do not double-add to files[].
    elif [ "$size" -le "$max_file_bytes" ]; then
      add_file "$p" "$(cat "$p")"
      ROUTE_MANIFEST_LINE="$(manifest_entry "$p" "$size" "true")"
      total_bytes=$((total_bytes + size))
    else
      add_needs_summary "$p" "$size" "$category"
      ROUTE_MANIFEST_LINE="$(manifest_entry "$p" "$size" "false")"
    fi
  }

  IFS="$(printf '\036')"
  for p in $touched_list; do
    IFS="$old_ifs"
    if [ -n "$p" ]; then
      route_file "$p" "touched_files"
      [ -n "$ROUTE_MANIFEST_LINE" ] && touched_manifest="${touched_manifest}${touched_manifest:+,}
    $ROUTE_MANIFEST_LINE"
    fi
    IFS="$(printf '\036')"
  done
  IFS="$old_ifs"

  IFS="$(printf '\036')"
  for p in $spec_list; do
    IFS="$old_ifs"
    if [ -n "$p" ]; then
      route_file "$p" "specs"
      [ -n "$ROUTE_MANIFEST_LINE" ] && specs_manifest="${specs_manifest}${specs_manifest:+,}
    $ROUTE_MANIFEST_LINE"
    fi
    IFS="$(printf '\036')"
  done
  IFS="$old_ifs"

  {
    printf '{\n'
    printf '  "status": "success",\n'
    printf '  "manifest": {\n'
    printf '    "artifact": %s,\n' "$artifact_manifest"
    printf '    "conventions": [%s],\n' "${conventions_manifest:+
    $conventions_manifest
  }"
    printf '    "touched_files": [%s],\n' "${touched_manifest:+
    $touched_manifest
  }"
    printf '    "specs": [%s],\n' "${specs_manifest:+
    $specs_manifest
  }"
    printf '    "total_bytes": %s\n' "$total_bytes"
    printf '  },\n'
    printf '  "files": [%s],\n' "${files_json:+
    $files_json
  }"
    printf '  "needs_summary": [%s]\n' "${needs_summary_json:+
    $needs_summary_json
  }"
    printf '}\n'
  } >"$tmp_path" && mv -f "$tmp_path" "$bundle_path"

  echo "$bundle_path"
  exit 0
}

# --------------------------------------------------------------------------
# cleanup
# --------------------------------------------------------------------------

cmd_cleanup() {
  dir="$(tmp_dir)"
  case "${1:-}" in
    --sweep)
      sweep_stale "$dir"
      exit 0
      ;;
    "")
      echo "assemble-bundle: usage: assemble-bundle.sh cleanup <bundle-path> | --sweep" >&2
      exit 1
      ;;
    *)
      target="$1"
      case "$target" in
        "$dir"/bundle-*.json) ;;
        *)
          echo "assemble-bundle: cleanup refuses to remove a path outside .synthex/tmp/: $target" >&2
          exit 1
          ;;
      esac
      rm -f "$target" 2>/dev/null
      exit 0
      ;;
  esac
}

# --------------------------------------------------------------------------
# dispatch
# --------------------------------------------------------------------------

sub="${1:-}"
[ $# -gt 0 ] && shift

case "$sub" in
  assemble)
    cmd_assemble "$@"
    ;;
  cleanup)
    cmd_cleanup "$@"
    ;;
  *)
    echo "assemble-bundle: usage: assemble-bundle.sh assemble --artifact <path> [...] | assemble-bundle.sh cleanup <bundle-path> | --sweep" >&2
    exit 1
    ;;
esac

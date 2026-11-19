#!/usr/bin/env bash
# detect-workspace-host.sh — which agent workspace manager, if any, this
# session runs inside (FR-HW2). Used by /synthex:next-priority --in-workspace.
#
# Usage: detect-workspace-host.sh
# Prints exactly one of: orca | herdr | conductor | none
#
# Exit codes:
#   0 - always; the answer is on stdout
#
#   orca       `orca` on PATH and `orca worktree current --json` reports ok
#              (the current directory is an Orca-managed worktree; ~0.2s,
#              never launches the app)
#   herdr      HERDR_ENV=1 and `herdr` on PATH (Herdr's own skill uses this check)
#   conductor  CONDUCTOR_WORKSPACE_PATH is set — detect-only: Conductor's CLI
#              cannot create local workspaces, so callers fall back to local
#   none       anything else
#
# Orca is checked before Herdr: a Herdr pane inside an Orca worktree should
# still get Orca child workspaces, which carry parent lineage.

if command -v orca >/dev/null 2>&1 &&
  orca worktree current --json 2>/dev/null | grep -q '"ok": *true'; then
  echo orca
elif [ "${HERDR_ENV:-}" = 1 ] && command -v herdr >/dev/null 2>&1; then
  echo herdr
elif [ -n "${CONDUCTOR_WORKSPACE_PATH:-}" ]; then
  echo conductor
else
  echo none
fi

#!/usr/bin/env bash
# teammate-idle-gate.sh — TeammateIdle command hook: distilled work-matching
# classification (FR-HM23).
#
# Fires whenever a teammate has no active tasks and becomes idle. Like
# task-completed-gate.sh, this is a real command hook with no model turn to
# spend, so it cannot itself call TaskUpdate or send a mailbox message; its
# job is to decide, from the payload, whether unblocked matching work exists
# and name it — the calling agent performs the actual assignment after
# seeing the block reason. hooks/teammate-idle-gate.md is now a short doc
# describing this behavior, not the behavior itself.
#
# Standing-pool exemption: when the payload's `standing` field is true, this
# hook always allows idle (exit 0) and does nothing else. Standing-pool
# teammates are managed by their Pool Lead, per the "Standing Pool Lifecycle
# Overlay" in templates/review.md (last_active_at maintenance, no dismissal
# on an empty task list) — this hook must never force a false "keep working"
# block for them, and it is exempt from the non-standing matching logic
# below for the same reason a standing pool is exempt from the
# one-team-per-session count (FR-MMT26): a standing team's lifecycle is not
# governed by per-session, per-idle-event bookkeeping.
#
# Payload contract (documented here — no upstream schema fixes this event
# yet): JSON on stdin —
#   {
#     "standing": false,
#     "teammate": { "name": "...", "role": "reviewer" },
#     "pending_tasks": [ { "id": "task-12", "role": "reviewer", "blocked": false }, ... ]
#   }
# `pending_tasks` is the caller's own unblocked/blocked computation for
# tasks on the shared task list; this script does not read the task list
# itself. Missing/unparseable input degrades to "no matching work" (allow
# idle).
#
# Gating (FR-HM23): same as task-completed-gate.sh — no-ops when
# `standing_pools.enabled` is not "true" (resolved via
# scripts/lib/config-get.sh, which falls back for one major version to the
# legacy `.synthex-plus/config.yaml` with a D6 deprecation warning), when
# `hooks.teammate_idle.work_assignment.enabled` is not "true", when node is
# unavailable, or when this project has neither config file at all (fast
# path).
#
# Exit codes:
#   0 - allow idle (gate disabled, no config, standing_pools.enabled is not
#       "true", node is missing, standing-pool teammate, or no matching
#       unblocked work — all fail open)
#   2 - keep working: the task to assign is printed on stderr; assign it
#       before allowing the teammate to go idle

set -u

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"

# Fast path: this hook fires on every idle transition in any Agent Teams
# session, not only Synthex ones. Skip all config/node work when this
# project has neither file below. The second path is the legacy D6
# fallback, readable for one major version.
if [ ! -f "$PROJECT_ROOT/.synthex/config.yaml" ] && [ ! -f "$PROJECT_ROOT/.synthex-plus/config.yaml" ]; then
  exit 0
fi

command -v node >/dev/null 2>&1 || exit 0

SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_DIR_RAW="${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_DIR_RAW="." ;;
esac
SCRIPT_DIR="$(cd -- "$SCRIPT_DIR_RAW" 2>/dev/null && pwd -P)"
[ -n "$SCRIPT_DIR" ] || exit 0

CONFIG_GET="$SCRIPT_DIR/lib/config-get.sh"
[ -r "$CONFIG_GET" ] || exit 0

POOLS_ENABLED="$(bash "$CONFIG_GET" standing_pools.enabled false 2>/dev/null)"
[ "$POOLS_ENABLED" = "true" ] || exit 0

GATE_ENABLED="$(bash "$CONFIG_GET" hooks.teammate_idle.work_assignment.enabled true 2>/dev/null)"
[ "$GATE_ENABLED" = "true" ] || exit 0

CROSS_FUNCTIONAL="$(bash "$CONFIG_GET" hooks.teammate_idle.work_assignment.allow_cross_functional false 2>/dev/null)"

node - "$INPUT" "$CROSS_FUNCTIONAL" <<'NODE_SCRIPT'
const raw = process.argv[2] || '';
const allowCrossFunctional = process.argv[3] === 'true';

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // unparseable input — fail open (allow idle)
}

// Standing Pool Branch (FR-MMT12): the Pool Lead owns this teammate's
// lifecycle; never block. This is the hook's half of the standing-pool
// exemption documented in templates/review.md's Lifecycle Overlay.
if (payload?.standing === true) {
  process.exit(0);
}

const role = payload?.teammate?.role;
const pending = Array.isArray(payload?.pending_tasks) ? payload.pending_tasks : [];

function pickLowestId(tasks) {
  if (tasks.length === 0) return null;
  return tasks
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))[0];
}

// Task Matching + Dependency Respect: unblocked tasks matching the idle
// teammate's role, lowest task number (id) first.
const roleMatches = pending.filter((t) => t && t.role === role && t.blocked !== true);
let assign = pickLowestId(roleMatches);
let crossFunctional = false;

// Cross-Functional Help: only consulted when no role match exists and the
// config explicitly allows it.
if (!assign && allowCrossFunctional) {
  const anyUnblocked = pending.filter((t) => t && t.blocked !== true);
  assign = pickLowestId(anyUnblocked);
  crossFunctional = assign !== null;
}

if (!assign) {
  process.exit(0); // no matching, unblocked work — allow idle
}

const suffix = crossFunctional ? ' (cross-functional suggestion)' : '';
process.stderr.write(
  `teammate-idle-gate: assign ${assign.id} to this teammate before allowing idle${suffix} (FR-HM23).\n`,
);
process.exit(1);
NODE_SCRIPT
NODE_STATUS=$?

if [ "$NODE_STATUS" -ne 0 ]; then
  exit 2
fi

exit 0

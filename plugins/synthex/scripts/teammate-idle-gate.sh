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
# Loop safety net (Task 50 follow-up, same review that found the
# task-completed-gate.sh deadlock): a block here is only ever safe if the
# calling agent actually assigns the named task before the teammate goes
# idle again — if it cannot (the assignment fails, or a caller ignores the
# instruction and re-polls with the same unchanged pending_tasks), the same
# task id would otherwise be re-suggested and re-blocked forever, the same
# structural bug task-completed-gate.sh had. The fix is the same shape: the
# first time this script would block on a given task id, it records that
# under `.synthex/tmp/idle-gate/<task_id>` (checked for writability first,
# same fail-open rule as below); if that same task id is still the top
# match on a later idle event, the second block is skipped (allow idle
# instead) rather than repeat forever. This does not stop the teammate from
# being offered a *different* matching task later — only the specific
# stuck id stops recurring.
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
#       "true", node is missing, standing-pool teammate, no matching
#       unblocked work, this exact task id was already suggested once
#       before, or the idle-gate marker directory is unwritable — all fail
#       open)
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

node - "$INPUT" "$CROSS_FUNCTIONAL" "$PROJECT_ROOT" <<'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const raw = process.argv[2] || '';
const allowCrossFunctional = process.argv[3] === 'true';
const projectRoot = process.argv[4] || process.cwd();

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

// Loop safety net: if this exact task id was already suggested once
// before and is still the top match, allow idle instead of blocking
// again — see this script's header for why (mirrors
// task-completed-gate.sh's once-per-task fix for the same class of bug).
const safeId = String(assign.id).replace(/[^A-Za-z0-9_.-]/g, '_');
const gateDir = path.join(projectRoot, '.synthex', 'tmp', 'idle-gate');
const markerPath = path.join(gateDir, safeId);

let markerExists;
try {
  markerExists = fs.existsSync(markerPath);
} catch {
  process.exit(0); // can't even check — fail open
}

if (markerExists) {
  process.exit(0); // already suggested once for this task id — stop re-blocking
}

try {
  fs.mkdirSync(gateDir, { recursive: true });
  const gitignorePath = path.join(projectRoot, '.synthex', 'tmp', '.gitignore');
  if (!fs.existsSync(gitignorePath)) fs.writeFileSync(gitignorePath, '*\n');
  fs.writeFileSync(markerPath, new Date().toISOString() + '\n');
} catch {
  process.exit(0); // unwritable — fail open rather than deadlock forever
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

#!/usr/bin/env bash
# task-completed-gate.sh — TaskCompleted command hook: distilled work-type
# classification and reviewer routing (FR-HM23).
#
# Fires whenever a teammate marks a task as `completed` on the shared task
# list. Claude Code invokes this as a real command hook — there is no
# prompt-mediated step on TaskCompleted, so the classification table and
# routing decision that used to live entirely in hooks/task-completed-gate.md
# (prose read and interpreted by an LLM) now live here as deterministic code.
# This script CANNOT invoke reviewer subagents itself (a command hook has no
# model turn to spend); its job is to classify the completed work and name
# the reviewers that must see it, via a block reason, before the calling
# agent re-marks the task complete. hooks/task-completed-gate.md is now a
# short doc describing this behavior, not the behavior itself.
#
# Payload contract (documented here — no upstream schema fixes this event
# yet): JSON on stdin with a `files` array (paths touched by the completed
# task), optionally nested under `completion_note.files` or `task.files`.
# Missing/unparseable input degrades to the empty-file-list default (`code`).
# A task id, tried as `task_id`, `id`, or `task.id`, lets the once-per-task
# safety net below key its record; free text tried as `notes`,
# `completion_note` (string or `.text`), `task.description`, or
# `description` is scanned for the verdict marker below.
#
# Bug found in review (Task 50 follow-up): the first version of this script
# always blocked a non-documentation completion, including the re-mark
# after review — there was no way to ever let a task through. Two allow
# paths fix that:
#
#   1. Verdict marker: a payload text field containing
#      `Review verdict: PASS` or `Review verdict: WARN` (case-insensitive)
#      allows (exit 0) — the calling agent writes this into the completion
#      note after getting the named reviewers' input. `Review verdict: FAIL`
#      keeps blocking, with the same reviewers named again.
#   2. Once-per-task safety net: with no verdict marker, a task id is
#      recorded under `.synthex/tmp/task-gate/<task_id>` the first time it
#      blocks; a second completion attempt for the same id is allowed even
#      without a marker, so a teammate that never learns the marker
#      convention is nagged once, not deadlocked forever. If
#      `.synthex/tmp/` cannot be written to (checked before every block),
#      the gate fails open (allow) rather than risk exactly that deadlock
#      from an unwritable marker directory. With no task id in the payload
#      at all, this safety net cannot key a record deterministically, so it
#      is skipped entirely — only the verdict marker can unblock that case,
#      and the block message says so.
#
# Gating (FR-HM23): no-ops (exit 0) when `standing_pools.enabled` resolves to
# anything other than the literal string "true" via scripts/lib/config-get.sh,
# which reads the project's `.synthex/config.yaml`, falling back for one
# major version to the legacy `.synthex-plus/config.yaml` with a D6
# deprecation warning — this keeps the hook silent for Agent Teams sessions
# that have nothing to do with Synthex. Also no-ops when
# `hooks.task_completed.review_gate.enabled` is not "true", when node is
# unavailable (fail open — config-get.sh's own node guard already fails open
# for the config reads themselves; this script additionally needs node to
# parse the JSON payload safely), or when this project has neither config
# file at all (fast path — see below).
#
# The reviewer-routing table (which agents review which work type) is
# hardcoded here rather than config-driven: scripts/lib/config-get.sh's
# documented YAML subset (D26) does not parse flow lists (`[a, b]`), so a
# per-project override of the reviewer roster is not expressible through it.
# config/defaults.yaml still documents the same table for readability; this
# script is the single source of truth it must match.
#
# Exit codes:
#   0 - allow completion (gate disabled, documentation-only change, no
#       config, standing_pools.enabled is not "true", node is missing, a
#       PASS/WARN verdict marker is present, this task id already blocked
#       once before, or the task-gate marker directory is unwritable — all
#       fail open)
#   2 - block completion: the classified work type and its required
#       reviewers are printed on stderr, along with the verdict-marker
#       instructions; route to them before re-marking the task complete

set -u

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"

# Fast path: this hook fires on every task completion in any Agent Teams
# session, not only Synthex ones. Skip all config/node work when this
# project has neither file below — standing_pools.enabled can only ever be
# "true" when one of them exists (the shipped default is false). The
# second path is the legacy D6 fallback, readable for one major version.
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

GATE_ENABLED="$(bash "$CONFIG_GET" hooks.task_completed.review_gate.enabled true 2>/dev/null)"
[ "$GATE_ENABLED" = "true" ] || exit 0

node - "$INPUT" "$PROJECT_ROOT" <<'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const raw = process.argv[2] || '';
const projectRoot = process.argv[3] || process.cwd();

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // unparseable input — fail open
}

function filesFrom(p) {
  if (Array.isArray(p?.files)) return p.files;
  if (Array.isArray(p?.completion_note?.files)) return p.completion_note.files;
  if (Array.isArray(p?.task?.files)) return p.task.files;
  return [];
}

function taskIdFrom(p) {
  if (typeof p?.task_id === 'string' && p.task_id.trim()) return p.task_id.trim();
  if (typeof p?.id === 'string' && p.id.trim()) return p.id.trim();
  if (typeof p?.task?.id === 'string' && p.task.id.trim()) return p.task.id.trim();
  return null;
}

/** Every free-text field a completion payload might carry a verdict in. */
function noteTextsFrom(p) {
  const texts = [];
  if (typeof p?.notes === 'string') texts.push(p.notes);
  if (typeof p?.completion_note === 'string') texts.push(p.completion_note);
  else if (typeof p?.completion_note?.text === 'string') texts.push(p.completion_note.text);
  if (typeof p?.task?.description === 'string') texts.push(p.task.description);
  if (typeof p?.description === 'string') texts.push(p.description);
  return texts.join('\n');
}

/** `Review verdict: PASS|WARN|FAIL` (case-insensitive) -> 'PASS'|'WARN'|'FAIL'|null. */
function verdictFrom(p) {
  const m = noteTextsFrom(p).match(/Review verdict:\s*(PASS|WARN|FAIL)\b/i);
  return m ? m[1].toUpperCase() : null;
}

const files = filesFrom(payload).filter((f) => typeof f === 'string');

// ── Work-type classification (priority order; first match wins) ──────────
// Ported verbatim from synthex-plus's hooks/task-completed-gate.md, its
// "Classification Rules" table.
const isInfra = (f) =>
  /\.(tf|tfvars|hcl)$/i.test(f) ||
  /(^|\/)Dockerfile(\.[^/]*)?$/.test(f) ||
  /(^|\/)docker-compose[^/]*\.ya?ml$/i.test(f) ||
  (/\.ya?ml$/i.test(f) && /(^|\/)(k8s|kubernetes|deploy|infra|cloudformation)\//.test(f)) ||
  /(^|\/)serverless\.ya?ml$/i.test(f) ||
  /\.cdk\.ts$/.test(f);

const isFrontend = (f) =>
  /\.(tsx|jsx)$/.test(f) ||
  /\.(css|scss|less)$/.test(f) ||
  (/\.svg$/.test(f) && /(^|\/)(src|app)\//.test(f)) ||
  /(^|\/)(components|pages|layouts|styles|public|assets)\//.test(f);

const isTest = (f) =>
  /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f) ||
  /(^|\/)(__tests__|tests|test|e2e|cypress|playwright)\//.test(f);

const isCode = (f) =>
  /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|swift|kt|cs|c|cpp|h|hpp)$/.test(f);

const isDoc = (f) => /\.(md|mdx|txt|rst|adoc)$/.test(f) || /(^|\/)docs\//.test(f);

// Ambiguity resolution (verbatim rules):
//  - mixed code + test -> source type, not test (handled: "every" below
//    only returns 'test' when ALL files are test files).
//  - mixed frontend + backend -> frontend (handled: frontend is checked
//    before the generic code rule).
//  - no files listed -> code (the most common default).
function classify(fileList) {
  if (fileList.length === 0) return 'code';
  if (fileList.some(isInfra)) return 'infrastructure';
  if (fileList.some(isFrontend)) return 'frontend';
  if (fileList.every(isTest)) return 'test';
  if (fileList.some(isCode)) return 'code';
  if (fileList.every(isDoc)) return 'documentation';
  return 'code';
}

const workType = classify(files);

if (workType === 'documentation') {
  process.exit(0); // skip condition: documentation-only changes never gate
}

// Default routing table (config/defaults.yaml documents the same table;
// see this script's header for why it is not config-driven).
const REVIEWERS = {
  infrastructure: ['code-reviewer', 'terraform-plan-reviewer'],
  frontend: ['code-reviewer', 'security-reviewer', 'design-system-agent'],
  code: ['code-reviewer', 'security-reviewer'],
  test: ['code-reviewer'],
};

const reviewers = REVIEWERS[workType] || REVIEWERS.code;
const verdict = verdictFrom(payload);

// Allow path 1: a recorded verdict. PASS/WARN means the named reviewers
// already looked at this and the calling agent recorded the outcome.
if (verdict === 'PASS' || verdict === 'WARN') {
  process.exit(0);
}

if (verdict === 'FAIL') {
  process.stderr.write(
    `task-completed-gate: FAIL verdict recorded — route to ${reviewers.join(', ')}, fix the findings, then re-mark complete with ` +
      `"Review verdict: PASS" or "Review verdict: WARN" in the completion note (FR-HM23).\n`,
  );
  process.exit(1);
}

// No verdict marker. Allow path 2: once-per-task safety net, so a
// teammate that never learns the marker convention is nagged once, not
// deadlocked forever — see this script's header for why an unwritable
// marker directory also fails open here rather than risk that same
// deadlock from the other direction.
const taskId = taskIdFrom(payload);
let markerNote = 'No task id in this payload, so the once-per-task safety net cannot key a ' +
  'record — add the `Review verdict: PASS|WARN` marker, since this will otherwise keep blocking on every retry.';

if (taskId) {
  const safeId = taskId.replace(/[^A-Za-z0-9_.-]/g, '_');
  const gateDir = path.join(projectRoot, '.synthex', 'tmp', 'task-gate');
  const markerPath = path.join(gateDir, safeId);

  let markerExists;
  try {
    markerExists = fs.existsSync(markerPath);
  } catch {
    process.exit(0); // can't even check — fail open
  }

  if (markerExists) {
    process.exit(0); // already blocked once for this task id — let it through
  }

  try {
    fs.mkdirSync(gateDir, { recursive: true });
    const gitignorePath = path.join(projectRoot, '.synthex', 'tmp', '.gitignore');
    if (!fs.existsSync(gitignorePath)) fs.writeFileSync(gitignorePath, '*\n');
    fs.writeFileSync(markerPath, new Date().toISOString() + '\n');
  } catch {
    process.exit(0); // unwritable — fail open rather than deadlock forever
  }

  markerNote = 'A repeat completion of this task id will be allowed through even without a marker, ' +
    'but adding `Review verdict: PASS|WARN` to the completion note is preferred.';
}

process.stderr.write(
  `task-completed-gate: ${workType} change — route to ${reviewers.join(', ')}, then re-mark complete with ` +
    `"Review verdict: PASS" or "Review verdict: WARN" in the completion note (FR-HM23). ${markerNote}\n`,
);
process.exit(1);
NODE_SCRIPT
NODE_STATUS=$?

if [ "$NODE_STATUS" -ne 0 ]; then
  exit 2
fi

exit 0

#!/usr/bin/env bash
# auto-decide-gate.sh — PreToolUse(AskUserQuestion) hook for
# `/synthex:next-priority --auto-decide`.
#
# Three modes:
#   auto-decide-gate.sh on    mark the current session ($CLAUDE_CODE_SESSION_ID)
#                             as auto-deciding: creates
#                             .synthex/auto-decide/<session_id>.active
#   auto-decide-gate.sh off   remove that marker (the decision log stays)
#   auto-decide-gate.sh       hook mode: PreToolUse payload on stdin
#
# Hook mode answers an AskUserQuestion call on the user's behalf only when
# ALL of these hold; otherwise it exits 0 silently and the user is asked:
#   - the payload's session_id has an .active marker (so the hook is inert
#     in every session that did not pass --auto-decide)
#   - node is on PATH
#   - no question's text or header contains "[H]" — human-validated
#     acceptance criteria are never auto-approved
#   - every question has exactly one option whose label contains
#     "(Recommended)"
#
# On auto-answer it appends one JSON line per question to
# .synthex/auto-decide/<session_id>.jsonl (time, HEAD before the decision,
# question, choice, alternatives) and returns the answers through
# `updatedInput.answers`, so the dialog never opens. Its
# `additionalContext` tells the model which `Auto-Decision:` commit trailer
# to add to its next commit.
#
# Exit codes:
#   0 - always (fail open; NFR-HM1). on/off exit 1 when the session id or
#       project root is unavailable.

set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
DIR="$ROOT/.synthex/auto-decide"

case "${1:-}" in
  on|off)
    SID="${CLAUDE_CODE_SESSION_ID:-}"
    [ -n "$SID" ] || { echo "auto-decide-gate: \$CLAUDE_CODE_SESSION_ID is empty; hook not armed (prose fallback applies)" >&2; exit 1; }
    if [ "$1" = on ]; then
      mkdir -p "$DIR" && : > "$DIR/$SID.active" && echo "auto-decide: on ($DIR/$SID.jsonl)"
    else
      rm -f "$DIR/$SID.active" && echo "auto-decide: off"
    fi
    exit $?
    ;;
esac

# Fast path: no session has ever armed the hook in this project.
[ -d "$DIR" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

node - "$INPUT" "$DIR" <<'NODE_SCRIPT' || exit 0
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [raw, dir] = process.argv.slice(2);
let p;
try { p = JSON.parse(raw); } catch { process.exit(0); }

const sid = String(p.session_id || '');
if (!/^[A-Za-z0-9_-]+$/.test(sid)) process.exit(0);
if (!fs.existsSync(path.join(dir, `${sid}.active`))) process.exit(0);
if ((p.tool_name || '') !== 'AskUserQuestion') process.exit(0);

const questions = (p.tool_input && p.tool_input.questions) || [];
if (!Array.isArray(questions) || questions.length === 0) process.exit(0);

const REC = /\(recommended\)/i;
const picks = [];
for (const q of questions) {
  const text = `${q.question || ''} ${q.header || ''}`;
  if (text.includes('[H]')) process.exit(0);
  const opts = Array.isArray(q.options) ? q.options : [];
  const rec = opts.filter((o) => REC.test(String(o.label || '')));
  if (rec.length !== 1) process.exit(0);
  picks.push({ q, chosen: rec[0], others: opts.filter((o) => o !== rec[0]) });
}

let before = null;
try {
  before = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: p.cwd || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch { /* not a repo or no commits yet */ }

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const plain = (label) => oneLine(String(label).replace(REC, ''));
const answers = {};
const trailers = [];
const log = [];
const at = new Date().toISOString();
for (const { q, chosen, others } of picks) {
  answers[q.question] = chosen.label;
  const trailer = `Auto-Decision: ${oneLine(q.question)} => ${plain(chosen.label)}`;
  trailers.push(trailer);
  log.push(JSON.stringify({
    at, session_id: sid, cwd: p.cwd || null, before,
    question: q.question, header: q.header || null,
    chosen: plain(chosen.label),
    alternatives: others.map((o) => plain(o.label)),
    trailer,
  }));
}

try {
  fs.appendFileSync(path.join(dir, `${sid}.jsonl`), log.join('\n') + '\n');
} catch {
  process.exit(0); // never answer a decision we could not record
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: 'synthex --auto-decide: answered with the single (Recommended) option',
    updatedInput: { ...p.tool_input, answers },
    additionalContext:
      'Auto-decided (--auto-decide) with the recommended option. Add this git trailer to the next commit ' +
      `that implements the decision (e.g. git commit --trailer '<line>'):\n${trailers.join('\n')}\n` +
      'List it in the bold Auto-decisions section at the top of any PR description for this work.',
  },
}));
NODE_SCRIPT
exit 0

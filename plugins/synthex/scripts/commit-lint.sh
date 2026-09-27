#!/usr/bin/env bash
# commit-lint.sh — PreToolUse(Bash) hook: lints `git commit` subjects
# against Conventional Commits (FR-HM27, D24).
#
# Registered in hooks/hooks.json (Claude Code, matcher "Bash") and in the
# generated hooks/codex-hooks.json (Codex, matcher "shell" — D25); both
# manifests use the same Claude JSON hook shape, so this one script serves
# both hosts unmodified.
#
# Fails open (NFR-HM1). Allows (exit 0) the tool call unless ALL of the
# following hold:
#   - stdin carries a parseable PreToolUse hook payload
#   - node is on PATH (`command -v node` guard below; no jq/python used)
#   - scripts/lib/config-get.sh resolves `git.commit_convention` to
#     EXACTLY "conventional" — a project with no config, or the shipped
#     `auto` default, or any other explicit value (`issue-key`, `gitmoji`,
#     `plain`) is NEVER linted
#   - the tool invoked is the host's shell tool (Claude "Bash" / Codex
#     "shell") and its command is a `git commit` invocation (an optional
#     leading `rtk ` prefix is stripped first, so `rtk git commit ...` is
#     recognized the same as `git commit ...`)
#   - the commit isn't `--amend --no-edit`, `-C`, `-c`, `--fixup`,
#     `--squash`, or in progress inside a merge (`.git/MERGE_HEAD` present)
#   - the subject is extractable deterministically from an inline `-m`
#     (`-F <file>` / `-F -` pass unconditionally — their content is on
#     stdin or in a file the hook never sees, not on the command line)
#
# On block: exit 2 with a fix hint on stderr. Claude Code shows a
# PreToolUse hook's stderr back to the model when it blocks with exit 2;
# Codex, which accepts the identical hook JSON shape, does the same.
#
# Exit codes:
#   0 - allow (the default; see the fail-open conditions above).
#   2 - blocked: the `-m` subject failed the Conventional Commits regex.

set -u

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

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

CONVENTION="$(bash "$CONFIG_GET" git.commit_convention auto 2>/dev/null)"
[ "$CONVENTION" = "conventional" ] || exit 0

# Conventional Commits recognized-type regex — byte-identical to
# .github/workflows/release.yml's CHANGELOG "OTHER=" classification regex.
# tests/schemas/commit-lint-hook-behavioral.test.ts asserts this equality.
CC_REGEX='^(feat|fix|refactor|perf|build|ci|chore|docs|style|test|revert)(\([^)]+\))?!?:'

HINT="$(node - "$INPUT" "$CC_REGEX" <<'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const raw = process.argv[2] || '';
const regexSrc = process.argv[3] || '';

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload.tool_name || payload.toolName || '';
if (!/^(bash|shell)$/i.test(String(toolName))) process.exit(0);

const toolInput = payload.tool_input || payload.toolInput || {};
const command = typeof toolInput.command === 'string' ? toolInput.command : '';
if (!command.trim()) process.exit(0);

// FR-HM27: tolerate an `rtk git commit ...` prefix the same as `git commit ...`.
let cmd = command.trim().replace(/^rtk\s+/, '');
if (!/^git\s+commit\b/.test(cmd)) process.exit(0);

// Minimal shell tokenizer (single/double quotes only) — good enough for a
// hook that only needs to find flag tokens on a `git commit` invocation;
// anything genuinely ambiguous falls through to "no -m found" -> allow.
function tokenize(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length) break;
    let token = '';
    while (i < s.length && !/\s/.test(s[i])) {
      const c = s[i];
      if (c === '"' || c === "'") {
        const quote = c;
        i += 1;
        while (i < s.length && s[i] !== quote) {
          if (quote === '"' && s[i] === '\\' && i + 1 < s.length) {
            token += s[i + 1];
            i += 2;
            continue;
          }
          token += s[i];
          i += 1;
        }
        i += 1; // closing quote
      } else {
        token += c;
        i += 1;
      }
    }
    tokens.push(token);
  }
  return tokens;
}

const tokens = tokenize(cmd);
const rest = tokens.slice(2); // drop "git", "commit"

// Skip: -C, -c, --fixup, --squash (any form), and --amend --no-edit.
const skipExact = new Set(['-C', '-c', '--fixup', '--squash']);
const hasSkipFlag = rest.some(
  (t) => skipExact.has(t) || t.startsWith('-C') || t.startsWith('-c') || t.startsWith('--fixup') || t.startsWith('--squash'),
);
if (hasSkipFlag) process.exit(0);
if (rest.includes('--amend') && rest.includes('--no-edit')) process.exit(0);

// Skip a commit made while a merge is in progress (git worktrees use a
// `.git` FILE with a `gitdir:` pointer instead of a directory).
function resolveGitDir(cwd) {
  try {
    const dotGit = path.join(cwd, '.git');
    const stat = fs.statSync(dotGit);
    if (stat.isDirectory()) return dotGit;
    if (stat.isFile()) {
      const m = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
      if (m) {
        const gitdir = m[1].trim();
        return path.isAbsolute(gitdir) ? gitdir : path.join(cwd, gitdir);
      }
    }
  } catch {
    // fall through
  }
  return null;
}
const cwd = payload.cwd || process.cwd();
const gitDir = resolveGitDir(cwd);
if (gitDir && fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) process.exit(0);

// Extract the first -m/--message subject. -F/--file (including `-F -`)
// always passes: its content isn't on the command line the hook receives.
let subject = null;
let hasFileFlag = false;
for (let i = 0; i < rest.length; i += 1) {
  const t = rest[i];
  if (t === '-m' || t === '--message') {
    if (subject === null) subject = rest[i + 1] ?? '';
  } else if (t.startsWith('--message=')) {
    if (subject === null) subject = t.slice('--message='.length);
  } else if (t === '-F' || t === '--file') {
    hasFileFlag = true;
  } else if (t.startsWith('--file=')) {
    hasFileFlag = true;
  }
}

if (hasFileFlag) process.exit(0);
if (subject === null) process.exit(0);

const regex = new RegExp(regexSrc);
if (regex.test(subject)) process.exit(0);

process.stderr.write(
  `commit-lint: subject does not match Conventional Commits (git.commit_convention: conventional)\n` +
    `  Got:      "${subject}"\n` +
    `  Expected: <type>[(scope)][!]: <description>\n` +
    `  Types:    feat, fix, refactor, perf, build, ci, chore, docs, style, test, revert\n` +
    `  Fix:      rewrite the -m subject (e.g. "feat: add x" or "fix(scope): correct y") and retry.\n`,
);
process.exit(1);
NODE_SCRIPT
)"
NODE_STATUS=$?

if [ "$NODE_STATUS" -ne 0 ]; then
  printf '%s\n' "$HINT" >&2
  exit 2
fi

exit 0

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
#     "shell") and its command contains exactly one `git commit`
#     invocation — alone, or as one step of an `&&`/`||`/`;`/newline chain
#     or the last stage of a pipe (an optional leading `rtk ` prefix is
#     stripped first, so `rtk git commit ...` is recognized the same as
#     `git commit ...`)
#   - the commit isn't `--amend --no-edit`, `-C`, `-c`, `--fixup`,
#     `--squash`, or in progress inside a merge (`.git/MERGE_HEAD` present)
#   - the subject is extractable deterministically from the command string:
#       * an inline literal `-m` / `--message=` value, or
#       * `-F -` / `--file -` / `--file=-` whose stdin is a literal in the
#         same command: a heredoc on the commit (`git commit -F - <<'MSG'`,
#         `<<MSG`, `<<"MSG"`, `<<-MSG`), a heredoc piped in
#         (`cat <<EOF | git commit -F -`), or a single quoted literal piped
#         in (`printf '%s\n' "feat: x" | ...`, `echo "feat: x" | ...`); the
#         subject is the message's first non-empty, non-`#` line
#     Everything else passes unlinted: `-F <file>` (content not on the
#     command line), `-m "$MSG"` / `-m "$(cat <<EOF ...)"`, an unquoted
#     heredoc containing `$`/backticks, a here-string, more than one
#     heredoc, more than one `git commit`, or any other stdin producer.
#
# On block: exit 2 with a fix hint on stderr. Claude Code shows a
# PreToolUse hook's stderr back to the model when it blocks with exit 2;
# Codex, which accepts the identical hook JSON shape, does the same.
#
# Exit codes:
#   0 - allow (the default; see the fail-open conditions above).
#   2 - blocked: the extracted subject failed the Conventional Commits regex.

set -u

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

# Fast path: this hook runs on every shell call. Skip anything that is not
# plausibly a git commit before spawning config-get or node.
case "$INPUT" in
  *git*commit*) ;;
  *) exit 0 ;;
esac

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

// Minimal shell lexer: words (single/double quotes, backslash escapes),
// the list/pipe operators && || | ; and newline, and heredocs (<<TAG,
// <<'TAG', <<"TAG", <<-TAG) whose bodies are read after the next newline,
// as the shell does. Each word records whether it holds an unquoted or
// double-quoted `$`/backtick (an expansion the hook can't evaluate).
// Returns null for anything it can't read deterministically (an
// unterminated heredoc), which the caller treats as "allow".
function lex(s) {
  const items = []; // { word, exp, quoted } | { op } | { heredoc }
  const heredocs = [];
  let pending = [];
  let i = 0;
  const isBreak = (j) =>
    /\s/.test(s[j]) || s[j] === '|' || s[j] === ';' || s.startsWith('&&', j) || s.startsWith('<<', j);
  function readWord() {
    let word = '';
    let exp = false;
    let quoted = false;
    while (i < s.length && !isBreak(i)) {
      const c = s[i];
      if (c === "'") {
        quoted = true;
        const end = s.indexOf("'", i + 1);
        const stop = end === -1 ? s.length : end;
        word += s.slice(i + 1, stop);
        i = stop + 1;
      } else if (c === '"') {
        quoted = true;
        i += 1;
        while (i < s.length && s[i] !== '"') {
          if (s[i] === '\\' && /[$`"\\\n]/.test(s[i + 1] ?? '')) {
            word += s[i + 1];
            i += 2;
            continue;
          }
          if (s[i] === '$' || s[i] === '`') exp = true;
          word += s[i];
          i += 1;
        }
        i += 1; // closing quote
      } else if (c === '\\' && i + 1 < s.length) {
        quoted = true;
        word += s[i + 1];
        i += 2;
      } else {
        if (c === '$' || c === '`') exp = true;
        word += c;
        i += 1;
      }
    }
    return { word, exp, quoted };
  }
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '\n') {
      i += 2; // line continuation
    } else if (c === '\n') {
      items.push({ op: ';' });
      i += 1;
      for (const h of pending) {
        const lines = [];
        for (;;) {
          if (i >= s.length) return null; // unterminated heredoc
          let end = s.indexOf('\n', i);
          if (end === -1) end = s.length;
          let line = s.slice(i, end);
          i = end + 1;
          if (h.strip) line = line.replace(/^\t+/, '');
          if (line === h.tag) break;
          lines.push(line);
        }
        h.body = lines.join('\n');
      }
      pending = [];
    } else if (/\s/.test(c)) {
      i += 1;
    } else if (s.startsWith('&&', i) || s.startsWith('||', i)) {
      items.push({ op: s.slice(i, i + 2) });
      i += 2;
    } else if (c === '|' || c === ';') {
      items.push({ op: c });
      i += 1;
    } else if (s.startsWith('<<<', i)) {
      items.push({ word: '<<<', exp: true, quoted: false }); // here-string: not extracted
      i += 3;
    } else if (s.startsWith('<<', i)) {
      i += 2;
      const strip = s[i] === '-';
      if (strip) i += 1;
      while (s[i] === ' ' || s[i] === '\t') i += 1;
      const tag = readWord();
      if (!tag.word) return null;
      const h = { tag: tag.word, strip, quoted: tag.quoted, body: null };
      heredocs.push(h);
      pending.push(h);
      items.push({ heredoc: h });
    } else {
      items.push(readWord());
    }
  }
  if (pending.length) return null;
  return { items, heredocs };
}

const lexed = lex(command);
if (!lexed) process.exit(0);

// Split into simple commands, remembering the operator before each, so a
// `git commit` is found anywhere in a chain (`git add . && git commit ...`)
// or at the end of a pipe (`cat <<EOF | git commit -F -`).
const segments = [{ prevOp: null, words: [], heredocs: [] }];
for (const item of lexed.items) {
  if (item.op) segments.push({ prevOp: item.op, words: [], heredocs: [] });
  else if (item.heredoc) segments[segments.length - 1].heredocs.push(item.heredoc);
  else segments[segments.length - 1].words.push(item);
}
// FR-HM27: tolerate an `rtk git commit ...` prefix the same as `git commit ...`.
for (const seg of segments) if (seg.words[0]?.word === 'rtk') seg.words.shift();
const commitIdx = segments
  .map((seg, idx) => (seg.words[0]?.word === 'git' && seg.words[1]?.word === 'commit' ? idx : -1))
  .filter((idx) => idx !== -1);
if (commitIdx.length !== 1) process.exit(0); // none, or more than one: ambiguous
const commitSeg = segments[commitIdx[0]];
const rest = commitSeg.words.slice(2).map((w) => w.word); // drop "git", "commit"

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

// Extract the first -m/--message subject, or the -F/--file argument.
let subject = null;
let fileArg = null;
for (let i = 0; i < rest.length; i += 1) {
  const t = rest[i];
  if (t === '-m' || t === '--message') {
    if (subject !== null) continue;
    subject = rest[i + 1] ?? '';
    // `-m "$(cat <<EOF ...)"` / `-m "$MSG"`: the value isn't literal — allow.
    if (commitSeg.words[i + 3]?.exp) process.exit(0);
  } else if (t.startsWith('--message=')) {
    if (subject !== null) continue;
    subject = t.slice('--message='.length);
    if (commitSeg.words[i + 2].exp) process.exit(0);
  } else if (t === '-F' || t === '--file') {
    fileArg = rest[i + 1] ?? '';
  } else if (t.startsWith('--file=')) {
    fileArg = t.slice('--file='.length);
  }
}

// `-F -`: lint the stdin message only when this same command supplies it
// as a literal — a heredoc on the commit, or a heredoc / single-literal
// printf/echo piped into it. Anything else (a variable, command
// substitution, a here-string, a second heredoc, another producer)
// returns null -> allow.
function stdinMessage() {
  if (lexed.heredocs.length > 1) return null;
  if (rest.some((t) => t.startsWith('<'))) return null; // other stdin redirect
  const fromHeredoc = (h) => (h.quoted || !/[$`]/.test(h.body) ? h.body : null);
  if (commitSeg.heredocs.length === 1) {
    return commitSeg.prevOp === '|' ? null : fromHeredoc(commitSeg.heredocs[0]);
  }
  if (commitSeg.prevOp !== '|') return null;
  const producer = segments[commitIdx[0] - 1];
  if (producer.words.some((w) => w.exp)) return null;
  const argv = producer.words.map((w) => w.word);
  if (argv[0] === 'cat' && argv.length === 1 && producer.heredocs.length === 1) {
    return fromHeredoc(producer.heredocs[0]);
  }
  if (producer.heredocs.length) return null;
  if (argv[0] === 'echo' && argv.length === 2 && !argv[1].startsWith('-')) return argv[1];
  if (argv[0] === 'printf' && argv.length >= 2 && !argv[1].startsWith('-')) {
    const [fmt, ...args] = argv.slice(1);
    if (fmt.replace(/\\n/g, '') === '%s' && args.length) return args.join('\n');
    if (!args.length && !fmt.includes('%') && !/\\[^n]/.test(fmt)) return fmt.replace(/\\n/g, '\n');
  }
  return null;
}

if (fileArg !== null) {
  // `-F <path>` (content not on the command line), or -m with -F (git
  // rejects that itself): allow.
  if (subject !== null || fileArg !== '-') process.exit(0);
  const message = stdinMessage();
  if (message === null) process.exit(0);
  subject = message.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
}
if (subject === null) process.exit(0);

const regex = new RegExp(regexSrc);
if (regex.test(subject)) process.exit(0);

process.stderr.write(
  `commit-lint: subject does not match Conventional Commits (git.commit_convention: conventional)\n` +
    `  Got:      "${subject}"\n` +
    `  Expected: <type>[(scope)][!]: <description>\n` +
    `  Types:    feat, fix, refactor, perf, build, ci, chore, docs, style, test, revert\n` +
    `  Fix:      rewrite the subject — the -m value, or the first line of the -F - message (e.g. "feat: add x" or "fix(scope): correct y") and retry.\n`,
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

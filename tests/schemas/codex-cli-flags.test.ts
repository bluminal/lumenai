/**
 * Codex CLI command-line validity against captured `--help` output.
 *
 * Synthex documents `codex ...` command lines in many places (the
 * codex-review-prompter adapter, configure-multi-model's auth-check table,
 * the host matrix / generated hosts.md + hosts.env headless recipe, the
 * adapter recipes spec, and the Codex Layer 2 fixtures). Earlier revisions
 * shipped commands that do not exist on current Codex CLI, so the Codex
 * adapter always failed:
 *   - `codex auth status` → "error: unrecognized subcommand 'status'"; the
 *     real auth check is `codex login status` (exit 0 + "Logged in using ...").
 *   - `codex exec --approval-mode never` → no such flag on `exec`.
 *   - `codex exec ... -a never` → "unexpected argument" (exit 2): `-a` /
 *     `--ask-for-approval` is a top-level `codex` flag only, and `codex exec`
 *     never asks for approval anyway.
 *
 * This test is DATA-DRIVEN from the captured help text in
 * tests/fixtures/cli-help/codex/codex-<version>-<scope>.txt. Each file's
 * `Usage: codex <subcommand path> ...` line says which (sub)command it
 * describes, its `Commands:` section lists valid subcommands, and its
 * `Options:` section lists valid flags (plus `[possible values: ...]`).
 * Every documented `codex ...` command is checked against the NEWEST
 * captured version. A future Codex CLI bump only needs new
 * `codex-<new-version>-*.txt` captures (`codex --help`, `codex exec --help`,
 * `codex login --help`, `codex login status --help`, `codex app-server --help`).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const HELP_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'cli-help', 'codex');

// ── Captured help → command model ───────────────────────────────────────────

interface FlagSpec {
  takesValue: boolean;
  values: string[] | null;
}
interface Scope {
  file: string;
  subcommands: Set<string>;
  flags: Map<string, FlagSpec>;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const HELP_FILES = readdirSync(HELP_DIR).filter((f) => /^codex-\d+(\.\d+)*-.+\.txt$/.test(f));
const VERSIONS = [...new Set(HELP_FILES.map((f) => f.match(/^codex-(\d+(?:\.\d+)*)-/)![1]))].sort(compareVersions);
const LATEST = VERSIONS[VERSIONS.length - 1];

function parseHelp(file: string): { path: string; scope: Scope } {
  const text = readFileSync(join(HELP_DIR, file), 'utf8');
  const lines = text.split('\n');
  const usage = lines.find((l) => l.startsWith('Usage: codex'));
  if (!usage) throw new Error(`${file}: no "Usage: codex" line`);
  const pathTokens: string[] = [];
  for (const tok of usage.replace(/^Usage:\s+codex\s*/, '').split(/\s+/)) {
    if (!tok || tok.startsWith('[') || tok.startsWith('<')) break;
    pathTokens.push(tok);
  }
  const scope: Scope = { file, subcommands: new Set(), flags: new Map() };
  let section: 'commands' | 'options' | null = null;
  let lastFlags: string[] = [];
  for (const line of lines) {
    if (/^Commands:/.test(line)) { section = 'commands'; continue; }
    if (/^Options:/.test(line)) { section = 'options'; continue; }
    if (/^\S/.test(line)) { section = null; continue; }
    if (section === 'commands') {
      const m = line.match(/^ {2}([a-z][\w-]*)\s{2,}(.*)$/);
      if (m) {
        scope.subcommands.add(m[1]);
        const alias = m[2].match(/\[aliases?: ([^\]]+)\]/);
        if (alias) for (const a of alias[1].split(/,\s*/)) scope.subcommands.add(a.trim());
      }
    } else if (section === 'options') {
      const m = line.match(/^\s+((?:-[A-Za-z0-9], )?--[\w-]+|-[A-Za-z0-9])(\s+<[^>]+>(\.\.\.)?)?\s*$/);
      if (m) {
        const names = m[1].split(/,\s*/);
        const spec: FlagSpec = { takesValue: Boolean(m[2]), values: null };
        for (const n of names) scope.flags.set(n, spec);
        lastFlags = names;
        continue;
      }
      const pv = line.match(/\[possible values: ([^\]]+)\]/);
      if (pv && lastFlags.length) {
        const vals = pv[1].split(/,\s*/).map((v) => v.trim());
        for (const n of lastFlags) scope.flags.get(n)!.values = vals;
      }
      const listed = line.match(/^\s+- ([a-z][\w-]*):/);
      if (listed && lastFlags.length) {
        for (const n of lastFlags) {
          const spec = scope.flags.get(n)!;
          spec.values = [...(spec.values ?? []), listed[1]];
        }
      }
    }
  }
  return { path: pathTokens.join(' '), scope };
}

function loadScopes(version: string): Map<string, Scope> {
  const scopes = new Map<string, Scope>();
  for (const f of HELP_FILES.filter((x) => x.startsWith(`codex-${version}-`))) {
    const { path, scope } = parseHelp(f);
    scopes.set(path, scope);
  }
  return scopes;
}

const SCOPES = loadScopes(LATEST);

// ── Command-line tokenizer + checker ───────────────────────────────────────

const TERMINATORS = new Set(['|', '||', '&&', ';', '&']);

/** Shell-ish tokenizer: quotes, `${...}` groups, `[...]` optional markers stripped. */
function tokenize(cmd: string): Array<{ text: string; quoted: boolean }> {
  const out: Array<{ text: string; quoted: boolean }> = [];
  let i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const end = cmd.indexOf(c, i + 1);
      const j = end === -1 ? cmd.length : end;
      out.push({ text: cmd.slice(i + 1, j), quoted: true });
      i = j + 1;
      continue;
    }
    if (cmd.startsWith('${', i)) {
      let depth = 0;
      let j = i;
      for (; j < cmd.length; j++) {
        if (cmd[j] === '{') depth++;
        else if (cmd[j] === '}' && --depth === 0) break;
      }
      const group = cmd.slice(i, j + 1);
      // ${VAR:+-m "$VAR"} expands to its alternate words: check those.
      const alt = group.match(/^\$\{\w+:\+(.*)\}$/s);
      if (alt) out.push(...tokenize(alt[1]));
      else out.push({ text: group, quoted: true });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < cmd.length && !/\s/.test(cmd[j])) j++;
    out.push({ text: cmd.slice(i, j), quoted: false });
    i = j;
  }
  return out;
}

function isRedirect(t: string): boolean {
  return /^\d*[<>]/.test(t);
}

/** Returns the problems with one documented `codex ...` command line (empty = valid). */
function checkCommand(cmd: string, scopes: Map<string, Scope> = SCOPES): string[] {
  const problems: string[] = [];
  const toks = tokenize(cmd);
  if (toks[0]?.text !== 'codex') return [`not a codex command: ${cmd}`];
  const path: string[] = [];
  let scope = scopes.get('')!;
  let positionalSeen = false;
  for (let k = 1; k < toks.length; k++) {
    let { text } = toks[k];
    const { quoted } = toks[k];
    if (!quoted) {
      if (TERMINATORS.has(text) || isRedirect(text)) break;
      text = text.replace(/^\[+/, '').replace(/[\])},.;:]+$/, '');
      if (!text) continue;
    }
    if (!quoted && text.startsWith('-') && text !== '-') {
      const [name, inline] = text.split('=', 2);
      if (name === '--help' || name === '-h') continue;
      const spec = scope?.flags.get(name);
      if (!spec) {
        problems.push(`\`codex ${path.join(' ')}\` has no flag ${name} (captured help: ${scope?.file ?? 'none'})`);
        continue;
      }
      if (spec.takesValue) {
        const value = inline ?? toks[++k]?.text;
        const literal = value !== undefined && /^[a-z][\w-]*$/.test(value);
        if (spec.values && literal && !spec.values.includes(value!)) {
          problems.push(`\`codex ${path.join(' ')} ${name}\` does not accept "${value}" (possible: ${spec.values.join(', ')})`);
        }
      }
      continue;
    }
    // Positional.
    const bareWord = !quoted && /^[a-z][a-z0-9-]*$/.test(text);
    if (!positionalSeen && bareWord && scope && scope.subcommands.size > 0) {
      if (!scope.subcommands.has(text)) {
        problems.push(`\`codex ${[...path, text].join(' ')}\`: unknown subcommand "${text}" (captured help: ${scope.file})`);
        break;
      }
      path.push(text);
      const next = scopes.get(path.join(' '));
      if (!next && k + 1 < toks.length && toks.slice(k + 1).some((t) => !t.quoted && t.text.startsWith('-') && t.text !== '-' && !/^--?h(elp)?$/.test(t.text))) {
        problems.push(`\`codex ${path.join(' ')}\` takes flags here but has no captured help fixture`);
        break;
      }
      scope = next as Scope;
      continue;
    }
    positionalSeen = true;
  }
  return problems;
}

// ── Documented command discovery ─────────────────────────────────────────────

/** Where documented `codex ...` commands live. Frozen snapshots and PM-owned docs/plans, docs/reqs are out of scope. */
const SCAN_ROOTS = [
  'plugins',
  'docs/specs',
  'tests/fixtures/multi-model-review/adapters/codex',
  '.claude-plugin',
  '.agents',
  '.grok-plugin',
  'README.md',
  'CLAUDE.md',
];
const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.cjs', '.ts', '.sh', '.env', '.json', '.yaml', '.yml', '.txt', '.toml', '']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__snapshots__']);

function walk(rel: string, acc: string[] = []): string[] {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) return acc;
  const st = statSync(abs);
  if (st.isFile()) {
    if (TEXT_EXT.has(extname(abs))) acc.push(rel);
    return acc;
  }
  for (const name of readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(join(rel, name), acc);
  }
  return acc;
}

const SCANNED_FILES = SCAN_ROOTS.flatMap((r) => walk(r));

interface Documented { file: string; line: number; cmd: string }

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Cut a command at the end of its shell statement. */
function trimCommand(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Fenced blocks whose `codex ...` lines are shell commands (json/yaml/etc. blocks hold prose strings). */
const SHELL_FENCE_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console']);

function extract(file: string): Documented[] {
  const text = readFileSync(join(REPO_ROOT, file), 'utf8');
  const out: Documented[] = [];
  // 1. Inline code spans / JS template-ish backtick spans: `codex ...`
  for (const m of text.matchAll(/`(codex\s[^`\n]*)`/g)) {
    out.push({ file, line: lineOf(text, m.index!), cmd: trimCommand(m[1]) });
  }
  // 2. JSON string values: "codex ..."
  if (file.endsWith('.json')) {
    for (const m of text.matchAll(/"(codex\s(?:[^"\\]|\\.)*)"/g)) {
      out.push({ file, line: lineOf(text, m.index!), cmd: trimCommand(m[1].replace(/\\"/g, '"')) });
    }
  }
  // 3. Plain-text recorded invocations: whole lines starting with codex.
  if (file.endsWith('.txt')) {
    text.split('\n').forEach((l, i) => {
      if (/^codex\s/.test(l)) out.push({ file, line: i + 1, cmd: trimCommand(l) });
    });
  }
  // 4. Markdown fenced code blocks: any `codex <word>` on a (continuation-joined) line.
  if (file.endsWith('.md')) {
    const lines = text.split('\n');
    let inFence = false;
    let shellFence = false;
    for (let i = 0; i < lines.length; i++) {
      const fence = lines[i].match(/^\s*```\s*([\w-]*)/);
      if (fence) {
        inFence = !inFence;
        shellFence = inFence && SHELL_FENCE_LANGS.has(fence[1].toLowerCase());
        continue;
      }
      if (!inFence || !shellFence) continue;
      let joined = lines[i];
      const start = i;
      while (/\\\s*$/.test(joined) && i + 1 < lines.length) joined = joined.replace(/\\\s*$/, ' ') + lines[++i];
      for (const m of joined.matchAll(/(?:^|[\s(])(codex\s+[a-z-][^\n]*)/g)) {
        out.push({ file, line: start + 1, cmd: trimCommand(m[1]) });
      }
    }
  }
  return out;
}

const DOCUMENTED: Documented[] = SCANNED_FILES.flatMap(extract);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('captured Codex CLI help fixtures', () => {
  it('at least one version is captured, with root, exec, login and login status scopes', () => {
    expect(LATEST).toBeTruthy();
    for (const path of ['', 'exec', 'login', 'login status']) {
      expect(SCOPES.has(path), `missing codex-${LATEST}-*.txt for \`codex ${path}\``).toBe(true);
    }
  });

  it('parses the expected anchors out of the help text (parser sanity)', () => {
    const root = SCOPES.get('')!;
    const exec = SCOPES.get('exec')!;
    expect(root.subcommands.has('exec')).toBe(true);
    expect(root.subcommands.has('login')).toBe(true);
    expect(root.subcommands.has('auth')).toBe(false);
    expect(root.flags.has('-a')).toBe(true);
    expect(exec.flags.get('--sandbox')!.values).toEqual(['read-only', 'workspace-write', 'danger-full-access']);
    expect(exec.flags.get('-s')!.takesValue).toBe(true);
    for (const f of ['--ephemeral', '--skip-git-repo-check', '--json', '--output-schema', '-o', '--output-last-message', '-m', '-C']) {
      expect(exec.flags.has(f), f).toBe(true);
    }
    expect(exec.flags.has('-a')).toBe(false);
    expect(exec.flags.has('--ask-for-approval')).toBe(false);
    expect(exec.flags.has('--approval-mode')).toBe(false);
    expect(SCOPES.get('login')!.subcommands.has('status')).toBe(true);
  });
});

describe('checker self-test: known-bad commands are rejected, known-good accepted', () => {
  it.each([
    'codex auth status',
    'codex exec --approval-mode never "x"',
    'codex exec --json --sandbox read-only --approval-mode never "x"',
    'codex exec --sandbox workspace-write -a never',
    'codex exec --ask-for-approval never -',
    'codex exec --sandbox readonly -',
    'codex app-server --json <prompt>',
  ])('rejects: %s', (cmd) => {
    expect(checkCommand(cmd)).not.toEqual([]);
  });

  it.each([
    'codex login status',
    'codex login',
    'codex exec --sandbox workspace-write',
    'codex exec --sandbox read-only --ephemeral --skip-git-repo-check --json ${MODEL:+--model="$MODEL"} --output-schema s.json -o "$LAST" - < "$PROMPT" > "$RAW"',
    'codex exec --sandbox danger-full-access --ephemeral --json -o "$LAST" -',
    'codex -a never exec -',
    'codex app-server --help',
    'codex app-server',
  ])('accepts: %s', (cmd) => {
    expect(checkCommand(cmd)).toEqual([]);
  });
});

describe(`documented codex command lines are valid on Codex CLI ${LATEST}`, () => {
  it('discovers the commands this test exists to guard (extractor sanity)', () => {
    const has = (file: string, re: RegExp) => DOCUMENTED.some((d) => d.file === file && re.test(d.cmd));
    expect(has('plugins/synthex/agents/codex-review-prompter.md', /^codex exec --sandbox read-only .*--output-schema/)).toBe(true);
    expect(has('plugins/synthex/agents/codex-review-prompter.md', /^codex login status/)).toBe(true);
    expect(has('plugins/synthex/commands/configure-multi-model.md', /^codex login status$/)).toBe(true);
    expect(has('plugins/synthex/scripts/lib/host-matrix.mjs', /^codex exec --sandbox workspace-write/)).toBe(true);
    expect(has('plugins/synthex/docs/hosts.md', /^codex exec --sandbox workspace-write/)).toBe(true);
    expect(has('plugins/synthex/config/hosts.env', /^codex exec --sandbox workspace-write/)).toBe(true);
    expect(has('docs/specs/multi-model-review/adapter-recipes.md', /^codex exec --sandbox read-only/)).toBe(true);
  });

  it.each(DOCUMENTED.map((d) => [`${d.file}:${d.line}`, d.cmd] as const))('%s — %s', (_where, cmd) => {
    expect(checkCommand(cmd)).toEqual([]);
  });
});

describe('explicit regressions: nonexistent Codex commands/flags never reappear', () => {
  it('no scanned file contains `codex auth status`', () => {
    const offenders = SCANNED_FILES.filter((f) => /codex auth status/.test(readFileSync(join(REPO_ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no documented codex command passes --approval-mode', () => {
    expect(DOCUMENTED.filter((d) => /--approval-mode/.test(d.cmd)).map((d) => `${d.file}:${d.line}`)).toEqual([]);
  });

  it('no documented `codex exec` passes -a / --ask-for-approval after `exec`', () => {
    const offenders = DOCUMENTED.filter((d) => {
      const after = d.cmd.match(/^codex(?:\s+-\S+(?:\s+\S+)?)*?\s+(?:exec|e)\s+(.*)$/);
      return after !== null && /(^|\s)(-a|--ask-for-approval)(\s|=|$)/.test(after[1]);
    });
    expect(offenders.map((d) => `${d.file}:${d.line}`)).toEqual([]);
  });

  // `${MODEL:+-m "$MODEL"}` splits into two words in bash but stays ONE word
  // ("-m gpt-5") in zsh, the macOS default shell; clap then reads --model with
  // the value " gpt-5". The single-word `${MODEL:+--model="$MODEL"}` works in both.
  it('no documented codex command uses a two-word ${VAR:+-flag "$VAR"} expansion', () => {
    const twoWord = /\$\{\w+:\+-[\w-]+\s+"/;
    expect(DOCUMENTED.filter((d) => twoWord.test(d.cmd)).map((d) => `${d.file}:${d.line}`)).toEqual([]);
  });

  it('the adapter\'s optional model flag expands to a single --model=<value> word in bash and zsh', () => {
    const adapter = readFileSync(join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'codex-review-prompter.md'), 'utf8');
    const expansion = adapter.match(/\$\{MODEL:\+[^}]*\}/)?.[0];
    expect(expansion).toBe('${MODEL:+--model="$MODEL"}');
    for (const shell of ['bash', 'zsh']) {
      let out: string;
      try {
        out = execFileSync(shell, ['-c', `MODEL=gpt-5; printf '[%s]\\n' ${expansion}`], { encoding: 'utf8' });
      } catch {
        continue; // shell not installed
      }
      expect(out, shell).toBe('[--model=gpt-5]\n');
    }
  });

  it('no documented codex command uses --dangerously-bypass-approvals-and-sandbox', () => {
    expect(DOCUMENTED.filter((d) => /--dangerously-bypass-approvals-and-sandbox/.test(d.cmd)).map((d) => d.file)).toEqual([]);
  });
});


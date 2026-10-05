/**
 * multi-model-review Task 69: cursor-review.sh runner (D25, D26, D28, D29,
 * D31, D37-D43).
 *
 * Runs plugins/synthex/scripts/adapters/cursor-review.sh against a stub
 * `cursor-agent` on a restricted PATH. The stub records argv, stdin, the env
 * vars the runner must set or scrub, `pwd -P`, the workspace listing and the
 * deny file it sees, and it simulates Cursor's local state (U15): every
 * review call creates `$HOME/.cursor/projects/<slug of its cwd>` and, when
 * the scenario names a session, `$HOME/.cursor/chats/<hash>/<session_id>`.
 * It then replays a scenario: Task 67's sanitized recordings
 * (tests/fixtures/multi-model-review/adapters/cursor/recordings/) wherever a
 * case was recorded, synthetic streams only where it was not. The real
 * cursor-agent is never run, and HOME is always a seeded scratch dir, never
 * the real ~/.cursor.
 *
 * The runner runs from a throwaway plugin root whose files are symlinks to
 * the real ones (runner, deny file, config-get, defaults.yaml, the strict
 * findings schema), except `scripts/validate-findings`, which is a spy that
 * logs each call and then execs the real script.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SMOKE_CASES, buildRestrictedPath } from '../compat/lib/script-smoke.mjs';

const ROOT = join(__dirname, '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'synthex');
const RUNNER = join(PLUGIN, 'scripts', 'adapters', 'cursor-review.sh');
const RUNNER_SRC = readFileSync(RUNNER, 'utf8');
const DENY_SHIPPED = join(PLUGIN, 'scripts', 'adapters', 'cursor-deny-all.cli.json');
const SHARED_SCHEMA = JSON.parse(readFileSync(join(PLUGIN, 'agents', '_shared', 'codex-findings.schema.json'), 'utf8'));
const CURSOR_DIR = join(ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters', 'cursor');
const REC_DIR = join(CURSOR_DIR, 'recordings');
const HELP_DIR = join(CURSOR_DIR, 'cli-help');
// Captured from the real CLI while logged in (a free check, sanitized): pins the --auth-check match (U13).
const STATUS_LOGGED_IN_JSON = readFileSync(join(CURSOR_DIR, 'status', 'logged-in.json'), 'utf8');
const STATUS_LOGGED_IN_TEXT = readFileSync(join(CURSOR_DIR, 'status', 'logged-in.txt'), 'utf8');
const CURSOR_VERSION = readFileSync(join(HELP_DIR, 'version.txt'), 'utf8').trim();
const DENY_RECORDED = join(REC_DIR, 'deny-all.cli.json');

const T = 30_000;
const SLUG = 'claude-opus-5-thinking-high';
const FAMILY = 'anthropic';
const RETRY_TEXT = 'Your previous response could not be parsed as JSON. Respond with ONLY valid JSON, no markdown fences, no prose.';

// ---------------------------------------------------------------------------
// Restricted PATH, stub cursor-agent, spy plugin root
// ---------------------------------------------------------------------------

const POSIX_TOOLS = [
  'bash', 'sh', 'sed', 'awk', 'grep', 'cut', 'wc', 'sort', 'head', 'tr',
  'mv', 'rm', 'mkdir', 'date', 'od', 'dirname', 'basename', 'cat', 'mktemp',
  'ls', 'cksum', 'sleep', 'printf', 'true', 'false', 'find', 'ln',
];

const WHICH_CACHE = new Map<string, string | null>();
function which(tool: string): string | null {
  if (!WHICH_CACHE.has(tool)) {
    const r = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
    const p = r.status === 0 ? r.stdout.trim() : '';
    WHICH_CACHE.set(tool, p.startsWith('/') ? p : null);
  }
  return WHICH_CACHE.get(tool) ?? null;
}

const HAS_JQ = which('jq') !== null;
const TIMEOUT_TOOL = which('timeout') ?? which('gtimeout');

let ROOT_TMP = '';
let seq = 0;

/**
 * mkdirHook replaces `mkdir`: for the workspace's `.cursor` dir it fails
 * ('fail'), pre-creates `cli.json` as a regular file ('clobber') or as a
 * symlink to /dev/null ('devnull'). rmHook replaces `rm`: right before the
 * auth probe (the runner clears `<state>/status.out`), it removes the
 * scratch workspace ('gone') or swaps it for a symlink to the project
 * ('swap'). weirdScratch makes `mktemp` create the workspace under an
 * unsafe name, so its Cursor slug cannot be derived.
 */
type BinOpts = {
  node?: boolean;
  jq?: boolean;
  timeout?: boolean;
  cursor?: boolean;
  mkdirHook?: 'fail' | 'clobber' | 'devnull';
  rmHook?: 'gone' | 'swap';
  weirdScratch?: string;
};

function makeBin(opts: BinOpts = {}): string {
  const { node = true, jq = false, timeout = false, cursor = true, mkdirHook, rmHook, weirdScratch } = opts;
  const bin = join(ROOT_TMP, `bin-${seq++}`);
  mkdirSync(bin, { recursive: true });
  const link = (tool: string) => {
    const src = which(tool);
    if (src && !existsSync(join(bin, tool))) symlinkSync(src, join(bin, tool));
  };
  POSIX_TOOLS.filter((t) => !['mkdir', 'rm', 'mktemp'].includes(t)).forEach((t) => link(t));
  if (node) link('node');
  if (jq) link('jq');
  if (timeout && TIMEOUT_TOOL) symlinkSync(TIMEOUT_TOOL, join(bin, 'timeout'));
  const bash = join(bin, 'bash');
  const write = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!${bash}\n${body}`);
    chmodSync(join(bin, name), 0o755);
  };
  if (cursor) write('cursor-agent', stubBody());
  // mktemp: records the workspace and state dirs it creates (so hooks and
  // assertions can find them), and can make the workspace name unsafe.
  write(
    'mktemp',
    `case "$*" in
  *synthex-cursor.XXXXXX*)
    ${weirdScratch ? `d="/tmp/synthex-cursor.${weirdScratch}"; ${which('mkdir')} "$d" || exit 1; printf '%s' "$d" > "$STUB_LOG/w.path"; printf '%s\\n' "$d"; exit 0` : `d=$(${which('mktemp')} "$@") || exit $?; printf '%s' "$d" > "$STUB_LOG/w.path"; printf '%s\\n' "$d"; exit 0`} ;;
  *synthex-cursor-run.XXXXXX*)
    d=$(${which('mktemp')} "$@") || exit $?; printf '%s' "$d" > "$STUB_LOG/s.path"; printf '%s\\n' "$d"; exit 0 ;;
esac
exec ${which('mktemp')} "$@"
`,
  );
  write(
    'mkdir',
    `for a in "$@"; do
  case "$a" in
    */synthex-cursor.*/.cursor)
      ${
        mkdirHook === 'fail'
          ? 'exit 1'
          : mkdirHook === 'clobber'
            ? `${which('mkdir')} "$a" && : > "$a/cli.json"; exit $?`
            : mkdirHook === 'devnull'
              ? `${which('mkdir')} "$a" && ${which('ln')} -s /dev/null "$a/cli.json"; exit $?`
              : ':'
      } ;;
  esac
done
exec ${which('mkdir')} "$@"
`,
  );
  write(
    'rm',
    `${which('rm')} "$@"; rc=$?
for a in "$@"; do
  case "$a" in
    */status.out)
      w=$(cat "$STUB_LOG/w.path" 2>/dev/null)
      if [ -n "$w" ] && [ -d "$w" ]; then
        ${rmHook === 'gone' ? `${which('rm')} -rf "$w"` : rmHook === 'swap' ? `${which('rm')} -rf "$w"; ${which('ln')} -s "$PWD" "$w"` : ':'}
      fi ;;
  esac
done
exit $rc
`,
  );
  return bin;
}

const RECORDED_ENV = ['HOME', 'CURSOR_CONFIG_DIR', 'CURSOR_API_KEY', 'CURSOR_API_ENDPOINT'];
const PS = which('ps');
const CHMOD = which('chmod');

/**
 * Stub cursor-agent. `status` records itself and prints
 * $STUB_SCENARIO/status.stdout (default: a synthetic logged-in JSON form);
 * with status.swap it then moves its cwd (the workspace) to <dir>.moved and
 * leaves a symlink to it in its place; it sleeps status.sleep and exits
 * status.exit. Any other call is a review invocation N: it records argv,
 * stdin, env, pwd, the workspace listing, the deny file and (with
 * STUB_GREP) which files under the workspace and state dirs contain that
 * string; simulates Cursor's local state; runs N.hook (else default.hook)
 * with bash in the workspace (STUB_SLUG is its Cursor slug, STUB_PROJ the
 * project); then prints N.stdout (else default.stdout), sleeps N.sleep,
 * prints N.stderr and exits N.exit. status.hook runs the same way, before
 * the status answer.
 */
function stubBody(): string {
  return `L="$STUB_LOG"; D="$STUB_SCENARIO"
dump_env() { for v in ${RECORDED_ENV.join(' ')}; do if [ -n "\${!v+x}" ]; then printf '%s=%s\\n' "$v" "\${!v}"; fi; done; }
listing() { (cd "$1" && find . -mindepth 1 | LC_ALL=C sort); }
if [ "\${1:-}" = "status" ]; then
  n=$(cat "$L/status.count" 2>/dev/null || printf 0); n=$((n + 1)); printf '%s' "$n" > "$L/status.count"
  printf '%s\\0' "$@" > "$L/status-$n.argv"; pwd -P > "$L/status-$n.pwd"; dump_env > "$L/status-$n.env"
  listing . > "$L/status-$n.ls"
  if [ -e "$D/status.hook" ]; then bash "$D/status.hook" < /dev/null > /dev/null 2>&1; fi
  if [ -e "$D/status.stdout" ]; then cat "$D/status.stdout"; else printf '{"isAuthenticated":true,"email":"<email>"}\\n'; fi
  if [ -e "$D/status.swap" ]; then d=$(pwd -P); mv "$d" "$d.moved"; ln -s "$d.moved" "$d"; fi
  if [ -e "$D/status.sleep" ]; then sleep "$(cat "$D/status.sleep")"; fi
  if [ -e "$D/status.exit" ]; then exit "$(cat "$D/status.exit")"; fi
  exit 0
fi
n=$(cat "$L/count" 2>/dev/null || printf 0); n=$((n + 1)); printf '%s' "$n" > "$L/count"
printf '%s\\0' "$@" > "$L/inv-$n.argv"; pwd -P > "$L/inv-$n.pwd"; dump_env > "$L/inv-$n.env"; printf '%s' "$$" > "$L/inv-$n.pid"
listing . > "$L/inv-$n.ls"
if [ -e .cursor/cli.json ]; then cat .cursor/cli.json > "$L/inv-$n.clijson"; fi
cat > "$L/inv-$n.stdin"
if [ -n "\${STUB_GREP:-}" ]; then grep -rlF -- "$STUB_GREP" "$(pwd -P)" "$(cat "$L/s.path")" > "$L/inv-$n.grep" 2>/dev/null; fi
slug=$(pwd -P | sed 's#^/##; s#[^A-Za-z0-9]#-#g'); printf '%s' "$slug" > "$L/inv-$n.slug"
if [ -e "$D/state.symlink" ]; then
  mkdir -p "$HOME/.cursor/projects"; ln -s "$(cat "$D/state.symlink")" "$HOME/.cursor/projects/$slug"
else
  mkdir -p "$HOME/.cursor/projects/$slug" && : > "$HOME/.cursor/projects/$slug/.workspace-trusted"
fi
if [ -e "$D/session" ]; then
  h=$(cat "$D/hash" 2>/dev/null || printf 'a1b2c3d4e5'); s=$(cat "$D/session")
  mkdir -p "$HOME/.cursor/chats/$h/$s" && : > "$HOME/.cursor/chats/$h/$s/store.db"
fi
pick() { if [ -e "$D/$n.$1" ]; then printf '%s' "$D/$n.$1"; elif [ -e "$D/default.$1" ]; then printf '%s' "$D/default.$1"; fi; }
f=$(pick hook); if [ -n "$f" ]; then STUB_SLUG="$slug" bash "$f" < /dev/null > /dev/null 2>&1; fi
f=$(pick stdout); if [ -n "$f" ]; then cat "$f"; fi
f=$(pick sleep); if [ -n "$f" ]; then sleep "$(cat "$f")"; fi
f=$(pick stderr); if [ -n "$f" ]; then cat "$f" >&2; fi
f=$(pick exit); if [ -n "$f" ]; then exit "$(cat "$f")"; fi
exit 0
`;
}

let SPY_PLUGIN = '';
let SPY_RUNNER = '';

function makeSpyPlugin(): void {
  SPY_PLUGIN = join(ROOT_TMP, 'plugin');
  ['scripts/adapters', 'scripts/lib', 'config', 'agents/_shared'].forEach((d) => mkdirSync(join(SPY_PLUGIN, d), { recursive: true }));
  const ln = (rel: string) => symlinkSync(join(PLUGIN, rel), join(SPY_PLUGIN, rel));
  ln('scripts/adapters/cursor-review.sh');
  ln('scripts/adapters/cursor-deny-all.cli.json');
  ln('scripts/lib/config-get.sh');
  ln('config/defaults.yaml');
  ln('agents/_shared/codex-findings.schema.json');
  // hosts.env plus one test host with a 17 s shell cap (17 - 15 = 2 s clamp).
  writeFileSync(
    join(SPY_PLUGIN, 'config', 'hosts.env'),
    readFileSync(join(PLUGIN, 'config', 'hosts.env'), 'utf8') + 'SYNTHEX_HOST_TESTHOST_SHELL_CAP=17\n',
  );
  writeFileSync(
    join(SPY_PLUGIN, 'scripts', 'validate-findings'),
    `#!/usr/bin/env bash
n=$(cat "$VF_LOG/count" 2>/dev/null || printf 0); n=$((n + 1)); printf '%s' "$n" > "$VF_LOG/count"
printf '%s\\0' "$@" > "$VF_LOG/call-$n.argv"
prev=""; for a in "$@"; do if [ "$prev" = "--input" ]; then cat "$a" > "$VF_LOG/call-$n.input"; fi; prev="$a"; done
exec bash "${join(PLUGIN, 'scripts', 'validate-findings')}" "$@"
`,
  );
  chmodSync(join(SPY_PLUGIN, 'scripts', 'validate-findings'), 0o755);
  SPY_RUNNER = join(SPY_PLUGIN, 'scripts', 'adapters', 'cursor-review.sh');
}

// ---------------------------------------------------------------------------
// Recordings, scenarios and the run helper
// ---------------------------------------------------------------------------

/** hook: a bash script the stub runs in the workspace before printing stdout. */
type Step = { stdout?: string; stderr?: string; exit?: number; sleep?: number; hook?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = Record<string, any>;

const RECORDINGS = [
  'c3-free-plan-named-model',
  'c3b-auto-review-success',
  'c4-adversarial-no-deny-file',
  'c4b-neutral-read-no-deny-file',
  'c5-large-inline-prompt-deny-all',
  'c6-unknown-model',
  'c7-neutral-read-deny-all',
  'c8-large-stdin-prompt-deny-all',
] as const;
type Recording = (typeof RECORDINGS)[number];

/** A recording as a stub step; `sid` replaces every `<redacted-id>` (so the stream names a real-looking session). */
function rec(name: Recording, sid?: string): Step {
  const d = join(REC_DIR, name);
  const read = (f: string) => readFileSync(join(d, f), 'utf8');
  const stdout = read('stdout.ndjson');
  return {
    stdout: sid ? stdout.replaceAll('<redacted-id>', sid) : stdout,
    stderr: read('stderr.txt'),
    exit: Number.parseInt(read('exit_code').trim(), 10),
  };
}

function recEvents(name: Recording): Ev[] {
  return readFileSync(join(REC_DIR, name, 'stdout.ndjson'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Ev);
}

const nd = (evs: Ev[]) => evs.map((e) => JSON.stringify(e)).join('\n') + '\n';

const INIT: Ev = { type: 'system', subtype: 'init', apiKeySource: 'login', cwd: '<scratch>', session_id: '<redacted-id>', model: 'Claude Opus 5', permissionMode: 'default' };
const FINDING = {
  finding_id: 'users.js:sql-injection',
  severity: 'high',
  category: 'security',
  title: 'SQL injection',
  description: 'id is concatenated into the SQL string.',
  file: 'src/users.js',
  symbol: 'getUser',
  line_range: null,
  confidence: 'high',
};
const ANSWER = JSON.stringify({ findings: [FINDING] });
const assistant = (text: string): Ev => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, session_id: '<redacted-id>' });
const result = (over: Ev = {}): Ev => ({
  type: 'result',
  subtype: 'success',
  duration_ms: 1000,
  duration_api_ms: 1000,
  is_error: false,
  result: ANSWER,
  session_id: '<redacted-id>',
  request_id: '<redacted-id>',
  usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
  ...over,
});
const toolCall = (subtype: string, id: string, payload: Ev): Ev => ({ type: 'tool_call', subtype, call_id: id, tool_call: { ...payload, toolCallId: id }, session_id: '<redacted-id>' });

/** A synthetic successful stream: init, optional middle events, the answer, a result. */
function stream(middle: Ev[] = [], opts: { answer?: string; result?: Ev | null; init?: Ev | null } = {}): string {
  const evs: Ev[] = [];
  if (opts.init !== null) evs.push(opts.init ?? INIT);
  evs.push(...middle);
  evs.push(assistant(opts.answer ?? ANSWER));
  if (opts.result !== null) evs.push(opts.result ?? result());
  return nd(evs);
}

const ENVELOPE = {
  command: 'review-code',
  context_bundle: {
    manifest: {
      artifact: { path: 'src/users.js', size_bytes: 40, inlined: true },
      conventions: [{ path: 'CLAUDE.md', size_bytes: 12, inlined: true }],
      touched_files: [{ path: 'src/db.js', size_bytes: 20, inlined: true }],
      specs: [{ path: 'docs/specs/users.md', size_bytes: 15, inlined: true }],
    },
    files: [
      { path: 'src/users.js', content: "db.query('SELECT * FROM users WHERE id = ' + id);" },
      { path: 'CLAUDE.md', content: 'Use bound parameters.' },
      { path: 'src/db.js', content: 'export const db = {};' },
      { path: 'docs/specs/users.md', content: 'Users spec.' },
    ],
  } as Ev,
  config: {
    model: SLUG as string | null,
    family: FAMILY as string | null,
    raw_output_path: 'docs/reviews/raw/cursor-review-prompter-0f1e2d3c.ndjson',
  } as Record<string, unknown>,
};
const RAW_REL = ENVELOPE.config.raw_output_path as string;
const INPUT_REL = '.synthex/tmp/cursor-review-prompter-0f1e2d3c.input.json';
const AUTH_CONFIG = `multi_model_review:\n  per_reviewer:\n    cursor-review-prompter:\n      model: ${SLUG}\n      family: ${FAMILY}\n`;

type Inv = { argv: string[]; env: Record<string, string>; pwd: string; stdin: string; ls: string[]; clijson: string | null; slug: string; grep: string[] };
type VfCall = { argv: string[]; input: string | null };

type RunOpts = {
  steps?: Record<string, Step>;
  status?: string;
  statusSleep?: number;
  statusExit?: number;
  statusSwap?: boolean;
  /** A bash script the stub runs in the workspace during `status`. */
  statusHook?: string;
  /** The stub creates ~/.cursor/chats/<hash>/<session> for every review call. */
  session?: string;
  hash?: string;
  /** The stub makes projects/<slug> a symlink to this dir instead of a dir. */
  stateSymlink?: string;
  config?: string;
  envelopeConfig?: Record<string, unknown>;
  bundle?: Ev;
  env?: Record<string, string>;
  bin?: BinOpts;
  args?: string[];
  auth?: boolean;
  /** Seeds the scratch HOME before the run. */
  seedHome?: (home: string) => void;
  grep?: string;
};

type RunResult = {
  status: number;
  stdout: string;
  stderr: string;
  envelope: Ev | null;
  invocations: Inv[];
  statusCalls: Inv[];
  vf: VfCall[];
  proj: string;
  home: string;
  rawPath: string;
  wPath: string;
  sPath: string;
  durationMs: number;
};

function readNulList(p: string): string[] {
  const parts = readFileSync(p, 'utf8').split('\0');
  parts.pop();
  return parts;
}

function readEnv(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

const readIf = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const count = (dir: string, file: string) => (existsSync(join(dir, file)) ? Number.parseInt(readFileSync(join(dir, file), 'utf8'), 10) : 0);

type Case = { proj: string; log: string; vfLog: string; bin: string; home: string; args: string[]; env: Record<string, string> };

/** Writes one case's scenario, config, scratch HOME and input envelope; spawns nothing. */
function setupCase(opts: RunOpts = {}): Case {
  const caseDir = mkdtempSync(join(ROOT_TMP, 'case-'));
  const proj = join(caseDir, 'proj');
  const log = join(caseDir, 'log');
  const vfLog = join(caseDir, 'vf');
  const scen = join(caseDir, 'scenario');
  const home = join(caseDir, 'home');
  [proj, log, vfLog, scen, home].forEach((d) => mkdirSync(d, { recursive: true }));
  opts.seedHome?.(home);

  const steps = opts.steps ?? { default: rec('c7-neutral-read-deny-all') };
  for (const [key, step] of Object.entries(steps)) {
    if (step.stdout !== undefined) writeFileSync(join(scen, `${key}.stdout`), step.stdout);
    if (step.stderr !== undefined) writeFileSync(join(scen, `${key}.stderr`), step.stderr);
    if (step.exit !== undefined) writeFileSync(join(scen, `${key}.exit`), String(step.exit));
    if (step.sleep !== undefined) writeFileSync(join(scen, `${key}.sleep`), String(step.sleep));
    if (step.hook !== undefined) writeFileSync(join(scen, `${key}.hook`), step.hook);
  }
  if (opts.statusHook !== undefined) writeFileSync(join(scen, 'status.hook'), opts.statusHook);
  if (opts.status !== undefined) writeFileSync(join(scen, 'status.stdout'), opts.status);
  if (opts.statusSleep !== undefined) writeFileSync(join(scen, 'status.sleep'), String(opts.statusSleep));
  if (opts.statusExit !== undefined) writeFileSync(join(scen, 'status.exit'), String(opts.statusExit));
  if (opts.statusSwap) writeFileSync(join(scen, 'status.swap'), '');
  if (opts.session !== undefined) writeFileSync(join(scen, 'session'), opts.session);
  if (opts.hash !== undefined) writeFileSync(join(scen, 'hash'), opts.hash);
  if (opts.stateSymlink !== undefined) writeFileSync(join(scen, 'state.symlink'), opts.stateSymlink);
  if (opts.config !== undefined) {
    mkdirSync(join(proj, '.synthex'), { recursive: true });
    writeFileSync(join(proj, '.synthex', 'config.yaml'), opts.config);
  }
  const envelope = {
    ...ENVELOPE,
    context_bundle: opts.bundle ?? ENVELOPE.context_bundle,
    config: { ...ENVELOPE.config, ...(opts.envelopeConfig ?? {}) },
  };
  mkdirSync(join(proj, '.synthex', 'tmp'), { recursive: true });
  writeFileSync(join(proj, INPUT_REL), JSON.stringify(envelope));

  const bin = makeBin(opts.bin);
  return {
    proj,
    log,
    vfLog,
    bin,
    home,
    args: opts.auth ? ['--auth-check'] : (opts.args ?? ['--input', INPUT_REL]),
    env: {
      PATH: bin,
      STUB_LOG: log,
      STUB_SCENARIO: scen,
      VF_LOG: vfLog,
      STUB_PROJ: proj,
      HOME: home,
      ...(opts.grep ? { STUB_GREP: opts.grep } : {}),
      ...(opts.env ?? {}),
    },
  };
}

/** Spawns the runner asynchronously, so independent cases can run concurrently. */
function run(opts: RunOpts = {}): Promise<RunResult> {
  const c = setupCase(opts);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(join(c.bin, 'bash'), [SPY_RUNNER, ...c.args], { cwd: c.proj, env: c.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve(readCase(c, { status: status ?? -1, stdout, stderr }, !!opts.auth, Date.now() - started));
    });
  });
}

function readInv(log: string, prefix: string): Inv {
  const ls = readIf(join(log, `${prefix}.ls`));
  const grep = readIf(join(log, `${prefix}.grep`));
  return {
    argv: readNulList(join(log, `${prefix}.argv`)),
    env: readEnv(join(log, `${prefix}.env`)),
    pwd: readFileSync(join(log, `${prefix}.pwd`), 'utf8').trim(),
    stdin: readIf(join(log, `${prefix}.stdin`)) ?? '',
    ls: ls === null ? [] : ls.split('\n').filter((l) => l !== ''),
    clijson: readIf(join(log, `${prefix}.clijson`)),
    slug: readIf(join(log, `${prefix}.slug`)) ?? '',
    grep: grep === null ? [] : grep.split('\n').filter((l) => l !== ''),
  };
}

/** Reads back what the stub and the validate-findings spy recorded. */
function readCase(c: Case, r: { status: number; stdout: string; stderr: string }, auth: boolean, durationMs: number): RunResult {
  const invocations: Inv[] = [];
  for (let n = 1; n <= count(c.log, 'count'); n++) invocations.push(readInv(c.log, `inv-${n}`));
  const statusCalls: Inv[] = [];
  for (let n = 1; n <= count(c.log, 'status.count'); n++) statusCalls.push(readInv(c.log, `status-${n}`));
  const vf: VfCall[] = [];
  for (let n = 1; n <= count(c.vfLog, 'count'); n++) {
    vf.push({ argv: readNulList(join(c.vfLog, `call-${n}.argv`)), input: readIf(join(c.vfLog, `call-${n}.input`)) });
  }
  let envelope: Ev | null = null;
  if (!auth) {
    try {
      envelope = JSON.parse(r.stdout);
    } catch {
      envelope = null;
    }
  }
  return {
    ...r,
    envelope,
    invocations,
    statusCalls,
    vf,
    proj: c.proj,
    home: c.home,
    rawPath: join(c.proj, RAW_REL),
    wPath: readIf(join(c.log, 'w.path')) ?? '',
    sPath: readIf(join(c.log, 's.path')) ?? '',
    durationMs,
  };
}

/** validate-findings normalization calls (the --error path is not one). */
const normalizeCalls = (r: RunResult) => r.vf.filter((c) => !c.argv.includes('--error'));
const stderrLog = (r: RunResult) => readIf(`${r.rawPath}.stderr.log`) ?? '';
const violationCount = (r: RunResult) => Number.parseInt(/(\d+) tool-call violation/.exec(String(r.envelope?.error_message))?.[1] ?? '-1', 10);

const ALL_INVOCATIONS: Array<{ mode: 'input' | 'auth'; branch: string; argv: string[] }> = [];
function collect(r: RunResult, mode: 'input' | 'auth', branch: string): RunResult {
  r.invocations.forEach((i) => ALL_INVOCATIONS.push({ mode, branch, argv: i.argv }));
  r.statusCalls.forEach((i) => ALL_INVOCATIONS.push({ mode, branch, argv: i.argv }));
  return r;
}

beforeAll(() => {
  ROOT_TMP = mkdtempSync(join(tmpdir(), 'cursor-runner-test-'));
  makeSpyPlugin();
});

afterAll(() => {
  rmSync(ROOT_TMP, { recursive: true, force: true });
});

const SCRATCH_RE = /^(\/private)?\/tmp\/synthex-cursor\.[A-Za-z0-9]{6}$/;
const EXACT_ARGV = ['-p', '--mode', 'ask', '--sandbox', 'enabled', '--trust', '--output-format', 'stream-json', '--model', SLUG];
const NEVER_FLAGS = ['-f', '--force', '--yolo', '--approve-mcps', '--auto-review', '--api-key', '--add-dir', '--plugin-dir', '--stream-partial-output'];

/**
 * Both JSON-tool paths: node, and the jq fallback hosts without node take
 * (skipped, not dropped, on a host without jq).
 */
const TOOL_PATHS: Array<[string, BinOpts, boolean]> = [
  ['node', { node: true }, false],
  ['jq only', { node: false, jq: true }, !HAS_JQ],
];

/** Live processes whose command line contains <tag> (forked runner subshells keep the runner's argv). */
function procsMatching(tag: string): string[] {
  if (!PS) return [];
  const r = spawnSync(PS, ['-axo', 'pid=,command='], { encoding: 'utf8' });
  return (r.stdout ?? '').split('\n').filter((l) => l.includes(tag) && !l.includes(' ps -axo'));
}

/** Both timeout branches: the bash watchdog, and timeout/gtimeout when installed. */
const BRANCHES: Array<[string, BinOpts]> = [
  ['bash watchdog', { timeout: false }],
  ...(TIMEOUT_TOOL !== null ? ([['timeout binary', { timeout: true }]] as Array<[string, BinOpts]>) : []),
];

// ---------------------------------------------------------------------------
// Source contract
// ---------------------------------------------------------------------------

const CODE_LINES = RUNNER_SRC.split('\n').filter((l) => !l.trim().startsWith('#'));

describe('cursor-review.sh source contract', () => {
  it('has the Task 68 scratch-dir guard under set -eu, the /tmp template and the EXIT trap', () => {
    const setIdx = RUNNER_SRC.search(/^set -eu$/m);
    const guardIdx = RUNNER_SRC.indexOf('[ -n "$W" ] && [ -d "$W" ] && [ "$W" != "$PWD" ]');
    expect(setIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(setIdx);
    expect(RUNNER_SRC).toContain('mktemp -d /tmp/synthex-cursor.XXXXXX');
    expect(RUNNER_SRC).toMatch(/trap cleanup EXIT/);
  });

  it('isolate() checks cd and pwd -P itself before touching the environment', () => {
    const body = (/\nisolate\(\) \{\n([\s\S]*?)\n\}/.exec(RUNNER_SRC) as RegExpExecArray)[1];
    expect(body).toContain('cd -- "$W" 2>/dev/null || exit 125');
    expect(body).toContain('[ "$(pwd -P)" = "$W" ] || exit 125');
    expect(body.indexOf('|| exit 125')).toBeLessThan(body.indexOf('unset CURSOR_CONFIG_DIR'));
  });

  it('never names a banned flag in its code, and never sets CURSOR_CONFIG_DIR (D37)', () => {
    const code = CODE_LINES.join('\n');
    for (const banned of ['--force', '--yolo', '--approve-mcps', '--auto-review', '--api-key', '--add-dir', '--plugin-dir', '--stream-partial-output']) {
      expect(code, banned).not.toContain(banned);
    }
    expect(code).not.toMatch(/CURSOR_CONFIG_DIR=/);
    expect(code).not.toMatch(/export CURSOR_CONFIG_DIR/);
    expect(code).toContain('unset CURSOR_CONFIG_DIR');
  });

  it('never calls the `agent` alias, and never edits hook config (D41)', () => {
    const code = CODE_LINES.join('\n');
    expect(code).not.toMatch(/(^|[\s;|&(])agent\s/m);
    for (const hook of ['hooks.json', 'settings.json', 'disabled-hooks']) expect(code, hook).not.toContain(hook);
  });

  it('every cursor-agent call goes through guarded() (one timeout path)', async () => {
    const calls = CODE_LINES.filter((l) => /cursor-agent "\$@"|exec "\$\{cmd\[@\]\}"/.test(l));
    expect(calls.length).toBeGreaterThan(0);
    const guardedBody = (/\nguarded\(\) \{\n([\s\S]*?)\n\}/.exec(RUNNER_SRC) as RegExpExecArray)[1];
    for (const l of calls) expect(guardedBody, l).toContain(l.trim());
    const callers = CODE_LINES.filter((l) => /\bguarded "/.test(l));
    expect(callers.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Argv, stdin, environment, cwd and the workspace (D25, D26, D37, D39)
// ---------------------------------------------------------------------------

describe('argv, stdin, isolation env and cwd (stub cursor-agent records them)', () => {
  let r: RunResult;
  const judge = 'You are the aggregator. Judge the findings below.';
  beforeAll(async () => {
    r = collect(
      await run({
        envelopeConfig: { judge_mode_prompt: judge },
        env: { CURSOR_CONFIG_DIR: '/nonexistent/cursor-config', CURSOR_API_KEY: 'dummy-test-value', CURSOR_API_ENDPOINT: 'https://endpoint.invalid' },
        grep: 'Use bound parameters.',
      }),
      'input',
      'bash watchdog',
    );
  }, T);

  it('makes exactly one review invocation and returns success', () => {
    expect(r.invocations).toHaveLength(1);
    expect(r.envelope?.status).toBe('success');
  });

  it('argv is exactly -p --mode ask --sandbox enabled --trust --output-format stream-json --model <slug>, with no prompt argument', () => {
    expect(r.invocations[0].argv).toEqual(EXACT_ARGV);
  });

  it('argv never carries a banned flag', () => {
    for (const inv of [...r.invocations, ...r.statusCalls]) {
      for (const banned of NEVER_FLAGS) expect(inv.argv, banned).not.toContain(banned);
    }
  });

  it('stdin is the whole prompt, starting with the --- ROLE --- judge_mode_prompt prefix (D31, D39)', () => {
    const p = r.invocations[0].stdin;
    expect(p.startsWith(`--- ROLE ---\n${judge}\n\n`)).toBe(true);
    expect(p).toContain('You have NO tools');
    expect(p).toContain('--- CONVENTIONS ---\n=== CLAUDE.md ===\nUse bound parameters.');
    expect(p).toContain('--- TOUCHED FILES ---\n=== src/db.js ===');
    expect(p).toContain('--- SPECS ---\n=== docs/specs/users.md ===');
    expect(p).toContain("--- ARTIFACT UNDER REVIEW ---\n=== src/users.js ===\ndb.query('SELECT * FROM users WHERE id = ' + id);");
    expect(p).toContain(JSON.stringify(SHARED_SCHEMA));
    expect(p).toContain('Command context: review-code');
    expect(p).not.toContain(RETRY_TEXT);
  });

  it('cwd is the canonical /tmp scratch dir (not the repo), removed afterwards along with the state dir', () => {
    const { pwd } = r.invocations[0];
    expect(pwd).toMatch(SCRATCH_RE);
    expect([r.wPath, `/private${r.wPath}`]).toContain(pwd);
    expect(pwd).not.toBe(realpathSync(r.proj));
    expect(existsSync(pwd)).toBe(false);
    expect(r.sPath).not.toBe('');
    expect(existsSync(r.sPath)).toBe(false);
  });

  it('the only file in the workspace is .cursor/cli.json: no review-input.txt, AGENTS.md, CLAUDE.md, prompt or bundle file', () => {
    expect(r.invocations[0].ls).toEqual(['./.cursor', './.cursor/cli.json']);
    expect(r.statusCalls[0].ls).toEqual(['./.cursor', './.cursor/cli.json']);
  });

  it('no file in the workspace or the runner state dir holds the bundle while cursor-agent runs (D39)', () => {
    expect(r.invocations[0].grep).toEqual([]);
  });

  it('CURSOR_CONFIG_DIR is absent although the parent set it, and HOME is the real one (the login stays, D37)', () => {
    for (const inv of [r.invocations[0], r.statusCalls[0]]) {
      expect(inv.env).not.toHaveProperty('CURSOR_CONFIG_DIR');
      expect(inv.env.HOME).toBe(r.home);
    }
  });

  it('CURSOR_API_ENDPOINT is absent from the probe and the review although the parent set it (the bundle and login go only to Cursor)', () => {
    expect(r.invocations[0].env).not.toHaveProperty('CURSOR_API_ENDPOINT');
    expect(r.statusCalls[0].env).not.toHaveProperty('CURSOR_API_ENDPOINT');
  });

  it('CURSOR_API_KEY is absent without the allow_api_key_billing opt-in (D26, Q10)', () => {
    expect(r.invocations[0].env).not.toHaveProperty('CURSOR_API_KEY');
    expect(r.statusCalls[0].env).not.toHaveProperty('CURSOR_API_KEY');
  });

  it('the auth probe ran first, from the same workspace', () => {
    expect(r.statusCalls).toHaveLength(1);
    expect(r.statusCalls[0].argv).toEqual(['status', '--format', 'json']);
    expect(r.statusCalls[0].pwd).toBe(r.invocations[0].pwd);
  });
});

describe.concurrent('prompt delivery and key opt-in', () => {
  it('a prompt over 131,072 bytes arrives whole on stdin; argv stays the exact 10 tokens (D39)', async () => {
    const big = `${'x'.repeat(140_000)}END-OF-BIG-FILE`;
    const bundle = {
      manifest: { artifact: { path: 'big.js' } },
      files: [{ path: 'big.js', content: big }],
    };
    const r = await run({ bundle });
    expect(r.envelope?.status).toBe('success');
    expect(r.invocations[0].stdin.length).toBeGreaterThan(131_072);
    expect(r.invocations[0].stdin).toContain(`=== big.js ===\n${big}\n`);
    expect(r.invocations[0].argv).toEqual(EXACT_ARGV);
  }, T);

  it('without judge_mode_prompt the prompt starts with the reviewer instructions', async () => {
    const r = await run();
    expect(r.invocations[0].stdin.startsWith('You are a code reviewer')).toBe(true);
    expect(r.invocations[0].stdin).not.toContain('--- ROLE ---');
  }, T);

  it('keeps CURSOR_API_KEY with the per-reviewer project-config opt-in', async () => {
    const a = await run({
      env: { CURSOR_API_KEY: 'dummy-test-value' },
      config: 'multi_model_review:\n  per_reviewer:\n    cursor-review-prompter:\n      allow_api_key_billing: true\n',
    });
    expect(a.invocations[0].env.CURSOR_API_KEY).toBe('dummy-test-value');
    expect(a.statusCalls[0].env.CURSOR_API_KEY).toBe('dummy-test-value');
  }, T);

  it('the input envelope alone cannot opt in: config.allow_api_key_billing true without the project-config opt-in leaves CURSOR_API_KEY unset (D26, Q10)', async () => {
    const b = await run({ env: { CURSOR_API_KEY: 'dummy-test-value' }, envelopeConfig: { allow_api_key_billing: true } });
    expect(b.invocations).toHaveLength(1);
    expect(b.invocations[0].env).not.toHaveProperty('CURSOR_API_KEY');
    expect(b.statusCalls[0].env).not.toHaveProperty('CURSOR_API_KEY');
    // Logged out with only the key: the envelope flag does not turn it into an opt-in.
    const c = await run({ env: { CURSOR_API_KEY: 'dummy-test-value' }, envelopeConfig: { allow_api_key_billing: true }, status: '{"isAuthenticated":false}' });
    expect(c.envelope?.error_code).toBe('cli_auth_failed');
    expect(c.envelope?.error_message).toContain('only CURSOR_API_KEY');
    expect(c.invocations).toHaveLength(0);
  }, T);
});

// ---------------------------------------------------------------------------
// Deny file (D37)
// ---------------------------------------------------------------------------

describe.concurrent('deny file (D37)', () => {
  const recorded = readFileSync(DENY_RECORDED);

  it('lockstep: the shipped deny file is byte-identical to recordings/deny-all.cli.json', () => {
    expect(readFileSync(DENY_SHIPPED).equals(recorded)).toBe(true);
  });

  it('the shipped rules are exactly the tested deny-all list, with no WebFetch(*) until Q9 resolves', () => {
    const cfg = JSON.parse(readFileSync(DENY_SHIPPED, 'utf8'));
    expect(cfg).toEqual({
      permissions: { allow: [], deny: ['Read(**)', 'Read(/**)', 'Read(~/**)', 'Write(**)', 'Write(/**)', 'Shell(*)', 'Mcp(*:*)'] },
    });
    expect(JSON.stringify(cfg)).not.toContain('WebFetch');
  });

  it('before the spawn, <scratch>/.cursor/cli.json parses to exactly the recorded rules', async () => {
    const r = await run();
    expect(r.invocations[0].clijson).not.toBeNull();
    expect(JSON.parse(r.invocations[0].clijson as string)).toEqual(JSON.parse(recorded.toString('utf8')));
    expect(r.invocations[0].clijson).toBe(recorded.toString('utf8'));
  }, T);

  it.each([
    ['the .cursor dir cannot be created', 'fail'],
    ['cli.json already exists (it is never clobbered)', 'clobber'],
    ['the read-back differs (cli.json is a symlink to /dev/null)', 'devnull'],
  ] as const)('%s: cli_failed with 0 cursor-agent calls; --auth-check exits 11', async (_label, mkdirHook) => {
    const r = await run({ bin: { mkdirHook } });
    expect(r.envelope?.status).toBe('failed');
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('deny file');
    expect(r.invocations).toHaveLength(0);
    expect(r.statusCalls).toHaveLength(0);
    const a = await run({ auth: true, config: AUTH_CONFIG, bin: { mkdirHook } });
    expect(a.status).toBe(11);
    expect(a.statusCalls).toHaveLength(0);
    expect(a.stderr).toContain('deny file');
  }, T);
});

describe.concurrent.each(TOOL_PATHS)('deny file read back right before every cursor-agent spawn (D37; %s)', (_tool, tool, skip) => {
  const itT = skip ? it.skip : it;
  const PERMISSIVE = `printf '%s' '{"permissions":{"allow":["Read(**)"],"deny":[]}}' > .cursor/cli.json`;
  const REMOVE = 'rm -f .cursor/cli.json';

  itT('the read-back differs (cli.json is a symlink to /dev/null): cli_failed with 0 calls; --auth-check exits 11', async () => {
    const r = await run({ bin: { ...tool, mkdirHook: 'devnull' } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('deny file');
    expect(r.invocations).toHaveLength(0);
    expect(r.statusCalls).toHaveLength(0);
    const a = await run({ auth: true, config: AUTH_CONFIG, bin: { ...tool, mkdirHook: 'devnull' } });
    expect(a.status).toBe(11);
    expect(a.statusCalls).toHaveLength(0);
  }, T);

  itT.each([
    ['rewritten with permissive rules', PERMISSIVE],
    ['removed', REMOVE],
  ])('the auth probe left it %s: cli_failed, and the review is never spawned', async (_label, statusHook) => {
    const r = await run({ bin: tool, statusHook });
    expect(r.statusCalls).toHaveLength(1);
    expect(r.invocations).toHaveLength(0);
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('Before review attempt 1, the D37 deny file');
  }, T);

  itT.each([
    ['rewritten with permissive rules', PERMISSIVE],
    ['removed', REMOVE],
  ])('review attempt 1 left it %s before a parse_failed retry: cli_failed, and the retry is never spawned', async (_label, hook) => {
    const r = await run({ bin: tool, steps: { '1': { stdout: stream([], { answer: 'prose' }), exit: 0, hook }, default: { stdout: stream(), exit: 0 } } });
    expect(r.invocations).toHaveLength(1);
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('Before review attempt 2, the D37 deny file');
  }, T);
});

// ---------------------------------------------------------------------------
// Model and family guard (D26)
// ---------------------------------------------------------------------------

describe.concurrent('model and family guard (D26)', () => {
  it.each([
    ['model null', { model: null }],
    ["model ''", { model: '' }],
    ['model auto', { model: 'auto' }],
    ['model Auto', { model: 'Auto' }],
    ['model auto-fast', { model: 'auto-fast' }],
    ['family missing', { family: null }],
    ['a model that is not a slug (leading dash)', { model: '--yolo' }],
  ] as const)('%s gives cli_failed with 0 invocations', async (_label, over) => {
    const r = await run({ envelopeConfig: over as Record<string, unknown> });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('explicit, non-Auto model');
    expect(r.invocations).toHaveLength(0);
    expect(r.statusCalls).toHaveLength(0);
  }, T);

  it('falls back to per_reviewer.cursor-review-prompter.{model,family} when the envelope carries null', async () => {
    const r = await run({ envelopeConfig: { model: null, family: null }, config: AUTH_CONFIG });
    expect(r.envelope?.status).toBe('success');
    expect(r.invocations[0].argv).toEqual(EXACT_ARGV);
    expect(r.envelope?.findings[0].source.family).toBe(FAMILY);
  }, T);

  it.each([
    ['no model or family configured', ''],
    ['model auto', 'multi_model_review:\n  per_reviewer:\n    cursor-review-prompter:\n      model: auto\n      family: anthropic\n'],
    ['no family', `multi_model_review:\n  per_reviewer:\n    cursor-review-prompter:\n      model: ${SLUG}\n`],
  ])('--auth-check exits 12 with %s, and runs no cursor-agent', async (_label, config) => {
    const r = await run({ auth: true, config });
    expect(r.status).toBe(12);
    expect(r.statusCalls).toHaveLength(0);
  }, T);
});

// ---------------------------------------------------------------------------
// Tool-call scan (D38)
// ---------------------------------------------------------------------------

const READ_OK = (id: string, path = '/tmp/x.txt', content = 'file body') => [
  toolCall('started', id, { readToolCall: { args: { path } } }),
  toolCall('completed', id, { readToolCall: { args: { path }, result: { success: { path, content } } } }),
];

describe.concurrent.each(TOOL_PATHS)('tool-call scan (D38): the frozen result-shape allowlist, run before any other mapping (%s)', (_tool, tool, skip) => {
  const itT = skip ? it.skip : it;
  itT.each([
    ['c4-adversarial-no-deny-file', 2],
    ['c4b-neutral-read-no-deny-file', 1],
  ] as const)('%s gives sandbox_violation with %i violation(s), and the raw output is kept', async (name, n) => {
    const step = rec(name);
    const r = await run({ bin: tool, steps: { default: step } });
    expect(r.envelope?.status).toBe('failed');
    expect(r.envelope?.error_code).toBe('sandbox_violation');
    expect(violationCount(r)).toBe(n);
    expect(readFileSync(r.rawPath, 'utf8')).toBe(step.stdout);
    expect(r.envelope?.raw_output_path).toBe(RAW_REL);
    expect(normalizeCalls(r)).toHaveLength(0);
    expect(r.envelope?.error_message).not.toContain('<canary-token>');
  }, T);

  const PAYLOAD_OUTSIDE = assistant(ANSWER);
  (PAYLOAD_OUTSIDE.message as Ev).readToolCall = { result: { success: { content: 'x' } } };

  itT.each([
    ['an unknown result shape', [toolCall('started', 'a', { readToolCall: { args: {} } }), toolCall('completed', 'a', { readToolCall: { result: { rejected: {} } } })]],
    ['a started call that never completes', [toolCall('started', 'a', { readToolCall: { args: { path: 'a' } } })]],
    ['an unknown tool_call subtype', [toolCall('updated', 'a', { readToolCall: { args: {} } })]],
    ['a *ToolCall payload outside a tool_call event', [PAYLOAD_OUTSIDE]],
    ['a successful web call', [toolCall('started', 'w', { webFetchToolCall: { args: { url: 'https://example.invalid' } } }), toolCall('completed', 'w', { webFetchToolCall: { result: { success: { content: 'page' } } } })]],
    ['a successful read inside the workspace', READ_OK('r', '<scratch>/.cursor/cli.json', '{}')],
    ['a tool_call event with two payloads', [toolCall('completed', 'b', { readToolCall: { result: { error: { errorMessage: 'x' } } }, shellToolCall: { result: { error: { errorMessage: 'x' } } } })]],
    ['a glob that found files', [toolCall('completed', 'g', { globToolCall: { result: { success: { files: ['a'], totalFiles: 1 } } } })]],
    ['an error result with an extra key', [toolCall('completed', 'e', { readToolCall: { result: { error: { errorMessage: 'x', content: 'y' } } } })]],
    ['a permissionDenied result with an extra key (stdout)', [toolCall('completed', 'p', { shellToolCall: { result: { permissionDenied: { command: 'cat x', stdout: 'LEAKED-CONTENT' } } } })]],
    ['a permissionDenied result with a non-string command', [toolCall('completed', 'p', { shellToolCall: { result: { permissionDenied: { command: { text: 'LEAKED-CONTENT' } } } } })]],
    ['an empty-files success on a readToolCall (only a glob may have one)', [toolCall('completed', 'r', { readToolCall: { result: { success: { files: [], totalFiles: 0 } } } })]],
    ['an empty glob success with an extra key', [toolCall('completed', 'g', { globToolCall: { result: { success: { files: [], totalFiles: 0, matches: ['/etc/hosts: LEAKED-CONTENT'] } } } })]],
    ['an empty glob success with a mistyped key', [toolCall('completed', 'g', { globToolCall: { result: { success: { files: [], totalFiles: 0, pattern: 5 } } } })]],
    ['a tool_call event with no *ToolCall payload', [{ type: 'tool_call', subtype: 'completed', call_id: 'n', tool_call: { other: {} } }]],
    ['a tolerated error result whose event has no call_id', [{ type: 'tool_call', subtype: 'completed', tool_call: { readToolCall: { result: { error: { errorMessage: 'x' } } } } }]],
  ] as Array<[string, Ev[]]>)('synthetic: %s is a violation, even with a clean answer and exit 0', async (_label, middle) => {
    const r = await run({ bin: tool, steps: { default: { stdout: stream(middle), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('sandbox_violation');
    expect(violationCount(r)).toBe(1);
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  // Raw lines: only text can carry an id a double cannot hold.
  const tcLine = (subtype: string, id: string | null, result?: string) =>
    `{"type":"tool_call","subtype":"${subtype}"${id === null ? '' : `,"call_id":${id}`},"tool_call":{"readToolCall":{"args":{}${result ? `,"result":${result}` : ''}}}}`;
  const ERR = '{"error":{"errorMessage":"denied"}}';
  itT.each([
    ['numeric ids that differ but round to the same double', [tcLine('started', '12345678901234567890'), tcLine('completed', '12345678901234567891', ERR)]],
    ['no id when started, a null id when completed', [tcLine('started', null), tcLine('completed', 'null', ERR)]],
    ['equal numeric ids', [tcLine('started', '7'), tcLine('completed', '7', ERR)]],
    ['equal empty-string ids', [tcLine('started', '""'), tcLine('completed', '""', ERR)]],
  ])('a call_id that is not a non-empty string (%s) is a violation on both tool paths, so node and jq cannot pair calls differently', async (_label, lines) => {
    const r = await run({ bin: tool, steps: { default: { stdout: nd([INIT]) + lines.join('\n') + '\n' + nd([assistant(ANSWER), result()]), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('sandbox_violation');
    expect(r.envelope?.error_message).toContain('without a string call_id');
  }, T);

  itT('the tolerated shapes pass: a C7-shaped empty glob success, an error result and a permissionDenied result; C7 itself is a success', async () => {
    const middle = [
      toolCall('started', 'g', { globToolCall: { args: { globPattern: '**/*' } } }),
      toolCall('completed', 'g', { globToolCall: { result: { success: { pattern: '**/*', path: '/tmp', files: [], totalFiles: 0, clientTruncated: false, ripgrepTruncated: false } } } }),
      toolCall('started', 'e', { readToolCall: { args: { path: '/tmp/x' } } }),
      toolCall('completed', 'e', { readToolCall: { result: { error: { errorMessage: 'denied' } } } }),
      toolCall('started', 's', { shellToolCall: { args: { command: 'ls' } } }),
      toolCall('completed', 's', { shellToolCall: { result: { permissionDenied: { command: 'ls', workingDirectory: '/tmp', error: 'blocked', isReadonly: true } } } }),
    ];
    const [a, c7] = await Promise.all([
      run({ bin: tool, steps: { default: { stdout: stream(middle), exit: 0 } } }),
      run({ bin: tool, steps: { default: rec('c7-neutral-read-deny-all') } }),
    ]);
    expect(a.envelope?.status).toBe('success');
    expect(a.envelope?.findings).toHaveLength(1);
    expect(c7.envelope?.status).toBe('success');
    expect(c7.envelope?.findings).toHaveLength(1);
  }, T);

  itT('the message claims returned content only for a completed call with an untolerated result; descriptions use "an" before a vowel', async () => {
    const [a, b, c] = await Promise.all([
      run({ bin: tool, steps: { default: { stdout: stream(READ_OK('r')), exit: 0 } } }),
      run({ bin: tool, steps: { default: { stdout: stream([toolCall('started', 'a', { readToolCall: { args: {} } })]), exit: 0 } } }),
      run({ bin: tool, steps: { default: { stdout: stream([PAYLOAD_OUTSIDE, toolCall('completed', 'e', { readToolCall: { result: { error: { errorMessage: 'x', content: 'y' } } } })]), exit: 0 } } }),
    ]);
    const ma = String(a.envelope?.error_message);
    expect(ma).toContain('readToolCall completed with a success result');
    expect(ma).toContain('completed with a result the allowlist does not tolerate');
    const mb = String(b.envelope?.error_message);
    expect(b.envelope?.error_code).toBe('sandbox_violation');
    expect(mb).toContain('readToolCall started and never completed');
    expect(mb).toContain('no tool call is known to have returned content');
    expect(mb).not.toContain('completed with a result the allowlist does not tolerate');
    const mc = String(c.envelope?.error_message);
    expect(mc).toContain('an assistant event carrying a *ToolCall payload');
    expect(mc).toContain('readToolCall completed with an error result');
    expect(mc).not.toMatch(/\ba [aeiou]/);
  }, T);

  itT('a violation in a line with reordered keys and extra whitespace is still found (parsed, not string-matched)', async () => {
    const line = '{ "tool_call" : { "readToolCall" : { "result" : { "success" : { "content" : "x" } } } } , "call_id" : "z" , "subtype" : "completed" , "type" : "tool_call" }';
    const r = await run({ bin: tool, steps: { default: { stdout: nd([INIT]) + line + '\n' + nd([assistant(ANSWER), result()]), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('sandbox_violation');
    expect(violationCount(r)).toBe(1);
  }, T);

  itT('an unparseable line that names a *ToolCall payload fails closed as a violation', async () => {
    const r = await run({ bin: tool, steps: { default: { stdout: nd([INIT]) + '{"type":"tool_call","tool_call":{"readToolCall":{"result":{"success"\n' + nd([assistant(ANSWER), result()]), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('sandbox_violation');
  }, T);

  itT('a violation outranks a non-zero exit, exit 130, is_error and a missing result event', async () => {
    const v = READ_OK('r');
    const cases: Step[] = [
      { stdout: stream(v), stderr: 'Error: boom', exit: 1 },
      { stdout: stream(v), exit: 130 },
      { stdout: stream(v, { result: result({ is_error: true }) }), exit: 0 },
      { stdout: stream(v, { result: null }), exit: 0 },
      { stdout: nd([INIT, ...v]), stderr: 'ActionRequiredError: Named models unavailable', exit: 1 },
    ];
    const results = await Promise.all(cases.map((step) => run({ bin: tool, steps: { default: step } })));
    results.forEach((r, i) => {
      expect(r.envelope?.error_code, JSON.stringify(cases[i]).slice(0, 80)).toBe('sandbox_violation');
      expect(readFileSync(r.rawPath, 'utf8')).toBe(cases[i].stdout);
    });
  }, 2 * T);
});

// ---------------------------------------------------------------------------
// Fixture mapping (Task 67 recordings; synthetic only where not recorded)
// ---------------------------------------------------------------------------

function recUsage(name: Recording) {
  const res = recEvents(name).filter((e) => e.type === 'result').pop() as Ev;
  return { input_tokens: res.usage.inputTokens, output_tokens: res.usage.outputTokens, model: SLUG };
}

describe.concurrent('fixture mapping on the Task 67 recordings', () => {
  it('c7-neutral-read-deny-all gives success with 1 finding from the last assistant message, not .result (D40)', async () => {
    const r = await run({ steps: { default: rec('c7-neutral-read-deny-all') } });
    expect(r.envelope?.status).toBe('success');
    expect(r.envelope?.findings).toHaveLength(1);
    const calls = normalizeCalls(r);
    expect(calls).toHaveLength(1);
    const evs = recEvents('c7-neutral-read-deny-all');
    const last = evs.filter((e) => e.type === 'assistant').pop() as Ev;
    expect(calls[0].input).toBe(last.message.content[0].text);
    expect(calls[0].input).not.toBe((evs.filter((e) => e.type === 'result').pop() as Ev).result);
    expect(r.invocations).toHaveLength(1);
  }, T);

  it.each([
    ['c3b-auto-review-success', 3],
    ['c5-large-inline-prompt-deny-all', 3],
    ['c7-neutral-read-deny-all', 1],
    ['c8-large-stdin-prompt-deny-all', 3],
  ] as const)(
    '%s gives success with %i finding(s) (0 scan violations), the configured family, source_type external, result-event usage and usage.model = the configured slug (not init.model)',
    async (name, n) => {
      const r = await run({ steps: { default: rec(name) } });
      expect(r.envelope?.status).toBe('success');
      expect(r.envelope?.findings).toHaveLength(n);
      for (const f of r.envelope?.findings ?? []) {
        expect(f.source).toEqual({ reviewer_id: 'cursor-review-prompter', family: FAMILY, source_type: 'external' });
      }
      expect(r.envelope?.usage).toEqual(recUsage(name));
      expect(r.envelope?.usage.model).not.toBe('Auto');
      const vfArgv = normalizeCalls(r)[0].argv;
      expect(vfArgv[vfArgv.indexOf('--model') + 1]).toBe(SLUG);
      expect(vfArgv[vfArgv.indexOf('--family') + 1]).toBe(FAMILY);
    },
    T,
  );

  it("c3-free-plan-named-model gives cli_failed with D43's Free-plan message after exactly 1 invocation (no Auto retry)", async () => {
    const r = await run({ steps: { default: rec('c3-free-plan-named-model') } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.invocations).toHaveLength(1);
    expect(r.invocations[0].argv).toEqual(EXACT_ARGV);
    const msg = String(r.envelope?.error_message);
    expect(msg).toContain('Free plan allows only Auto');
    expect(msg).toContain('paid Cursor plan');
    expect(msg).toContain('remove cursor-review-prompter from multi_model_review.reviewers');
    expect(msg).toContain('never falls back to Auto');
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it('c6-unknown-model gives cli_failed naming the configured slug and cursor-agent models', async () => {
    const r = await run({ steps: { default: rec('c6-unknown-model') }, envelopeConfig: { model: 'not-a-real-model' } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain("'not-a-real-model'");
    expect(r.envelope?.error_message).toContain('cursor-agent models');
    expect(r.invocations).toHaveLength(1);
  }, T);

  it("the auth regex matches neither C3's nor C6's stderr, and matches logged-out text", () => {
    const m = /AUTH_RE='([^']+)'/.exec(RUNNER_SRC) as RegExpExecArray;
    const re = new RegExp(m[1], 'i');
    expect(re.test(rec('c3-free-plan-named-model').stderr as string)).toBe(false);
    expect(re.test(rec('c6-unknown-model').stderr as string)).toBe(false);
    for (const s of ['Error: Not authenticated', 'You are not logged in', 'HTTP 401', "Run 'cursor-agent login' first"]) expect(re.test(s), s).toBe(true);
  });

  it('a synthetic logged-out failure (U13 is gated) gives cli_auth_failed', async () => {
    const r = await run({ steps: { default: { stdout: '', stderr: "Error: Not authenticated. Run 'cursor-agent login'.\n", exit: 1 } } });
    expect(r.envelope?.error_code).toBe('cli_auth_failed');
    expect(r.envelope?.error_message).toContain('cursor-agent login');
  }, T);

  it('a parse_failed then a clean answer gives success after 2 invocations', async () => {
    const r = await run({ steps: { '1': { stdout: stream([], { answer: 'prose' }), exit: 0 }, default: { stdout: stream(), exit: 0 } } });
    expect(r.invocations).toHaveLength(2);
    expect(r.envelope?.status).toBe('success');
  }, T);

  it.each([['plan'], ['bypassPermissions'], ['ask'], [null]])(
    'init.permissionMode %s leaves the result unchanged; init.model, permissionMode and apiKeySource are logged (D37)',
    async (mode) => {
      const init = { ...INIT, apiKeySource: 'login' } as Ev;
      if (mode === null) delete init.permissionMode;
      else init.permissionMode = mode;
      const r = await run({ steps: { default: { stdout: stream([], { init }), exit: 0 } } });
      expect(r.envelope?.status).toBe('success');
      expect(r.envelope?.findings).toHaveLength(1);
      const log = stderrLog(r);
      expect(log).toContain('init.model="Claude Opus 5"');
      expect(log).toContain(`init.permissionMode=${mode === null ? '<absent>' : JSON.stringify(mode)}`);
      expect(log).toContain('init.apiKeySource="login"');
    },
    T,
  );

  it('exit 130 gives cli_failed', async () => {
    const r = await run({ steps: { default: { stdout: nd([INIT]), exit: 130 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('130');
  }, T);

  it('parent-mediated gives cli_unsupported_mode with 0 invocations; sandbox-yolo is a no-op alias of read-only', async () => {
    const r = await run({ config: 'multi_model_review:\n  external_permission_mode:\n    cursor: parent-mediated\n' });
    expect(r.envelope?.error_code).toBe('cli_unsupported_mode');
    expect(r.invocations).toHaveLength(0);
    expect(r.statusCalls).toHaveLength(0);
    const y = await run({ config: 'multi_model_review:\n  external_permission_mode:\n    cursor: sandbox-yolo\n' });
    expect(y.envelope?.status).toBe('success');
    expect(y.invocations[0].argv).toEqual(EXACT_ARGV);
  }, T);

  it('a missing cursor-agent binary gives cli_missing with the install one-liner', async () => {
    const r = await run({ bin: { cursor: false } });
    expect(r.envelope?.error_code).toBe('cli_missing');
    expect(r.envelope?.error_message).toContain('curl https://cursor.com/install -fsS | bash');
  }, T);

  it('writes the raw stdout to raw_output_path before parsing, and --envelope-out gets the same envelope', async () => {
    const r = await run({ args: ['--input', INPUT_REL, '--envelope-out', 'envelopes/cursor.envelope.json'] });
    expect(readFileSync(r.rawPath, 'utf8')).toBe(rec('c7-neutral-read-deny-all').stdout);
    expect(existsSync(`${r.rawPath}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(join(r.proj, 'envelopes/cursor.envelope.json'), 'utf8'))).toEqual(r.envelope);
  }, T);

  it('an unwritable raw_output_path gives unknown_error with raw_output_path null before any spawn; --envelope-out is still written', async () => {
    const r = await run({
      envelopeConfig: { raw_output_path: '/nonexistent-cursor-runner-test/raw/c.ndjson' },
      args: ['--input', INPUT_REL, '--envelope-out', 'env.json'],
    });
    expect(r.status).toBe(0);
    expect(r.envelope?.error_code).toBe('unknown_error');
    expect(r.envelope?.error_message).toContain('raw_output_path');
    expect(r.envelope?.raw_output_path).toBeNull();
    expect(r.invocations).toHaveLength(0);
    expect(r.statusCalls).toHaveLength(0);
    expect(JSON.parse(readFileSync(join(r.proj, 'env.json'), 'utf8'))).toEqual(r.envelope);
  }, T);
});

// ---------------------------------------------------------------------------
// D40 terminal checks and output parsing, on both JSON-tool paths
// ---------------------------------------------------------------------------

describe.concurrent.each(TOOL_PATHS)('D40 terminal checks and output parsing (%s)', (_tool, tool, skip) => {
  const itT = skip ? it.skip : it;
  itT.each([
    ['is_error: true', stream([], { result: result({ is_error: true }) })],
    ['subtype error_during_execution', stream([], { result: result({ subtype: 'error_during_execution' }) })],
    ['subtype "success\\n" (exact compare)', stream([], { result: result({ subtype: 'success\n' }) })],
    ['subtype " success" (exact compare)', stream([], { result: result({ subtype: ' success' }) })],
    ['is_error "false" (a string, not false)', stream([], { result: result({ is_error: 'false' }) })],
    ['is_error absent', stream([], { result: (() => { const x = result(); delete x.is_error; return x; })() })],
    ['a missing result event with exit 0', stream([], { result: null })],
  ])('synthetic %s gives cli_failed and no validate-findings normalization', async (_label, stdout) => {
    const r = await run({ bin: tool, steps: { default: { stdout, exit: 0 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  itT('a stream with no assistant event falls back to .result (D40)', async () => {
    const evs = recEvents('c3b-auto-review-success').filter((e) => e.type !== 'assistant');
    const r = await run({ bin: tool, steps: { default: { stdout: nd(evs), exit: 0 } } });
    expect(r.envelope?.status).toBe('success');
    expect(r.envelope?.findings).toHaveLength(3);
    expect(normalizeCalls(r)[0].input).toBe((evs.filter((e) => e.type === 'result').pop() as Ev).result);
  }, T);

  itT('a synthetic parse_failed gives exactly 2 invocations; the retry prompt carries the clarification', async () => {
    const r = await run({ bin: tool, steps: { default: { stdout: stream([], { answer: 'Here is my review: it looks fine.' }), exit: 0 } } });
    expect(r.invocations).toHaveLength(2);
    expect(normalizeCalls(r)).toHaveLength(2);
    expect(r.envelope?.error_code).toBe('parse_failed');
    expect(r.invocations[0].stdin).not.toContain(RETRY_TEXT);
    expect(r.invocations[1].stdin.endsWith(`\n${RETRY_TEXT}\n`)).toBe(true);
    expect(r.invocations[1].argv).toEqual(EXACT_ARGV);
  }, T);

  // Lines node and jq could read differently fail closed the same way on both paths.
  itT.each([
    ['a non-JSON stdout line', nd([INIT]) + 'Thinking...\n' + nd([assistant(ANSWER), result()])],
    ['a non-object line', nd([INIT]) + '[1,2]\n' + nd([assistant(ANSWER), result()])],
    ['a BOM before the first line', '\ufeff' + stream()],
    ['NaN in the result usage', nd([INIT, assistant(ANSWER)]) + JSON.stringify(result()).replace('"inputTokens":100', '"inputTokens":NaN') + '\n'],
    ['a number too large for a double', nd([INIT]) + '{"type":"thinking","n":1e1000}\n' + nd([assistant(ANSWER), result()])],
  ])('synthetic %s gives cli_failed (not success) and no normalization', async (_label, stdout) => {
    const r = await run({ bin: tool, steps: { default: { stdout, exit: 0 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);
});

// ---------------------------------------------------------------------------
// Local-state cleanup (D42)
// ---------------------------------------------------------------------------

type TreeEntry = string;
/** A sorted snapshot of a dir: type, relative path, and a content hash for files and the target for links. */
function tree(dir: string, rel = ''): TreeEntry[] {
  const out: TreeEntry[] = [];
  const abs = join(dir, rel);
  if (!existsSync(abs) && !isLink(abs)) return out;
  for (const name of readdirSync(abs).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const p = join(dir, r);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out.push(`l ${r} -> ${readlinkSync(p)}`);
    else if (st.isDirectory()) {
      out.push(`d ${r}`);
      out.push(...tree(dir, r));
    } else out.push(`f ${r} ${createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)}`);
  }
  return out;
}

function isLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

const HASH = 'a1b2c3d4e5';
const SID_A = randomUUID();
const OTHER_SID = randomUUID();
const SIBLING_SID = randomUUID();

/** A realistic ~/.cursor plus a Claude Code settings file, with sibling projects and sessions. */
function seedHome(home: string): void {
  const w = (rel: string, body = 'x') => {
    mkdirSync(join(home, rel, '..'), { recursive: true });
    writeFileSync(join(home, rel), body);
  };
  w('.cursor/cli-config.json', '{"authInfo":{"redacted":true},"maxMode":false}');
  w('.cursor/hooks.json', '{"hooks":{}}');
  w('.cursor/projects/private-tmp-synthex-cursor-Sibl1n/.workspace-trusted', '');
  w('.cursor/projects/Users-someone-repo/.workspace-trusted', '');
  w(`.cursor/chats/${HASH}/${SIBLING_SID}/store.db`, 'other session, same hash dir');
  w(`.cursor/chats/f0e9d8c7b6/${OTHER_SID}/store.db`, 'other session, other hash dir');
  w('.claude/settings.json', '{"hooks":{}}');
}

describe.concurrent.each(TOOL_PATHS)('local-state cleanup (D42) on both JSON-tool paths (%s)', (_tool, tool, skip) => {
  const itT = skip ? it.skip : it;

  itT.each([
    ['success (C7)', () => rec('c7-neutral-read-deny-all', SID_A)],
    ['failure (C3, Free plan)', () => rec('c3-free-plan-named-model', SID_A)],
    ['sandbox_violation (C4)', () => rec('c4-adversarial-no-deny-file', SID_A)],
  ] as Array<[string, () => Step]>)('after a %s run, the projects entry and the chat entry (session_id from system:init) are gone; nothing else changed', async (_label, step) => {
    const before: string[] = [];
    const r = await run({
      bin: tool,
      steps: { default: step() },
      session: SID_A,
      hash: HASH,
      seedHome: (home) => {
        seedHome(home);
        before.push(...tree(home));
      },
    });
    expect(r.invocations).toHaveLength(1);
    expect(r.invocations[0].slug).toMatch(/^(private-)?tmp-synthex-cursor-[A-Za-z0-9]{6}$/);
    expect(existsSync(join(r.home, '.cursor', 'projects', r.invocations[0].slug))).toBe(false);
    expect(existsSync(join(r.home, '.cursor', 'chats', HASH, SID_A))).toBe(false);
    expect(tree(r.home)).toEqual(before);
  }, T);

  itT('a run with no session_id (C6) removes only its projects entry', async () => {
    const before: string[] = [];
    const r = await run({
      bin: tool,
      steps: { default: rec('c6-unknown-model') },
      envelopeConfig: { model: 'not-a-real-model' },
      seedHome: (home) => {
        seedHome(home);
        before.push(...tree(home));
      },
    });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(existsSync(join(r.home, '.cursor', 'projects', r.invocations[0].slug))).toBe(false);
    expect(tree(r.home)).toEqual(before);
  }, T);

  itT.each([
    ['C7 (unknown_error)', 'c7-neutral-read-deny-all', 'unknown_error'],
    ['C4 (a violation still outranks the write failure)', 'c4-adversarial-no-deny-file', 'sandbox_violation'],
  ] as const)('the raw output cannot be moved into raw_output_path after %s: the session read from the .tmp stream is still removed', async (_label, name, code) => {
    const before: string[] = [];
    const r = await run({
      bin: tool,
      steps: { default: { ...rec(name, SID_A), hook: `${CHMOD} 500 "$STUB_PROJ/docs/reviews/raw"` } },
      session: SID_A,
      hash: HASH,
      seedHome: (home) => {
        seedHome(home);
        before.push(...tree(home));
      },
    });
    try {
      expect(r.envelope?.error_code).toBe(code);
      expect(r.envelope?.error_message).toContain('raw_output_path');
      expect(r.invocations).toHaveLength(1);
      expect(existsSync(join(r.home, '.cursor', 'chats', HASH, SID_A))).toBe(false);
      expect(tree(r.home)).toEqual(before);
    } finally {
      chmodSync(join(r.proj, 'docs', 'reviews', 'raw'), 0o755);
    }
  }, T);
});

describe.concurrent('local-state cleanup (D42): only the run\'s own two paths are deleted', () => {
  it.each([
    ['empty', ''],
    ['containing /', 'abcdefgh/ijkl'],
    ['containing ..', '../escape-dir'],
    ['a glob *', '*'],
    ['a glob ?', 'abcdefg?'],
    ['a glob [..]', '[abcdefgh]'],
    ['too short', 'abc'],
  ])('a session_id that is %s deletes no chat entry (the projects entry still goes)', async (_label, sid) => {
    const before: string[] = [];
    const r = await run({
      steps: { default: { stdout: stream([], { init: { ...INIT, session_id: sid } }), exit: 0 } },
      seedHome: (home) => {
        seedHome(home);
        // What a naive glob or path join would hit.
        mkdirSync(join(home, '.cursor', 'chats', 'escape-dir'), { recursive: true });
        mkdirSync(join(home, '.cursor', 'chats', HASH, 'abcdefgh', 'ijkl'), { recursive: true });
        mkdirSync(join(home, '.cursor', 'chats', HASH, 'abcdefgX'), { recursive: true });
        mkdirSync(join(home, '.cursor', 'chats', HASH, 'a'), { recursive: true });
        // The id taken literally, where it is a single path component.
        if (sid !== '' && !sid.includes('/')) mkdirSync(join(home, '.cursor', 'chats', HASH, sid), { recursive: true });
        before.push(...tree(home));
      },
    });
    expect(r.envelope?.status).toBe('success');
    expect(existsSync(join(r.home, '.cursor', 'projects', r.invocations[0].slug))).toBe(false);
    expect(tree(r.home)).toEqual(before);
  }, T);

  it.each([
    ['a glob character', `g*${process.pid}x`],
    ['..', `a..b${process.pid}`],
  ])('a scratch dir whose name holds %s gives no derivable slug: its projects entry is kept, and nothing else is touched', async (_label, weird) => {
    const before: string[] = [];
    const r = await run({
      bin: { weirdScratch: weird },
      seedHome: (home) => {
        seedHome(home);
        // A sibling a naive glob of the weird slug would match.
        mkdirSync(join(home, '.cursor', 'projects', `private-tmp-synthex-cursor-gZZ${process.pid}x`), { recursive: true });
        // The workspace name taken literally, with either /tmp prefix.
        for (const p of ['private-tmp', 'tmp']) mkdirSync(join(home, '.cursor', 'projects', `${p}-synthex-cursor-${weird}`), { recursive: true });
        before.push(...tree(home));
      },
    });
    try {
      expect(r.invocations).toHaveLength(1);
      expect(r.invocations[0].pwd).toContain('synthex-cursor.');
      const slug = r.invocations[0].slug;
      // The stub (Cursor) made an entry; the runner left it, and removed nothing else.
      expect(existsSync(join(r.home, '.cursor', 'projects', slug))).toBe(true);
      expect(tree(r.home).filter((e) => !e.includes(slug))).toEqual(before);
      expect(existsSync(r.wPath)).toBe(false);
    } finally {
      if (r.wPath) rmSync(r.wPath, { recursive: true, force: true });
    }
  }, T);

  it('never follows a symlink: a projects entry or a chats hash dir that is a symlink is left alone with its target', async () => {
    const outside = mkdtempSync(join(ROOT_TMP, 'outside-'));
    writeFileSync(join(outside, 'keep.txt'), 'outside');
    mkdirSync(join(outside, SID_A));
    writeFileSync(join(outside, SID_A, 'store.db'), 'outside chat');
    const r = await run({
      stateSymlink: outside,
      steps: { default: rec('c7-neutral-read-deny-all', SID_A) },
      seedHome: (home) => {
        seedHome(home);
        symlinkSync(outside, join(home, '.cursor', 'chats', 'linkedhash1'));
      },
    });
    expect(r.envelope?.status).toBe('success');
    expect(isLink(join(r.home, '.cursor', 'projects', r.invocations[0].slug))).toBe(true);
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('outside');
    expect(readFileSync(join(outside, SID_A, 'store.db'), 'utf8')).toBe('outside chat');
  }, T);

  it('a symlinked ~/.cursor is not entered at all (state is kept rather than risk deleting elsewhere)', async () => {
    const real = mkdtempSync(join(ROOT_TMP, 'realcursor-'));
    const r = await run({
      steps: { default: rec('c7-neutral-read-deny-all', SID_A) },
      session: SID_A,
      hash: HASH,
      seedHome: (home) => symlinkSync(real, join(home, '.cursor')),
    });
    expect(r.envelope?.status).toBe('success');
    expect(existsSync(join(real, 'projects', r.invocations[0].slug))).toBe(true);
    expect(existsSync(join(real, 'chats', HASH, SID_A))).toBe(true);
  }, T);

  it('the runner derives the state dir from $HOME at runtime (no hardcoded home path)', () => {
    const code = CODE_LINES.join('\n');
    expect(code).toContain('local home="${HOME:-}"');
    expect(code).not.toMatch(/\/Users\/|~\/\.cursor/);
  });
});


// ---------------------------------------------------------------------------
// Raw output gets the prompt's no-leak care
// ---------------------------------------------------------------------------

describe.concurrent('raw output: the planted marker lands only in the raw output file', () => {
  const MARKER = `LEAKMARK${randomUUID().replace(/-/g, '')}`;
  const bundle = {
    manifest: { artifact: { path: 'src/a.js' } },
    files: [{ path: 'src/a.js', content: `const secret = "${MARKER}";` }],
  };
  const echo: Ev = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: `...const secret = "${MARKER}";...` }] }, session_id: '<redacted-id>' };

  it.each([
    [
      'a success whose denied shell call echoes the marker (a tolerated result)',
      stream([
        echo,
        toolCall('started', 's1', { shellToolCall: { args: { command: `grep ${MARKER} .` } } }),
        toolCall('completed', 's1', { shellToolCall: { result: { permissionDenied: { command: `grep ${MARKER} .`, workingDirectory: '<scratch>', error: 'Command blocked by permissions configuration', isReadonly: true } } } }),
      ]),
      'success',
    ],
    ['a violation whose successful read returned the marker', stream([echo, ...READ_OK('r1', '/tmp/a.js', `secret ${MARKER}`)]), 'failed'],
    ['a failure with the marker in the stream and an error exit', nd([INIT, echo]) , 'failed'],
  ])('%s', async (_label, stdout, status) => {
    const r = await run({ bundle, steps: { default: { stdout, stderr: 'Error: something failed\n', exit: status === 'success' ? 0 : 1 } }, args: ['--input', INPUT_REL, '--envelope-out', 'env.json'] });
    expect(r.envelope?.status).toBe(status);
    expect(readFileSync(r.rawPath, 'utf8')).toContain(MARKER);
    expect(r.invocations[0].stdin).toContain(MARKER);
    for (const inv of [...r.invocations, ...r.statusCalls]) expect(inv.argv.join(' ')).not.toContain(MARKER);
    expect(stderrLog(r)).not.toContain(MARKER);
    expect(r.stdout).not.toContain(MARKER);
    expect(String(r.envelope?.error_message ?? '')).not.toContain(MARKER);
    expect(readFileSync(join(r.proj, 'env.json'), 'utf8')).not.toContain(MARKER);
    expect(r.stderr).not.toContain(MARKER);
  }, T);
});

// ---------------------------------------------------------------------------
// CLI-surface cross-check against Task 67's help fixtures
// ---------------------------------------------------------------------------

/** Options defined in a commander-style --help dump (definition lines are indented exactly 2 spaces). */
function helpOptions(helpText: string): Set<string> {
  const opts = new Set<string>();
  for (const line of helpText.split('\n')) {
    const m = /^ {2}(?:(-[A-Za-z]), )?(--[A-Za-z0-9][A-Za-z0-9-]*)/.exec(line);
    if (m) {
      if (m[1]) opts.add(m[1]);
      opts.add(m[2]);
    }
  }
  return opts;
}

/** Subcommand names (aliases included) from the "Commands:" block. */
function helpCommands(helpText: string): Set<string> {
  const out = new Set<string>();
  const lines = helpText.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'Commands:');
  for (let i = start + 1; start >= 0 && i < lines.length; i++) {
    const m = /^ {2}([a-z][a-z0-9|-]*)/.exec(lines[i]);
    if (m) m[1].split('|').forEach((c) => out.add(c));
  }
  return out;
}

const TOP_HELP = readFileSync(join(HELP_DIR, 'cursor-agent.txt'), 'utf8');
const TOP_OPTS = helpOptions(TOP_HELP);
const TOP_CMDS = helpCommands(TOP_HELP);
const SUB_OPTS: Record<string, Set<string>> = {
  status: helpOptions(readFileSync(join(HELP_DIR, 'cursor-agent-status.txt'), 'utf8')),
  models: helpOptions(readFileSync(join(HELP_DIR, 'cursor-agent-models.txt'), 'utf8')),
};

/** Problems with one recorded argv against the help for its exact form. */
function surfaceProblems(argv: string[]): string[] {
  const problems: string[] = [];
  const first = argv[0];
  const sub = first !== undefined && !first.startsWith('-') && TOP_CMDS.has(first) ? first : null;
  if (first !== undefined && !first.startsWith('-') && !sub) problems.push(`unexpected positional ${first} (a prompt argument?)`);
  const opts = sub ? SUB_OPTS[sub] : TOP_OPTS;
  if (sub && !opts) problems.push(`subcommand ${sub} has no help fixture`);
  for (const t of sub ? argv.slice(1) : argv) {
    if (!/^--?[A-Za-z]/.test(t)) continue;
    if (!opts?.has(t)) problems.push(`${t} is not a ${sub ? `\`cursor-agent ${sub}\`` : 'top-level cursor-agent'} option`);
  }
  return problems;
}

describe(`CLI-surface cross-check against the cursor-agent --help fixtures (Cursor Agent CLI ${CURSOR_VERSION})`, () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-console
    console.info(`cursor-agent help fixtures: CLI version ${CURSOR_VERSION}`);
    await Promise.all(
      BRANCHES.flatMap(([label, bin]) => [
        run({ auth: true, config: AUTH_CONFIG, bin }).then((r) => collect(r, 'auth', label)),
        run({ bin, envelopeConfig: { judge_mode_prompt: 'Judge.' } }).then((r) => collect(r, 'input', label)),
        run({ bin, steps: { default: { stdout: stream([], { answer: 'prose' }), exit: 0 } } }).then((r) => collect(r, 'input', label)),
      ]),
    );
  }, 4 * T);

  it('the help parser finds the subcommands and the runner flags at the right levels (parser self-check)', () => {
    expect(TOP_CMDS.has('status')).toBe(true);
    expect(TOP_CMDS.has('whoami')).toBe(true);
    expect(TOP_CMDS.has('models')).toBe(true);
    for (const f of ['-p', '--mode', '--sandbox', '--trust', '--output-format', '--model']) expect(TOP_OPTS.has(f), f).toBe(true);
    expect(TOP_OPTS.has('--format')).toBe(false);
    expect(SUB_OPTS.status.has('--format')).toBe(true);
    expect(SUB_OPTS.status.has('--model')).toBe(false);
  });

  it('both modes and both timeout branches contributed', () => {
    for (const [label] of BRANCHES) {
      expect(ALL_INVOCATIONS.some((i) => i.branch === label && i.mode === 'auth' && i.argv[0] === 'status'), label).toBe(true);
      expect(ALL_INVOCATIONS.some((i) => i.branch === label && i.mode === 'input' && i.argv.includes('--model')), label).toBe(true);
      expect(ALL_INVOCATIONS.some((i) => i.branch === label && i.mode === 'input' && i.argv[0] === 'status'), label).toBe(true);
    }
  });

  it('every recorded argv (both modes, both branches) uses only options from the help for its exact form', () => {
    expect(ALL_INVOCATIONS.length).toBeGreaterThan(0);
    for (const inv of ALL_INVOCATIONS) {
      expect(surfaceProblems(inv.argv), `${inv.branch}/${inv.mode}: cursor-agent ${inv.argv.join(' ').slice(0, 80)}`).toEqual([]);
    }
  });

  it('the probe is exactly `status --format json` and every review argv is the exact D25 argv', () => {
    for (const inv of ALL_INVOCATIONS) {
      if (inv.argv[0] === 'status') expect(inv.argv).toEqual(['status', '--format', 'json']);
      else expect(inv.argv).toEqual(EXACT_ARGV);
    }
  });

  it('fails offline on a nonexistent flag and on a flag from the wrong command level (detector self-test)', () => {
    expect(surfaceProblems([...EXACT_ARGV, '--bogus-flag'])).toEqual(['--bogus-flag is not a top-level cursor-agent option']);
    expect(surfaceProblems(['status', '--format', 'json', '--model', 'x'])).toEqual(['--model is not a `cursor-agent status` option']);
    expect(surfaceProblems(['-p', '--format', 'json'])).toEqual(['--format is not a top-level cursor-agent option']);
    expect(surfaceProblems(['models', '--json'])).toEqual(['--json is not a `cursor-agent models` option']);
    expect(surfaceProblems(['review this code'])).toHaveLength(1);
    expect(surfaceProblems(['status', '--format', 'json'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// --auth-check
// ---------------------------------------------------------------------------

describe.each(BRANCHES)('--auth-check (`cursor-agent status --format json` under the review isolation; %s)', (_label, bin) => {
  it.each([
    ['{"isAuthenticated":true,"email":"<email>"}'],
    ['{"authenticated":true}'],
    ['{"status":"authenticated","user":"<email>"}'],
    ['{"loggedIn":true}'],
  ])('exits 0 for the logged-in form %s, from the scratch workspace with the deny file in place', async (status) => {
    const r = await run({ auth: true, bin, config: AUTH_CONFIG, status, env: { CURSOR_CONFIG_DIR: '/nonexistent', CURSOR_API_KEY: 'dummy-test-value' } });
    expect(r.status).toBe(0);
    expect(r.statusCalls).toHaveLength(1);
    expect(r.invocations).toHaveLength(0);
    const p = r.statusCalls[0];
    expect(p.argv).toEqual(['status', '--format', 'json']);
    expect(p.pwd).toMatch(SCRATCH_RE);
    expect(p.ls).toEqual(['./.cursor', './.cursor/cli.json']);
    expect(p.env).not.toHaveProperty('CURSOR_CONFIG_DIR');
    expect(p.env).not.toHaveProperty('CURSOR_API_KEY');
    expect(existsSync(p.pwd)).toBe(false);
  }, T);

  it('exits 11 on anything that is not a positively matched logged-in form (fails closed)', async () => {
    const forms = ['{"isAuthenticated":false}', '{"status":"unauthenticated"}', '{"authenticated":true,"isLoggedIn":false}', '{"user":"<email>"}', 'Not logged in\n', '', '[true]', '{"isAuthenticated":"true"}'];
    const results = await Promise.all(forms.map((status) => run({ auth: true, bin, config: AUTH_CONFIG, status })));
    results.forEach((r, i) => expect(r.status, forms[i]).toBe(11));
    // A logged-in form with a non-zero exit is not logged in either.
    expect((await run({ auth: true, bin, config: AUTH_CONFIG, statusExit: 1 })).status).toBe(11);
  }, 2 * T);

  it('exits 0 for the captured logged-in status, JSON and text forms (fixtures cursor/status, U13)', async () => {
    expect((await run({ auth: true, bin, config: AUTH_CONFIG, status: STATUS_LOGGED_IN_JSON })).status).toBe(0);
    expect((await run({ auth: true, bin, config: AUTH_CONFIG, status: STATUS_LOGGED_IN_TEXT })).status).toBe(0);
  }, T);

  it('accepts the observed text form "Logged in as <email>" (C1)', async () => {
    expect((await run({ auth: true, bin, config: AUTH_CONFIG, status: 'Logged in as <email>\n' })).status).toBe(0);
  }, T);

  it('exits 12 when only CURSOR_API_KEY is present without the opt-in, and 0 with the opt-in', async () => {
    expect((await run({ auth: true, bin, config: AUTH_CONFIG, status: '{"isAuthenticated":false}', env: { CURSOR_API_KEY: 'dummy-test-value' } })).status).toBe(12);
    const optIn = await run({
      auth: true,
      bin,
      config: `${AUTH_CONFIG}      allow_api_key_billing: true\n`,
      status: '{"authenticated":true}',
      env: { CURSOR_API_KEY: 'dummy-test-value' },
    });
    expect(optIn.status).toBe(0);
    expect(optIn.statusCalls[0].env.CURSOR_API_KEY).toBe('dummy-test-value');
  }, T);

  it('exits 10 when the binary is missing', async () => {
    expect((await run({ auth: true, bin: { ...bin, cursor: false }, config: AUTH_CONFIG })).status).toBe(10);
  }, T);

  it('--input mode fails cli_auth_failed before any review invocation when not authenticated', async () => {
    const r = await run({ bin, status: '{"isAuthenticated":false}' });
    expect(r.envelope?.error_code).toBe('cli_auth_failed');
    expect(r.envelope?.error_message).toContain('cursor-agent login');
    expect(r.invocations).toHaveLength(0);
  }, T);

  it('a hanging status: --auth-check exits 11 within its bound; --input gives timeout with no review call', async () => {
    const SHORT = `${AUTH_CONFIG}  per_reviewer_timeout_seconds: 14\n`;
    const a = await run({ auth: true, bin, config: SHORT, status: '', statusSleep: 40 });
    expect(a.status).toBe(11);
    expect(a.stderr).toMatch(/did not answer within [1-4]s/);
    expect(a.durationMs).toBeLessThan(10_000);
    const b = await run({ bin, config: 'multi_model_review:\n  per_reviewer_timeout_seconds: 14\n', status: '', statusSleep: 40 });
    expect(b.envelope?.error_code).toBe('timeout');
    expect(b.invocations).toHaveLength(0);
    expect(b.durationMs).toBeLessThan(10_000);
  }, T);

  it('a slow probe and a slow review share one budget (the clock starts before the probe)', async () => {
    // Budget 8 s; the probe answers, then lingers 4 s; the review sleeps 20 s.
    const r = await run({
      bin,
      statusSleep: 4,
      config: 'multi_model_review:\n  per_reviewer_timeout_seconds: 18\n',
      steps: { default: { stdout: nd([INIT]), sleep: 20 } },
    });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(r.envelope?.error_message).toContain('8s');
    expect(r.invocations).toHaveLength(1);
    expect(r.durationMs).toBeLessThan(10_500);
  }, T);
});

// ---------------------------------------------------------------------------
// Scratch dir that cannot be entered (isolate: cd || exit 125, pwd -P check)
// ---------------------------------------------------------------------------

describe.concurrent.each(BRANCHES)('a scratch dir that cannot be entered, or no longer resolves to itself, fails closed (%s)', (_label, bin) => {
  it.each(['gone', 'swap'] as const)('%s before the probe: --auth-check exits 11 (not a login problem); --input gives unknown_error; cursor-agent never runs', async (rmHook) => {
    const a = await run({ auth: true, config: AUTH_CONFIG, bin: { ...bin, rmHook } });
    expect(a.statusCalls).toHaveLength(0);
    expect(a.status).toBe(11);
    expect(a.stderr).toMatch(/could not enter its scratch dir/);
    expect(a.stderr).not.toMatch(/run cursor-agent login/);
    const b = await run({ bin: { ...bin, rmHook } });
    expect(b.envelope?.error_code).toBe('unknown_error');
    expect(b.envelope?.error_message).toContain('scratch dir');
    expect(b.statusCalls).toHaveLength(0);
    expect(b.invocations).toHaveLength(0);
  }, T);

  it('swapped for a symlink after the probe: the review never runs outside it (unknown_error)', async () => {
    const r = await run({ bin, statusSwap: true });
    try {
      expect(r.statusCalls).toHaveLength(1);
      expect(r.invocations).toHaveLength(0);
      expect(r.envelope?.error_code).toBe('unknown_error');
      expect(existsSync(`${r.rawPath}.tmp`)).toBe(false);
    } finally {
      if (r.statusCalls[0]) rmSync(`${r.statusCalls[0].pwd}.moved`, { recursive: true, force: true });
    }
  }, T);
});

// ---------------------------------------------------------------------------
// The runner itself interrupted (SIGINT / SIGTERM)
// ---------------------------------------------------------------------------

async function waitFor(pred: () => boolean, ms: number, what: string): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((res) => setTimeout(res, 50));
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.each(BRANCHES)('the runner interrupted while cursor-agent runs (%s)', (_label, bin) => {
  it.each([
    ['SIGTERM', 143, 'cli_failed', false],
    ['SIGINT', 130, 'cli_failed', false],
    ['SIGTERM after a read returned content', 143, 'sandbox_violation', true],
    ['SIGINT after a read returned content', 130, 'sandbox_violation', true],
  ] as const)('%s: exit %i with a %s envelope on stdout and --envelope-out; cursor-agent is stopped, D42 cleanup still runs, and no runner process outlives it', async (label, code, errorCode, leaked) => {
    const sig = label.startsWith('SIGTERM') ? 'SIGTERM' : 'SIGINT';
    const sid = randomUUID();
    const partial = nd([{ ...INIT, session_id: sid }, ...(leaked ? READ_OK('r1') : [])]);
    const before: string[] = [];
    // A unique --envelope-out: forked runner subshells keep the runner's command line, so this tags them.
    const envOut = `env-${randomUUID()}.json`;
    const c = setupCase({
      bin,
      steps: { default: { stdout: partial, sleep: 30 } },
      session: sid,
      hash: HASH,
      args: ['--input', INPUT_REL, '--envelope-out', envOut],
      seedHome: (home) => {
        seedHome(home);
        before.push(...tree(home));
      },
    });
    const rawPath = join(c.proj, RAW_REL);
    const child = spawn(join(c.bin, 'bash'), [SPY_RUNNER, ...c.args], { cwd: c.proj, env: c.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.resume();
    const closed = new Promise<number | null>((res) => child.on('close', (status) => res(status)));
    await waitFor(
      () => existsSync(join(c.log, 'inv-1.pid')) && existsSync(`${rawPath}.tmp`) && statSync(`${rawPath}.tmp`).size > 0,
      15_000,
      'the stub review to start',
    );
    const stubPid = Number.parseInt(readFileSync(join(c.log, 'inv-1.pid'), 'utf8'), 10);
    const sent = Date.now();
    child.kill(sig);
    const status = await closed;
    expect(Date.now() - sent).toBeLessThan(5_000);
    expect(status).toBe(code);
    // The KILL backstop and the watchdog are cancelled, not left to fire at a stale pid later.
    if (PS) await waitFor(() => procsMatching(envOut).length === 0, 1_000, `no runner process left (${procsMatching(envOut).join(' | ')})`);
    const envelope = JSON.parse(readFileSync(join(c.proj, envOut), 'utf8'));
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe(errorCode);
    if (leaked) expect(envelope.error_message).toContain('readToolCall completed with a success result');
    else expect(envelope.error_message).toBe('cursor-review.sh was interrupted; the code was not reviewed.');
    expect(envelope.raw_output_path).toBe(RAW_REL);
    expect(JSON.parse(stdout)).toEqual(envelope);
    expect(readFileSync(rawPath, 'utf8')).toBe(partial);
    expect(existsSync(`${rawPath}.tmp`)).toBe(false);
    await waitFor(() => !alive(stubPid), 5_000, 'the stub cursor-agent to exit');
    // D42 after an interrupt: the run's projects entry and chat entry are gone, nothing else.
    expect(tree(c.home)).toEqual(before);
  }, T);
});

// ---------------------------------------------------------------------------
// node / jq fallbacks
// ---------------------------------------------------------------------------

describe.concurrent('JSON tooling fallbacks (harness-modernization D19)', () => {
  const jqBin = { node: false, jq: true };

  it.skipIf(!HAS_JQ)('jq-only: C7 success with result usage; the prompt is byte-identical to the node path', async () => {
    const judge = { judge_mode_prompt: 'Judge.' };
    const a = await run({ bin: jqBin, envelopeConfig: judge });
    expect(a.envelope?.status).toBe('success');
    expect(a.envelope?.findings).toHaveLength(1);
    expect(a.envelope?.usage).toEqual(recUsage('c7-neutral-read-deny-all'));
    const b = await run({ envelopeConfig: judge });
    expect(a.invocations[0].stdin).toBe(b.invocations[0].stdin);
    expect(a.invocations[0].clijson).toBe(readFileSync(DENY_RECORDED, 'utf8'));
  }, T);

  // The scan, the D40 terminal checks, the deny read-back and the D42 session
  // extraction run on both paths in their own describe.each(TOOL_PATHS) blocks.
  it.skipIf(!HAS_JQ)('jq-only: the Free-plan mapping is the same', async () => {
    const c3 = await run({ bin: jqBin, steps: { default: rec('c3-free-plan-named-model') } });
    expect(c3.envelope?.error_code).toBe('cli_failed');
    expect(c3.envelope?.error_message).toContain('Free plan allows only Auto');
    expect(c3.invocations).toHaveLength(1);
  }, T);

  it.skipIf(!HAS_JQ)('jq-only: --auth-check matches the same logged-in forms and fails closed the same', async () => {
    expect((await run({ auth: true, bin: jqBin, config: AUTH_CONFIG })).status).toBe(0);
    expect((await run({ auth: true, bin: jqBin, config: AUTH_CONFIG, status: STATUS_LOGGED_IN_JSON })).status).toBe(0);
    expect((await run({ auth: true, bin: jqBin, config: AUTH_CONFIG, status: STATUS_LOGGED_IN_TEXT })).status).toBe(0);
    expect((await run({ auth: true, bin: jqBin, config: AUTH_CONFIG, status: 'Logged in as <email>\n' })).status).toBe(0);
    expect((await run({ auth: true, bin: jqBin, config: AUTH_CONFIG, status: '{"isAuthenticated":false}' })).status).toBe(11);
    expect((await run({ auth: true, bin: jqBin, config: AUTH_CONFIG, status: 'garbage\n' })).status).toBe(11);
  }, T);

  it('neither node nor jq: an unknown_error envelope and no invocation; --auth-check exits 11', async () => {
    const r = await run({ bin: { node: false, jq: false } });
    expect(r.envelope?.error_code).toBe('unknown_error');
    expect(r.invocations).toHaveLength(0);
    expect(r.statusCalls).toHaveLength(0);
    expect((await run({ auth: true, config: AUTH_CONFIG, bin: { node: false, jq: false } })).status).toBe(11);
  }, T);
});

// ---------------------------------------------------------------------------
// Wall-clock guard: timing-sensitive cases, run one at a time
// ---------------------------------------------------------------------------

describe('wall-clock guard: per_reviewer_timeout_seconds - 10, host-clamped in the foreground', () => {
  const BUDGET_4S = 'multi_model_review:\n  per_reviewer_timeout_seconds: 14\n';

  it.each(BRANCHES)('a stub that runs past the budget gives timeout with the partial raw kept (%s)', async (_label, bin) => {
    const partial = nd([INIT, assistant('{"findings": [')]).slice(0, -1);
    const r = await run({ bin, config: 'multi_model_review:\n  per_reviewer_timeout_seconds: 14\n', steps: { default: { stdout: partial, sleep: 10 } } });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(r.envelope?.error_message).toContain('4s');
    expect(readFileSync(r.rawPath, 'utf8')).toBe(partial);
    expect(r.durationMs).toBeLessThan(9_000);
  }, T);

  it('in the foreground the budget is clamped to the host shell cap - 15; --envelope-out lifts the clamp', async () => {
    const slow = { stdout: rec('c7-neutral-read-deny-all').stdout, sleep: 4 };
    const a = await run({ env: { SYNTHEX_HOST: 'testhost' }, steps: { default: slow } });
    expect(a.envelope?.error_code).toBe('timeout');
    expect(a.envelope?.error_message).toContain('2s');
    const b = await run({ env: { SYNTHEX_HOST: 'testhost' }, args: ['--input', INPUT_REL, '--envelope-out', 'env.json'], steps: { default: slow } });
    expect(b.envelope?.status).toBe('success');
  }, T);

  it.each(BRANCHES)('a violation outranks timeout (%s); the partial raw is kept', async (_label, bin) => {
    const partial = nd([INIT, ...READ_OK('r')]);
    const r = await run({ bin, config: 'multi_model_review:\n  per_reviewer_timeout_seconds: 14\n', steps: { default: { stdout: partial, sleep: 10 } } });
    expect(r.envelope?.error_code).toBe('sandbox_violation');
    expect(readFileSync(r.rawPath, 'utf8')).toBe(partial);
    expect(r.durationMs).toBeLessThan(9_000);
  }, T);

  it.each(BRANCHES)('after a timeout the whole cursor-agent process group is stopped before the D42 cleanup, so a TERM-ignoring helper cannot recreate state (%s)', async (_label, bin) => {
    const before: string[] = [];
    // The helper ignores TERM and writes into the run's projects entry 8 s in (budget 4 s).
    const hook = `( trap '' TERM; sleep 8; mkdir -p "$HOME/.cursor/projects/$STUB_SLUG/late" ) > /dev/null 2>&1 &`;
    const started = Date.now();
    const r = await run({
      bin,
      config: BUDGET_4S,
      steps: { default: { stdout: nd([INIT]), sleep: 30, hook } },
      seedHome: (home) => {
        seedHome(home);
        before.push(...tree(home));
      },
    });
    expect(r.envelope?.error_code).toBe('timeout');
    const late = join(r.home, '.cursor', 'projects', r.invocations[0].slug, 'late');
    await new Promise((res) => setTimeout(res, Math.max(0, started + 10_500 - Date.now())));
    expect(existsSync(late)).toBe(false);
    expect(tree(r.home)).toEqual(before);
  }, T);

  it('D42 cleanup runs after a timeout: the projects entry and the chat entry are gone; nothing else changed', async () => {
    const before: string[] = [];
    const r = await run({
      config: BUDGET_4S,
      steps: { default: { stdout: nd([{ ...INIT, session_id: SID_A }]), sleep: 10 } },
      session: SID_A,
      hash: HASH,
      seedHome: (home) => {
        seedHome(home);
        before.push(...tree(home));
      },
    });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(r.invocations).toHaveLength(1);
    expect(existsSync(join(r.home, '.cursor', 'projects', r.invocations[0].slug))).toBe(false);
    expect(existsSync(join(r.home, '.cursor', 'chats', HASH, SID_A))).toBe(false);
    expect(tree(r.home)).toEqual(before);
  }, T);
});

// ---------------------------------------------------------------------------
// The registered script-smoke cases run here too
// ---------------------------------------------------------------------------

describe('script-smoke cases for scripts/adapters/cursor-review.sh', () => {
  const cases = (SMOKE_CASES as Record<string, Array<{ name: string; run: (ctx: unknown) => void }>>)['scripts/adapters/cursor-review.sh'];

  it('registers at least 2 cases', () => {
    expect(cases?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  for (const c of cases ?? []) {
    it(c.name, () => {
      const workDir = mkdtempSync(join(ROOT_TMP, 'smoke-'));
      c.run({
        scriptAbsPath: RUNNER,
        pluginRoot: PLUGIN,
        workDir,
        buildRestrictedPath: (includeNode: boolean) => buildRestrictedPath(workDir, includeNode),
      });
    }, T);
  }
});

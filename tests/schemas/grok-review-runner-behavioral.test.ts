/**
 * multi-model-review Task 68: grok-review.sh runner (D25, D26, D28, D29,
 * D31, D33-D36).
 *
 * Runs plugins/synthex/scripts/adapters/grok-review.sh against a stub
 * `grok` on a restricted PATH. The stub records argv, the env vars the
 * runner must set or scrub, `pwd -P` and the prompt file, then replays a
 * scenario: Task 67's sanitized recordings
 * (tests/fixtures/multi-model-review/adapters/grok/recordings/) wherever a
 * case was recorded, synthetic wrappers only where it was not. The real
 * grok binary is never run.
 *
 * The runner runs from a throwaway plugin root whose files are symlinks to
 * the real ones (runner, config-get, defaults.yaml, the strict findings
 * schema), except `scripts/validate-findings`, which is a spy that logs
 * each call and then execs the real script. That makes "the run's text
 * never reaches validate-findings" and "validate-findings gets the
 * serialized structuredOutput, else .text" directly observable.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SMOKE_CASES, buildRestrictedPath } from '../compat/lib/script-smoke.mjs';

const ROOT = join(__dirname, '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'synthex');
const RUNNER = join(PLUGIN, 'scripts', 'adapters', 'grok-review.sh');
const RUNNER_SRC = readFileSync(RUNNER, 'utf8');
const SHARED_SCHEMA_PATH = join(PLUGIN, 'agents', '_shared', 'codex-findings.schema.json');
const SHARED_SCHEMA = JSON.parse(readFileSync(SHARED_SCHEMA_PATH, 'utf8'));
const GROK_DIR = join(ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters', 'grok');
const REC_DIR = join(GROK_DIR, 'recordings');
const HELP_DIR = join(GROK_DIR, 'cli-help');
const GROK_VERSION = readFileSync(join(HELP_DIR, 'version.txt'), 'utf8').trim();

const T = 30_000;

// ---------------------------------------------------------------------------
// Restricted PATH, stub grok, spy plugin root
// ---------------------------------------------------------------------------

const POSIX_TOOLS = [
  'bash', 'sh', 'sed', 'awk', 'grep', 'cut', 'wc', 'sort', 'head', 'tr',
  'mv', 'rm', 'mkdir', 'date', 'od', 'dirname', 'basename', 'cat', 'mktemp',
  'ls', 'cksum', 'sleep', 'printf', 'true', 'false',
];

const WHICH_CACHE = new Map<string, string | null>();
function which(tool: string): string | null {
  if (!WHICH_CACHE.has(tool)) {
    const r = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
    WHICH_CACHE.set(tool, r.status === 0 ? r.stdout.trim() : null);
  }
  return WHICH_CACHE.get(tool) ?? null;
}

const HAS_JQ = which('jq') !== null;
const TIMEOUT_TOOL = which('timeout') ?? which('gtimeout');

let ROOT_TMP = '';
let seq = 0;

/**
 * scratchHook replaces `mkdir` with a wrapper that, right after the runner
 * creates <scratch>/home (the last step of make_scratch, before the auth
 * probe), removes the scratch dir ('gone') or swaps it for a symlink to the
 * runner's cwd, the project ('swap').
 */
type BinOpts = { node?: boolean; jq?: boolean; timeout?: boolean; grok?: boolean; scratchHook?: 'gone' | 'swap' };

function makeBin(opts: BinOpts = {}): string {
  const { node = true, jq = false, timeout = false, grok = true, scratchHook } = opts;
  const bin = join(ROOT_TMP, `bin-${seq++}`);
  mkdirSync(bin, { recursive: true });
  const link = (tool: string, as = tool) => {
    const src = which(tool);
    if (src && !existsSync(join(bin, as))) symlinkSync(src, join(bin, as));
  };
  POSIX_TOOLS.forEach((t) => link(t));
  if (node) link('node');
  if (jq) link('jq');
  if (timeout && TIMEOUT_TOOL) symlinkSync(TIMEOUT_TOOL, join(bin, 'timeout'));
  if (grok) {
    writeFileSync(join(bin, 'grok'), stubSource(join(bin, 'bash')));
    chmodSync(join(bin, 'grok'), 0o755);
  }
  if (scratchHook) {
    unlinkSync(join(bin, 'mkdir'));
    writeFileSync(
      join(bin, 'mkdir'),
      `#!${join(bin, 'bash')}
${which('mkdir')} "$@" || exit $?
for a in "$@"; do
  case "$a" in
    */synthex-grok.*/home)
      d="\${a%/home}"
      ${which('rm')} -rf "$d"
      ${scratchHook === 'swap' ? `${which('ln')} -s "$PWD" "$d"` : ':'} ;;
  esac
done
exit 0
`,
    );
    chmodSync(join(bin, 'mkdir'), 0o755);
  }
  return bin;
}

const RECORDED_ENV = [
  'HOME', 'GROK_HOME', 'GROK_SANDBOX', 'GROK_FOLDER_TRUST', 'GROK_CONFIG', 'GROK_CONFIG_PATH',
  'XAI_API_KEY', 'GROK_CODE_XAI_API_KEY', 'GROK_DISABLE_AUTOUPDATER', 'GROK_MEMORY',
  ...['AGENTS', 'HOOKS', 'MCPS', 'RULES', 'SKILLS'].flatMap((v) => [
    `GROK_CLAUDE_${v}_ENABLED`,
    `GROK_CURSOR_${v}_ENABLED`,
  ]),
];

/**
 * Stub grok. `grok models` prints $STUB_SCENARIO/models.stdout (default: the
 * logged-in line); when models.swap exists it then moves its own cwd (the
 * scratch dir) to <scratch>.moved and leaves a symlink to it in its place;
 * then it sleeps models.sleep seconds when that file exists. Any other call
 * is a review invocation N: it records argv/env/pwd/prompt/pid, then prints
 * N.stdout (else default.stdout), sleeps N.sleep, prints N.stderr and exits
 * N.exit (else the default.* files).
 */
function stubSource(bash: string): string {
  return `#!${bash}
L="$STUB_LOG"; D="$STUB_SCENARIO"
dump_env() { for v in ${RECORDED_ENV.join(' ')}; do if [ -n "\${!v+x}" ]; then printf '%s=%s\\n' "$v" "\${!v}"; fi; done; }
if [ "\${1:-}" = "models" ]; then
  n=$(cat "$L/models.count" 2>/dev/null || printf 0); n=$((n + 1)); printf '%s' "$n" > "$L/models.count"
  printf '%s\\0' "$@" > "$L/models-$n.argv"; pwd -P > "$L/models-$n.pwd"; dump_env > "$L/models-$n.env"
  if [ -e "$D/models.stdout" ]; then cat "$D/models.stdout"; else printf 'You are logged in with grok.com.\\nDefault model: grok-4.7\\n'; fi
  if [ -e "$D/models.swap" ]; then d=$(pwd -P); mv "$d" "$d.moved"; ${which('ln')} -s "$d.moved" "$d"; fi
  if [ -e "$D/models.sleep" ]; then sleep "$(cat "$D/models.sleep")"; fi
  exit 0
fi
n=$(cat "$L/count" 2>/dev/null || printf 0); n=$((n + 1)); printf '%s' "$n" > "$L/count"
printf '%s\\0' "$@" > "$L/inv-$n.argv"; pwd -P > "$L/inv-$n.pwd"; dump_env > "$L/inv-$n.env"; printf '%s' "$$" > "$L/inv-$n.pid"
prev=""; for a in "$@"; do if [ "$prev" = "--prompt-file" ]; then cat "$a" > "$L/inv-$n.prompt"; fi; prev="$a"; done
pick() { if [ -e "$D/$n.$1" ]; then printf '%s' "$D/$n.$1"; elif [ -e "$D/default.$1" ]; then printf '%s' "$D/default.$1"; fi; }
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
  const dirs = ['scripts/adapters', 'scripts/lib', 'config', 'agents/_shared'];
  dirs.forEach((d) => mkdirSync(join(SPY_PLUGIN, d), { recursive: true }));
  const ln = (rel: string) => symlinkSync(join(PLUGIN, rel), join(SPY_PLUGIN, rel));
  ln('scripts/adapters/grok-review.sh');
  ln('scripts/lib/config-get.sh');
  ln('config/defaults.yaml');
  ln('agents/_shared/codex-findings.schema.json');
  // hosts.env plus one test host with a 17 s shell cap (17 - 15 = 2 s clamp).
  writeFileSync(
    join(SPY_PLUGIN, 'config', 'hosts.env'),
    readFileSync(join(PLUGIN, 'config', 'hosts.env'), 'utf8') + "SYNTHEX_HOST_TESTHOST_SHELL_CAP=17\n",
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
  SPY_RUNNER = join(SPY_PLUGIN, 'scripts', 'adapters', 'grok-review.sh');
}

// ---------------------------------------------------------------------------
// Scenarios and the run helper
// ---------------------------------------------------------------------------

type Step = { stdout?: string; stderr?: string; exit?: number; sleep?: number };

function rec(name: string) {
  const d = join(REC_DIR, name);
  const read = (f: string) => (existsSync(join(d, f)) ? readFileSync(join(d, f), 'utf8') : '');
  return {
    stdout: read('stdout.json'),
    stderr: read('stderr.txt'),
    exit: Number.parseInt(read('exit_code').trim(), 10),
  } satisfies Step;
}

function recJson(name: string): Record<string, any> {
  return JSON.parse(readFileSync(join(REC_DIR, name, 'stdout.json'), 'utf8'));
}

function wrapper(overrides: Record<string, unknown>): string {
  const base = recJson('g2-review-success');
  const out: Record<string, unknown> = { ...base, ...overrides };
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete out[k];
  return JSON.stringify(out);
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
  },
  config: {
    model: null as string | null,
    family: null as string | null,
    raw_output_path: 'docs/reviews/raw/grok-review-prompter-0f1e2d3c.json',
  } as Record<string, unknown>,
};

type Inv = { argv: string[]; env: Record<string, string>; pwd: string; prompt: string };
type VfCall = { argv: string[]; input: string | null };

type RunOpts = {
  steps?: Record<string, Step>;
  models?: string;
  modelsSleep?: number;
  /** `grok models` swaps its scratch dir for a symlink to <scratch>.moved. */
  modelsSwap?: boolean;
  config?: string;
  envelopeConfig?: Record<string, unknown>;
  env?: Record<string, string>;
  bin?: BinOpts;
  args?: string[];
  auth?: boolean;
};

type RunResult = {
  status: number;
  stdout: string;
  stderr: string;
  envelope: Record<string, any> | null;
  invocations: Inv[];
  models: Inv[];
  vf: VfCall[];
  proj: string;
  rawPath: string;
  realGrokHome: string;
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

function count(dir: string, file: string): number {
  return existsSync(join(dir, file)) ? Number.parseInt(readFileSync(join(dir, file), 'utf8'), 10) : 0;
}

type Case = {
  proj: string;
  log: string;
  vfLog: string;
  bin: string;
  args: string[];
  env: Record<string, string>;
  realGrokHome: string;
};

const INPUT_REL = '.synthex/tmp/grok-review-prompter-0f1e2d3c.input.json';

/** Writes one case's scenario, config and input envelope; spawns nothing. */
function setupCase(opts: RunOpts = {}): Case {
  const caseDir = mkdtempSync(join(ROOT_TMP, 'case-'));
  const proj = join(caseDir, 'proj');
  const log = join(caseDir, 'log');
  const vfLog = join(caseDir, 'vf');
  const scen = join(caseDir, 'scenario');
  const grokHomeReal = join(caseDir, 'grok-home-real');
  const grokHomeLink = join(caseDir, 'grok-home-link');
  [proj, log, vfLog, scen, grokHomeReal].forEach((d) => mkdirSync(d, { recursive: true }));
  symlinkSync(grokHomeReal, grokHomeLink);

  const steps = opts.steps ?? { default: rec('g3-json-schema-structured-output') };
  for (const [key, step] of Object.entries(steps)) {
    if (step.stdout !== undefined) writeFileSync(join(scen, `${key}.stdout`), step.stdout);
    if (step.stderr !== undefined) writeFileSync(join(scen, `${key}.stderr`), step.stderr);
    if (step.exit !== undefined) writeFileSync(join(scen, `${key}.exit`), String(step.exit));
    if (step.sleep !== undefined) writeFileSync(join(scen, `${key}.sleep`), String(step.sleep));
  }
  if (opts.models !== undefined) writeFileSync(join(scen, 'models.stdout'), opts.models);
  if (opts.modelsSleep !== undefined) writeFileSync(join(scen, 'models.sleep'), String(opts.modelsSleep));
  if (opts.modelsSwap) writeFileSync(join(scen, 'models.swap'), '');
  if (opts.config !== undefined) {
    mkdirSync(join(proj, '.synthex'), { recursive: true });
    writeFileSync(join(proj, '.synthex', 'config.yaml'), opts.config);
  }

  const envelope = {
    ...ENVELOPE,
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
    args: opts.auth ? ['--auth-check'] : (opts.args ?? ['--input', INPUT_REL]),
    env: {
      PATH: bin,
      STUB_LOG: log,
      STUB_SCENARIO: scen,
      VF_LOG: vfLog,
      GROK_HOME: grokHomeLink,
      HOME: join(caseDir, 'user-home'),
      ...(opts.env ?? {}),
    },
    realGrokHome: realpathSync(grokHomeReal),
  };
}

function run(opts: RunOpts = {}): RunResult {
  const c = setupCase(opts);
  const started = Date.now();
  const r = spawnSync(join(c.bin, 'bash'), [SPY_RUNNER, ...c.args], {
    cwd: c.proj,
    env: c.env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const durationMs = Date.now() - started;
  return readCase(c, { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }, !!opts.auth, durationMs);
}

/** Reads back what the stub and the validate-findings spy recorded. */
function readCase(
  c: Case,
  r: { status: number; stdout: string; stderr: string },
  auth: boolean,
  durationMs: number,
): RunResult {
  const { log, vfLog, proj } = c;
  const invocations: Inv[] = [];
  for (let n = 1; n <= count(log, 'count'); n++) {
    invocations.push({
      argv: readNulList(join(log, `inv-${n}.argv`)),
      env: readEnv(join(log, `inv-${n}.env`)),
      pwd: readFileSync(join(log, `inv-${n}.pwd`), 'utf8').trim(),
      prompt: existsSync(join(log, `inv-${n}.prompt`)) ? readFileSync(join(log, `inv-${n}.prompt`), 'utf8') : '',
    });
  }
  const models: Inv[] = [];
  for (let n = 1; n <= count(log, 'models.count'); n++) {
    models.push({
      argv: readNulList(join(log, `models-${n}.argv`)),
      env: readEnv(join(log, `models-${n}.env`)),
      pwd: readFileSync(join(log, `models-${n}.pwd`), 'utf8').trim(),
      prompt: '',
    });
  }
  const vf: VfCall[] = [];
  for (let n = 1; n <= count(vfLog, 'count'); n++) {
    vf.push({
      argv: readNulList(join(vfLog, `call-${n}.argv`)),
      input: existsSync(join(vfLog, `call-${n}.input`)) ? readFileSync(join(vfLog, `call-${n}.input`), 'utf8') : null,
    });
  }
  let parsed: Record<string, any> | null = null;
  if (!auth) {
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      parsed = null;
    }
  }
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    envelope: parsed,
    invocations,
    models,
    vf,
    proj,
    rawPath: join(proj, ENVELOPE.config.raw_output_path as string),
    realGrokHome: c.realGrokHome,
    durationMs,
  };
}

/** validate-findings normalization calls (the --error path is not one). */
const normalizeCalls = (r: RunResult) => r.vf.filter((c) => !c.argv.includes('--error'));

const ALL_INVOCATIONS: Array<{ mode: 'input' | 'auth'; argv: string[] }> = [];
function collect(r: RunResult, mode: 'input' | 'auth'): RunResult {
  r.invocations.forEach((i) => ALL_INVOCATIONS.push({ mode, argv: i.argv }));
  r.models.forEach((i) => ALL_INVOCATIONS.push({ mode, argv: i.argv }));
  return r;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function argvValues(argv: string[], flag: string): string[] {
  return argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : []));
}

beforeAll(() => {
  ROOT_TMP = mkdtempSync(join(tmpdir(), 'grok-runner-test-'));
  makeSpyPlugin();
});

afterAll(() => {
  rmSync(ROOT_TMP, { recursive: true, force: true });
});

const SCRATCH_RE = /^(\/private)?\/tmp\/synthex-grok\.[A-Za-z0-9]{6}$/;

// ---------------------------------------------------------------------------
// Source contract
// ---------------------------------------------------------------------------

describe('grok-review.sh source contract', () => {
  it('has the scratch-dir guard under set -eu', () => {
    const setIdx = RUNNER_SRC.search(/^set -eu$/m);
    const guardIdx = RUNNER_SRC.indexOf('[ -n "$W" ] && [ -d "$W" ] && [ "$W" != "$PWD" ]');
    expect(setIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(setIdx);
    expect(RUNNER_SRC).toContain('mktemp -d /tmp/synthex-grok.XXXXXX');
    expect(RUNNER_SRC).toMatch(/trap cleanup EXIT/);
  });

  it('never names an approval bypass in an argv it builds', () => {
    const code = RUNNER_SRC.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    for (const banned of ['--yolo', '--always-approve', 'bypassPermissions', '--trust', '--single']) {
      expect(code, banned).not.toContain(banned);
    }
  });

  it('reads the strict findings schema shared with Codex (no second copy)', () => {
    expect(RUNNER_SRC).toContain('agents/_shared/codex-findings.schema.json');
    const shared = readdirSync(join(PLUGIN, 'agents', '_shared'));
    expect(shared.filter((f) => /grok/i.test(f))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Argv, environment, cwd (D25, D26, D33, D34, D36)
// ---------------------------------------------------------------------------

describe('argv, isolation env and cwd (stub grok records them)', () => {
  let r: RunResult;
  beforeAll(() => {
    r = collect(
      run({
        env: {
          GROK_SANDBOX: 'strict',
          GROK_FOLDER_TRUST: '0',
          GROK_CONFIG: '/nonexistent/config.toml',
          GROK_CONFIG_PATH: '/nonexistent',
          XAI_API_KEY: 'dummy-test-value',
          GROK_CODE_XAI_API_KEY: 'dummy-alias-value',
          GROK_MEMORY: '1',
        },
      }),
      'input',
    );
  }, T);

  it('makes exactly one review invocation and returns success', () => {
    expect(r.invocations).toHaveLength(1);
    expect(r.envelope?.status).toBe('success');
  });

  it('argv carries the full D25 set, --sandbox read-only, --max-turns 3 and --json-schema', () => {
    const argv = r.invocations[0].argv;
    expect(argv[argv.indexOf('--prompt-file') + 1]).toBe(`${r.invocations[0].pwd}/prompt.txt`);
    expect(argValue(argv, '--output-format')).toBe('json');
    expect(argValue(argv, '--disallowed-tools')).toBe(
      'read_file,grep,list_dir,run_terminal_cmd,run_terminal_command,search_replace,write_file,web_search,web_fetch,' +
        'todo_write,task,spawn_subagent,memory_search,search_tool,use_tool,Agent',
    );
    expect(argvValues(argv, '--deny')).toEqual(['*', 'mcp__*']);
    expect(argValue(argv, '--permission-mode')).toBe('dontAsk');
    expect(argValue(argv, '--sandbox')).toBe('read-only');
    expect(argv).toContain('--no-subagents');
    expect(argv).toContain('--disable-web-search');
    expect(argValue(argv, '--max-turns')).toBe('3');
    expect(argv).toContain('--json-schema');
  });

  it('--disallowed-tools names every built-in in grok\'s own docs, keeps the spike\'s names, and ends with Agent (D25)', () => {
    const tools = (argValue(r.invocations[0].argv, '--disallowed-tools') as string).split(',');
    // ~/.grok/docs/user-guide: 01-getting-started.md "Tools" table, and
    // 07-mcp-servers.md "Tool Discovery" (the MCP meta-tools).
    const documented = [
      'read_file', 'search_replace', 'grep', 'list_dir', 'run_terminal_command', 'web_search', 'web_fetch',
      'todo_write', 'spawn_subagent', 'memory_search', 'search_tool', 'use_tool',
    ];
    for (const t of documented) expect(tools, t).toContain(t);
    // The names the 1.0.46 spike ran with (U1) stay: unknown names are accepted silently.
    for (const t of ['run_terminal_cmd', 'write_file', 'task']) expect(tools, t).toContain(t);
    expect(tools[tools.length - 1]).toBe('Agent');
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('argv never carries an approval bypass or -p', () => {
    const argv = r.invocations[0].argv;
    for (const banned of ['--yolo', '--always-approve', 'bypassPermissions', '--trust', '-p']) {
      expect(argv).not.toContain(banned);
    }
    expect(argv.join(' ')).not.toContain('bypassPermissions');
  });

  it('passes -m only when config.model is set, and --rules only with judge_mode_prompt', () => {
    expect(r.invocations[0].argv).not.toContain('-m');
    expect(r.invocations[0].argv).not.toContain('--rules');
  });

  it('cwd is the canonical /tmp scratch dir (not the repo), removed afterwards', () => {
    const { pwd } = r.invocations[0];
    expect(pwd).toMatch(SCRATCH_RE);
    expect(pwd).not.toBe(realpathSync(r.proj));
    expect(existsSync(pwd)).toBe(false);
  });

  it('HOME is <scratch>/home and GROK_HOME is the canonical real grok home', () => {
    const { env, pwd } = r.invocations[0];
    expect(env.HOME).toBe(`${pwd}/home`);
    expect(env.GROK_HOME).toBe(r.realGrokHome);
  });

  it('GROK_SANDBOX, GROK_FOLDER_TRUST, GROK_CONFIG and GROK_CONFIG_PATH are absent although the parent set them', () => {
    const { env } = r.invocations[0];
    for (const k of ['GROK_SANDBOX', 'GROK_FOLDER_TRUST', 'GROK_CONFIG', 'GROK_CONFIG_PATH']) {
      expect(env, k).not.toHaveProperty(k);
    }
  });

  it('every GROK_CLAUDE_* and GROK_CURSOR_* compat var is 0, and the autoupdater is off', () => {
    const { env } = r.invocations[0];
    const compat = RECORDED_ENV.filter((k) => /^GROK_(CLAUDE|CURSOR)_/.test(k));
    expect(compat).toHaveLength(10);
    for (const k of compat) expect(env[k], k).toBe('0');
    expect(env.GROK_DISABLE_AUTOUPDATER).toBe('1');
  });

  it('XAI_API_KEY and its GROK_CODE_XAI_API_KEY alias are absent without the allow_api_key_billing opt-in (D26)', () => {
    for (const k of ['XAI_API_KEY', 'GROK_CODE_XAI_API_KEY']) {
      expect(r.invocations[0].env, k).not.toHaveProperty(k);
      expect(r.models[0].env, k).not.toHaveProperty(k);
    }
  });

  it('GROK_MEMORY is forced to 0 in the probe and the review although the parent set 1', () => {
    expect(r.invocations[0].env.GROK_MEMORY).toBe('0');
    expect(r.models[0].env.GROK_MEMORY).toBe('0');
  });

  it('the prompt inlines the bundle (artifact, conventions, touched files, specs) and the schema', () => {
    const p = r.invocations[0].prompt;
    expect(p).toContain('You have NO tools');
    expect(p).toContain('--- CONVENTIONS ---\n=== CLAUDE.md ===\nUse bound parameters.');
    expect(p).toContain('--- TOUCHED FILES ---\n=== src/db.js ===');
    expect(p).toContain('--- SPECS ---\n=== docs/specs/users.md ===');
    expect(p).toContain("--- ARTIFACT UNDER REVIEW ---\n=== src/users.js ===\ndb.query('SELECT * FROM users WHERE id = ' + id);");
    expect(p).toContain(JSON.stringify(SHARED_SCHEMA));
    expect(p).toContain('Command context: review-code');
  });
});

describe('XAI_API_KEY opt-in, model and judge_mode_prompt', () => {
  it('keeps XAI_API_KEY when per_reviewer.grok-review-prompter.allow_api_key_billing is true', () => {
    const r = collect(
      run({
        env: { XAI_API_KEY: 'dummy-test-value', GROK_CODE_XAI_API_KEY: 'dummy-alias-value' },
        config: 'multi_model_review:\n  per_reviewer:\n    grok-review-prompter:\n      allow_api_key_billing: true\n',
      }),
      'input',
    );
    expect(r.invocations[0].env.XAI_API_KEY).toBe('dummy-test-value');
    expect(r.invocations[0].env.GROK_CODE_XAI_API_KEY).toBe('dummy-alias-value');
    expect(r.envelope?.status).toBe('success');
  }, T);

  it('the input envelope alone cannot opt in: config.allow_api_key_billing true without the project-config opt-in leaves XAI_API_KEY unset (D26)', () => {
    const r = collect(
      run({
        env: { XAI_API_KEY: 'dummy-test-value', GROK_CODE_XAI_API_KEY: 'dummy-alias-value' },
        envelopeConfig: { allow_api_key_billing: true },
      }),
      'input',
    );
    expect(r.invocations).toHaveLength(1);
    for (const k of ['XAI_API_KEY', 'GROK_CODE_XAI_API_KEY']) {
      expect(r.invocations[0].env, k).not.toHaveProperty(k);
      expect(r.models[0].env, k).not.toHaveProperty(k);
    }
  }, T);

  it('passes -m <model> when config.model is set and judge_mode_prompt as the --rules value (D31)', () => {
    const judge = 'You are the aggregator. Judge the findings below.';
    const r = collect(run({ envelopeConfig: { model: 'grok-4.7', judge_mode_prompt: judge } }), 'input');
    const argv = r.invocations[0].argv;
    expect(argValue(argv, '-m')).toBe('grok-4.7');
    expect(argValue(argv, '--rules')).toBe(judge);
    expect(r.envelope?.findings[0].source.family).toBe('xai');
  }, T);

  it('a non-grok-* model gives family unknown, and config.family overrides it', () => {
    const a = run({ envelopeConfig: { model: 'custom-model' } });
    expect(a.envelope?.findings[0].source.family).toBe('unknown');
    const b = run({ envelopeConfig: { model: 'custom-model', family: 'xai' } });
    expect(b.envelope?.findings[0].source.family).toBe('xai');
  }, T);
});

// ---------------------------------------------------------------------------
// CLI-surface cross-check against Task 67's help fixtures
// ---------------------------------------------------------------------------

/** Options defined in a clap-style --help dump (definition lines only). */
function helpOptions(helpText: string): Set<string> {
  const opts = new Set<string>();
  for (const line of helpText.split('\n')) {
    const m = /^ {2,6}(?:(-[A-Za-z]), +)?(--[A-Za-z0-9][A-Za-z0-9-]*)/.exec(line);
    if (m) {
      if (m[1]) opts.add(m[1]);
      opts.add(m[2]);
    }
  }
  return opts;
}

/** Subcommand names from the "Commands:" block. */
function helpCommands(helpText: string): Set<string> {
  const out = new Set<string>();
  const lines = helpText.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'Commands:');
  for (let i = start + 1; start >= 0 && i < lines.length; i++) {
    const m = /^ {2}([a-z][a-z0-9-]*)\s/.exec(lines[i]);
    if (m) out.add(m[1]);
    else if (lines[i].trim() !== '' && !/^ {2}/.test(lines[i])) break;
  }
  return out;
}

const TOP_HELP = readFileSync(join(HELP_DIR, 'grok.txt'), 'utf8');
const TOP_OPTS = helpOptions(TOP_HELP);
const TOP_CMDS = helpCommands(TOP_HELP);
const SUB_OPTS: Record<string, Set<string>> = {
  models: helpOptions(readFileSync(join(HELP_DIR, 'grok-models.txt'), 'utf8')),
};

/** Problems with one recorded argv against the help for its exact form. */
function surfaceProblems(argv: string[]): string[] {
  const problems: string[] = [];
  const sub = argv[0] !== undefined && !argv[0].startsWith('-') && TOP_CMDS.has(argv[0]) ? argv[0] : null;
  const opts = sub ? SUB_OPTS[sub] : TOP_OPTS;
  if (sub && !opts) problems.push(`subcommand ${sub} has no help fixture`);
  const tokens = sub ? argv.slice(1) : argv;
  for (const t of tokens) {
    if (!/^--?[A-Za-z]/.test(t)) continue;
    if (!opts?.has(t)) problems.push(`${t} is not a ${sub ? `\`grok ${sub}\`` : 'top-level grok'} option`);
  }
  if (!sub && argv[0] !== undefined && /^[a-z]/.test(argv[0]) && !argv[0].startsWith('-')) {
    // A bare first word that is not a known subcommand would be a prompt; the runner never does that.
    problems.push(`unexpected positional ${argv[0]}`);
  }
  return problems;
}

describe(`CLI-surface cross-check against the grok --help fixtures (${GROK_VERSION})`, () => {
  beforeAll(() => {
    // Make sure both modes contributed: an --auth-check run, and an --input
    // run that sets -m and --rules.
    collect(run({ auth: true }), 'auth');
    collect(run({ envelopeConfig: { model: 'grok-4.7', judge_mode_prompt: 'Judge.' } }), 'input');
    // The same two runs on the timeout/gtimeout branch (the production path
    // on Linux and on Macs with coreutils).
    if (TIMEOUT_TOOL !== null) {
      collect(run({ auth: true, bin: { timeout: true } }), 'auth');
      collect(run({ bin: { timeout: true }, envelopeConfig: { model: 'grok-4.7', judge_mode_prompt: 'Judge.' } }), 'input');
    }
  }, 2 * T);

  it('the help parser finds models as a subcommand and the D25 flags at top level', () => {
    expect(TOP_CMDS.has('models')).toBe(true);
    for (const f of ['--prompt-file', '--deny', '--json-schema', '--sandbox', '-m', '--rules', '--max-turns']) {
      expect(TOP_OPTS.has(f), f).toBe(true);
    }
    expect(SUB_OPTS.models.has('--json-schema')).toBe(false);
  });

  it('every recorded argv (both modes) uses only options from the help for its exact form', () => {
    expect(ALL_INVOCATIONS.some((i) => i.mode === 'auth' && i.argv[0] === 'models')).toBe(true);
    expect(ALL_INVOCATIONS.some((i) => i.mode === 'input' && i.argv.includes('--rules'))).toBe(true);
    expect(ALL_INVOCATIONS.some((i) => i.mode === 'input' && i.argv[0] === 'models')).toBe(true);
    for (const inv of ALL_INVOCATIONS) {
      expect(surfaceProblems(inv.argv), `${inv.mode}: grok ${inv.argv.slice(0, 3).join(' ')} ...`).toEqual([]);
    }
  });

  it('the auth probe is exactly `grok models` with no flags', () => {
    for (const inv of ALL_INVOCATIONS.filter((i) => i.argv[0] === 'models')) expect(inv.argv).toEqual(['models']);
  });

  it('fails offline on a nonexistent flag and on a flag from the wrong command level (detector self-test)', () => {
    expect(surfaceProblems(['--prompt-file', 'p', '--yolo'])).toEqual(['--yolo is not a top-level grok option']);
    expect(surfaceProblems(['--prompt-file', 'p', '--no-auto-update']).length).toBe(1);
    expect(surfaceProblems(['models', '--max-turns', '3'])).toEqual(['--max-turns is not a `grok models` option']);
    expect(surfaceProblems(['models', '--debug'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Strict schema and unwrap (D33)
// ---------------------------------------------------------------------------

type Schema = Record<string, any>;
function objectNodes(node: Schema, path = '$'): Array<{ path: string; node: Schema }> {
  const out: Array<{ path: string; node: Schema }> = [];
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('object')) out.push({ path, node });
  for (const [k, child] of Object.entries(node.properties ?? {})) out.push(...objectNodes(child as Schema, `${path}.${k}`));
  if (node.items) out.push(...objectNodes(node.items as Schema, `${path}[]`));
  return out;
}

describe('strict --json-schema value and the unwrap order (D33)', () => {
  let r: RunResult;
  beforeAll(() => {
    r = run();
  }, T);

  it('the --json-schema value parses and equals the shared codex-findings.schema.json', () => {
    const value = argValue(r.invocations[0].argv, '--json-schema') as string;
    expect(JSON.parse(value)).toEqual(SHARED_SCHEMA);
  });

  it('has the strict shape: every property required, additionalProperties false at every level', () => {
    const value = JSON.parse(argValue(r.invocations[0].argv, '--json-schema') as string);
    const nodes = objectNodes(value);
    expect(nodes.map((n) => n.path)).toEqual(expect.arrayContaining(['$', '$.findings[]', '$.findings[].line_range']));
    for (const { path, node } of nodes) {
      expect(node.additionalProperties, path).toBe(false);
      expect([...(node.required ?? [])].sort(), path).toEqual(Object.keys(node.properties ?? {}).sort());
    }
  });

  it('optional canonical fields are nullable, and no injected field (source etc.) is present', () => {
    const item = JSON.parse(argValue(r.invocations[0].argv, '--json-schema') as string).properties.findings.items;
    for (const injected of ['source', 'raised_by', 'superseded_by_verification', 'verification_reasoning']) {
      expect(Object.keys(item.properties)).not.toContain(injected);
    }
    expect(item.properties.symbol.type).toContain('null');
    expect(item.properties.line_range.type).toContain('null');
  });

  it('matches the schema G3 used live (Task 67)', () => {
    const argvTxt = readFileSync(join(REC_DIR, 'g3-json-schema-structured-output', 'argv.txt'), 'utf8').trim();
    const tokens = argvTxt.split(/\s+/);
    const recorded = tokens[tokens.indexOf('--json-schema') + 1].replace(/\\(.)/g, '$1');
    expect(JSON.parse(recorded)).toEqual(SHARED_SCHEMA);
  });

  it('passes validate-findings the serialized structuredOutput, never the wrapper', () => {
    const calls = normalizeCalls(r);
    expect(calls).toHaveLength(1);
    const structured = recJson('g3-json-schema-structured-output').structuredOutput;
    expect(JSON.parse(calls[0].input as string)).toEqual(structured);
    expect(calls[0].input).not.toContain('stopReason');
  });

  it('prefers structuredOutput over .text when both are present', () => {
    const g3 = recJson('g3-json-schema-structured-output');
    const r2 = run({ steps: { default: { stdout: JSON.stringify({ ...g3, text: 'prose, not JSON' }), exit: 0 } } });
    expect(r2.envelope?.status).toBe('success');
    expect(r2.envelope?.findings).toHaveLength(3);
  }, T);

  it('falls back to .text only when structuredOutput is absent', () => {
    const r2 = run({ steps: { default: rec('g2-review-success') } });
    const calls = normalizeCalls(r2);
    expect(calls[0].input).toBe(recJson('g2-review-success').text);
  }, T);
});

// ---------------------------------------------------------------------------
// Sandbox fallback (D34)
// ---------------------------------------------------------------------------

const OTHER_REFUSAL =
  "warning: sandbox could not be applied: seatbelt profile compile failed\n" +
  "error: could not apply the 'read-only' sandbox profile; see the warning above for the cause. Refusing to start with its protections missing.\n";

describe('sandbox fallback (D34)', () => {
  let r: RunResult;
  beforeAll(() => {
    r = run({
      steps: {
        '1': rec('sandbox-read-only-refused'),
        default: rec('g3-json-schema-structured-output'),
      },
    });
  }, T);

  it('replaying sandbox-read-only-refused makes exactly one more invocation, without --sandbox', () => {
    expect(r.invocations).toHaveLength(2);
    expect(argValue(r.invocations[0].argv, '--sandbox')).toBe('read-only');
    expect(r.invocations[1].argv).not.toContain('--sandbox');
    expect(r.invocations[1].env).not.toHaveProperty('GROK_SANDBOX');
    expect(r.envelope?.status).toBe('success');
  });

  it('warns on stderr and in the raw stderr log, naming the cause; error_message stays null', () => {
    expect(r.stderr).toMatch(/warning:.*symlink.*docker\.sock/);
    const log = readFileSync(`${r.rawPath}.stderr.log`, 'utf8');
    expect(log).toMatch(/warning:.*symlink.*retrying once without --sandbox/);
    expect(log).toContain('endpoint is a symlink');
    expect(r.envelope?.error_message).toBeNull();
  });

  it('a refusal with any other cause gives cli_failed after 1 invocation', () => {
    const o = run({ steps: { default: { stdout: '', stderr: OTHER_REFUSAL, exit: 1 } } });
    expect(o.invocations).toHaveLength(1);
    expect(o.envelope?.error_code).toBe('cli_failed');
  }, T);

  it('needs all three phrases and a non-zero exit (partial matches do not retry)', () => {
    const full = rec('sandbox-read-only-refused').stderr;
    const missingB = full.replace('endpoint is a symlink', 'endpoint is missing');
    const a = run({ steps: { default: { stdout: '', stderr: missingB, exit: 1 } } });
    expect(a.invocations).toHaveLength(1);
    expect(a.envelope?.error_code).toBe('cli_failed');
    const b = run({ steps: { default: { stdout: '', stderr: full, exit: 0 } } });
    expect(b.invocations).toHaveLength(1);
    expect(b.envelope?.status).toBe('failed');
  }, T);

  it('a parse_failed retry in the same run reuses the fallback argv', () => {
    const p = run({
      steps: {
        '1': rec('sandbox-read-only-refused'),
        default: rec('g4-adversarial-prose-refusal'),
      },
    });
    expect(p.invocations).toHaveLength(3);
    expect(p.invocations[2].argv).not.toContain('--sandbox');
    expect(p.invocations[2].prompt).toContain('Your previous response could not be parsed as JSON');
    expect(p.envelope?.error_code).toBe('parse_failed');
  }, T);
});

// ---------------------------------------------------------------------------
// Fixture mapping (Task 67 recordings; synthetic only where not recorded)
// ---------------------------------------------------------------------------

describe('fixture mapping on the Task 67 recordings', () => {
  it('g3-json-schema-structured-output gives success with 3 findings, family xai, wrapper usage', () => {
    const r = run({ steps: { default: rec('g3-json-schema-structured-output') } });
    expect(r.envelope?.status).toBe('success');
    expect(r.envelope?.findings).toHaveLength(3);
    for (const f of r.envelope?.findings ?? []) {
      expect(f.source).toEqual({ reviewer_id: 'grok-review-prompter', family: 'xai', source_type: 'external' });
    }
    expect(r.envelope?.usage).toEqual({ input_tokens: 10944, output_tokens: 5108, model: 'grok-4.7-build' });
    expect(r.envelope?.raw_output_path).toBe(ENVELOPE.config.raw_output_path);
  }, T);

  it('g2-review-success (.text fallback) gives success with 4 findings; usage.model is the modelUsage key, not -m', () => {
    const r = run({ steps: { default: rec('g2-review-success') }, envelopeConfig: { model: 'grok-4.7' } });
    expect(r.envelope?.status).toBe('success');
    expect(r.envelope?.findings).toHaveLength(4);
    for (const f of r.envelope?.findings ?? []) {
      expect(f.source.family).toBe('xai');
      expect(f.source.source_type).toBe('external');
    }
    expect(r.envelope?.usage).toEqual({ input_tokens: 11093, output_tokens: 1758, model: 'grok-4.7-build' });
  }, T);

  it('a wrapper with usage but no modelUsage: usage.model is config.model (the -m value), else null', () => {
    const noModelUsage = wrapper({ modelUsage: undefined });
    const a = run({ steps: { default: { stdout: noModelUsage, exit: 0 } }, envelopeConfig: { model: 'grok-4.7' } });
    expect(a.envelope?.status).toBe('success');
    expect(a.envelope?.usage).toEqual({ input_tokens: 11093, output_tokens: 1758, model: 'grok-4.7' });
    const b = run({ steps: { default: { stdout: noModelUsage, exit: 0 } } });
    expect(b.envelope?.status).toBe('success');
    expect(b.envelope?.usage).toEqual({ input_tokens: 11093, output_tokens: 1758, model: null });
  }, T);

  it('g8-denied-tool-then-answer passes the guard; its prose-preamble .text gives parse_failed after exactly 2 invocations', () => {
    const r = run({ steps: { default: rec('g8-denied-tool-then-answer') } });
    expect(r.invocations).toHaveLength(2);
    expect(normalizeCalls(r)).toHaveLength(2);
    expect(r.envelope?.error_code).toBe('parse_failed');
  }, T);

  it('g4-adversarial-prose-refusal gives parse_failed after exactly 2 invocations', () => {
    const r = run({ steps: { default: rec('g4-adversarial-prose-refusal') } });
    expect(r.invocations).toHaveLength(2);
    expect(r.envelope?.status).toBe('failed');
    expect(r.envelope?.error_code).toBe('parse_failed');
  }, T);

  it('g9-unknown-model-error gives cli_failed (not cli_auth_failed)', () => {
    const r = run({ steps: { default: rec('g9-unknown-model-error') } });
    expect(r.invocations).toHaveLength(1);
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain("Couldn't set model");
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it("the auth regex does not match G9's text, and does match login errors", () => {
    const m = /AUTH_RE='([^']+)'/.exec(RUNNER_SRC);
    expect(m).not.toBeNull();
    const re = new RegExp((m as RegExpExecArray)[1], 'i');
    const g9 = recJson('g9-unknown-model-error').message as string;
    expect(re.test(g9)).toBe(false);
    expect(re.test(rec('g9-unknown-model-error').stderr)).toBe(false);
    for (const s of ['Not signed in', 'Error: not authenticated', 'HTTP 401 Unauthorized', 'session expired', "Run 'grok login'"]) {
      expect(re.test(s), s).toBe(true);
    }
    expect(re.test('model grok-4012 not found')).toBe(false);
  });

  it('synthetic "Not signed in" (U5 is gated) gives cli_auth_failed, from the error object or from stderr', () => {
    const a = run({
      steps: { default: { stdout: '{"type":"error","message":"Not signed in. Run grok login to continue."}', stderr: 'Error: Not signed in', exit: 1 } },
    });
    expect(a.envelope?.error_code).toBe('cli_auth_failed');
    const b = run({ steps: { default: { stdout: '', stderr: 'Error: Not signed in', exit: 1 } } });
    expect(b.envelope?.error_code).toBe('cli_auth_failed');
  }, T);

  it('empty text with a max_tokens stop gives cli_failed', () => {
    const r = run({ steps: { default: { stdout: wrapper({ text: '', stopReason: 'max_tokens' }), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.invocations).toHaveLength(1);
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it('exit 130 gives cli_failed', () => {
    const r = run({ steps: { default: { stdout: '', exit: 130 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('130');
  }, T);

  it('parent-mediated gives cli_unsupported_mode with 0 invocations', () => {
    const r = run({ config: 'multi_model_review:\n  external_permission_mode:\n    grok: parent-mediated\n' });
    expect(r.envelope?.error_code).toBe('cli_unsupported_mode');
    expect(r.invocations).toHaveLength(0);
    expect(r.models).toHaveLength(0);
  }, T);

  it('sandbox-yolo is a no-op alias of read-only', () => {
    const r = run({ config: 'multi_model_review:\n  external_permission_mode:\n    grok: sandbox-yolo\n' });
    expect(r.envelope?.status).toBe('success');
    expect(argValue(r.invocations[0].argv, '--sandbox')).toBe('read-only');
    expect(r.invocations[0].argv).toContain('--deny');
  }, T);

  it('a missing grok binary gives cli_missing with the install one-liner', () => {
    const r = run({ bin: { grok: false } });
    expect(r.envelope?.error_code).toBe('cli_missing');
    expect(r.envelope?.error_message).toContain('curl -fsSL https://x.ai/cli/install.sh | bash');
  }, T);

  it('writes the raw stdout to raw_output_path before parsing, and --envelope-out gets the same envelope', () => {
    const out = 'envelopes/grok.envelope.json';
    const r = run({ args: ['--input', '.synthex/tmp/grok-review-prompter-0f1e2d3c.input.json', '--envelope-out', out] });
    expect(readFileSync(r.rawPath, 'utf8')).toBe(rec('g3-json-schema-structured-output').stdout);
    expect(existsSync(`${r.rawPath}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(join(r.proj, out), 'utf8'))).toEqual(r.envelope);
  }, T);
});

// ---------------------------------------------------------------------------
// Wall-clock guard
// ---------------------------------------------------------------------------

const PARTIAL = '{"text":"{\\"findings\\": [{\\"finding_id\\": \\"partial';
const SHORT_BUDGET = 'multi_model_review:\n  per_reviewer_timeout_seconds: 12\n';

describe('wall-clock guard: per_reviewer_timeout_seconds - 10, host-clamped in the foreground', () => {
  it('a stub that runs past the budget gives timeout and keeps the partial raw (bash watchdog, no timeout binary)', () => {
    const r = run({ config: SHORT_BUDGET, steps: { default: { stdout: PARTIAL, sleep: 8 } } });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(r.envelope?.error_message).toContain('2s');
    expect(readFileSync(r.rawPath, 'utf8')).toBe(PARTIAL);
    expect(r.durationMs).toBeLessThan(7_500);
  }, T);

  it.skipIf(TIMEOUT_TOOL === null)('the same with timeout/gtimeout on PATH', () => {
    const r = run({ config: SHORT_BUDGET, bin: { timeout: true }, steps: { default: { stdout: PARTIAL, sleep: 8 } } });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(readFileSync(r.rawPath, 'utf8')).toBe(PARTIAL);
  }, T);

  it('in the foreground the budget is clamped to the host shell cap - 15', () => {
    const r = run({ env: { SYNTHEX_HOST: 'testhost' }, steps: { default: { stdout: PARTIAL, sleep: 8 } } });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(r.envelope?.error_message).toContain('2s');
  }, T);

  it('with --envelope-out (backgrounded by the caller) the host clamp does not apply', () => {
    const g3 = rec('g3-json-schema-structured-output');
    const r = run({
      env: { SYNTHEX_HOST: 'testhost' },
      args: ['--input', '.synthex/tmp/grok-review-prompter-0f1e2d3c.input.json', '--envelope-out', 'env.json'],
      steps: { default: { ...g3, sleep: 3 } },
    });
    expect(r.envelope?.status).toBe('success');
  }, T);
});

// ---------------------------------------------------------------------------
// Incomplete-run guard (Risk 15, D36)
// ---------------------------------------------------------------------------

describe('incomplete-run guard (Risk 15, D36): allowlist {end_turn}, before parsing', () => {
  it('g7-max-turns-cancelled gives cli_failed with no validate-findings normalization call', () => {
    const r = run({ steps: { default: rec('g7-max-turns-cancelled') } });
    expect(r.envelope?.status).toBe('failed');
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain('stopReason: cancelled');
    expect(r.envelope?.error_message).toContain('not reviewed');
    expect(r.invocations).toHaveLength(1);
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it('SYNTHETIC field incident: a G7 copy whose text is {"findings": []} still gives cli_failed, never a clean review', () => {
    const g7 = rec('g7-max-turns-cancelled');
    const incident = JSON.stringify({ ...recJson('g7-max-turns-cancelled'), text: '{"findings": []}' });
    const r = run({ steps: { default: { stdout: incident, stderr: g7.stderr, exit: g7.exit } } });
    expect(r.envelope?.status).toBe('failed');
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.findings).toEqual([]);
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it.each([
    ['max_turn_requests', { stopReason: 'max_turn_requests' }],
    ['refusal', { stopReason: 'refusal' }],
    ['absent', { stopReason: undefined }],
  ])('synthetic stopReason %s with clean JSON text and exit 0 gives cli_failed', (label, over) => {
    const r = run({ steps: { default: { stdout: wrapper({ ...over, text: '{"findings": []}' }), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain(label === 'absent' ? '<absent>' : label);
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it('end_turn with "max turns reached" on stderr gives cli_failed', () => {
    const r = run({ steps: { default: { stdout: wrapper({ text: '{"findings": []}' }), stderr: 'Error: max turns reached\n', exit: 0 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it('an auth {type:"error"} object is mapped before the guard (cli_auth_failed, not cli_failed)', () => {
    const r = run({ steps: { default: { stdout: '{"type":"error","message":"Session expired; run grok login"}', exit: 1 } } });
    expect(r.envelope?.error_code).toBe('cli_auth_failed');
  }, T);

  it.each([
    ['a trailing newline', 'end_turn\n', '"end_turn\\n"'],
    ['a leading space', ' end_turn', '" end_turn"'],
  ])('stopReason end_turn with %s is not exactly end_turn: cli_failed, no validate-findings call', (_label, stop, shown) => {
    const r = run({ steps: { default: { stdout: wrapper({ stopReason: stop, text: '{"findings": []}' }), exit: 0 } } });
    expect(r.envelope?.error_code).toBe('cli_failed');
    expect(r.envelope?.error_message).toContain(`stopReason: ${shown}`);
    expect(normalizeCalls(r)).toHaveLength(0);
  }, T);

  it('a non-end_turn wrapper, a non-zero exit and a login error on stderr give cli_auth_failed, before validate-findings', () => {
    const r = run({
      steps: { default: { stdout: '{"error":"Not signed in"}', stderr: 'Error: Not signed in. Run grok login', exit: 1 } },
    });
    expect(r.envelope?.error_code).toBe('cli_auth_failed');
    expect(r.envelope?.error_message).toContain('grok login');
    expect(r.invocations).toHaveLength(1);
    expect(normalizeCalls(r)).toHaveLength(0);
    // The same output with exit 0 is not a login failure: cli_failed.
    const zero = run({
      steps: { default: { stdout: '{"error":"Not signed in"}', stderr: 'Error: Not signed in. Run grok login', exit: 0 } },
    });
    expect(zero.envelope?.error_code).toBe('cli_failed');
    expect(normalizeCalls(zero)).toHaveLength(0);
  }, T);
});

// ---------------------------------------------------------------------------
// --auth-check
// ---------------------------------------------------------------------------

/** Both probe branches: the bash watchdog, and timeout/gtimeout when installed. */
const BRANCHES: Array<[string, BinOpts]> = [
  ['bash watchdog', { timeout: false }],
  ...(TIMEOUT_TOOL !== null ? ([['timeout binary', { timeout: true }]] as Array<[string, BinOpts]>) : []),
];

describe.each(BRANCHES)('--auth-check (runs `grok models` under the review isolation; %s)', (_label, bin) => {
  it('exits 0 for a grok.com session login, with HOME isolation and the autoupdater off', () => {
    const r = collect(
      run({ auth: true, bin, env: { GROK_SANDBOX: 'strict', XAI_API_KEY: 'dummy-test-value', GROK_MEMORY: '1' } }),
      'auth',
    );
    expect(r.status).toBe(0);
    expect(r.models).toHaveLength(1);
    expect(r.invocations).toHaveLength(0);
    const { env, pwd, argv } = r.models[0];
    expect(argv).toEqual(['models']);
    expect(pwd).toMatch(SCRATCH_RE);
    expect(env.HOME).toBe(`${pwd}/home`);
    expect(env.GROK_HOME).toBe(r.realGrokHome);
    expect(env.GROK_DISABLE_AUTOUPDATER).toBe('1');
    expect(env.GROK_MEMORY).toBe('0');
    expect(env.GROK_CLAUDE_HOOKS_ENABLED).toBe('0');
    expect(env).not.toHaveProperty('GROK_SANDBOX');
    expect(env).not.toHaveProperty('XAI_API_KEY');
    expect(existsSync(pwd)).toBe(false);
  }, T);

  it('exits 11 when not authenticated, and fails closed on an unrecognised or empty line', () => {
    expect(run({ auth: true, bin, models: 'You are not authenticated.\n' }).status).toBe(11);
    expect(run({ auth: true, bin, models: 'Something new in grok 2.0\n' }).status).toBe(11);
    expect(run({ auth: true, bin, models: '' }).status).toBe(11);
  }, T);

  it('exits 12 when only a key is present without opt-in, and 0 with the opt-in', () => {
    expect(run({ auth: true, bin, models: 'You are using XAI_API_KEY.\n' }).status).toBe(12);
    // The key is unset for the probe, so grok sees no session; the parent's key makes it 12, not 11.
    expect(run({ auth: true, bin, models: 'You are not authenticated.\n', env: { XAI_API_KEY: 'dummy-test-value' } }).status).toBe(12);
    // The same for grok's backward-compatible alias, which is unset too.
    const alias = run({ auth: true, bin, models: 'You are not authenticated.\n', env: { GROK_CODE_XAI_API_KEY: 'dummy-alias-value' } });
    expect(alias.status).toBe(12);
    expect(alias.models[0].env).not.toHaveProperty('GROK_CODE_XAI_API_KEY');
    const optIn = run({
      auth: true,
      bin,
      models: 'You are using XAI_API_KEY.\n',
      env: { XAI_API_KEY: 'dummy-test-value' },
      config: 'multi_model_review:\n  per_reviewer:\n    grok-review-prompter:\n      allow_api_key_billing: true\n',
    });
    expect(optIn.status).toBe(0);
    expect(optIn.models[0].env.XAI_API_KEY).toBe('dummy-test-value');
  }, T);

  it('exits 10 when the binary is missing', () => {
    expect(run({ auth: true, bin: { ...bin, grok: false } }).status).toBe(10);
  }, T);

  it('--input mode fails cli_auth_failed before any review invocation when not authenticated', () => {
    const r = run({ bin, models: 'You are not authenticated.\n' });
    expect(r.envelope?.error_code).toBe('cli_auth_failed');
    expect(r.envelope?.error_message).toContain('grok login');
    expect(r.invocations).toHaveLength(0);
  }, T);

  it('a hanging `grok models` that prints nothing: --auth-check exits 11 within its bound', () => {
    const r = run({ auth: true, bin, models: '', modelsSleep: 40, config: SHORT_BUDGET });
    expect(r.status).toBe(11);
    expect(r.stderr).toMatch(/did not answer within 2s/);
    expect(r.durationMs).toBeLessThan(10_000);
  }, T);

  it('a hanging `grok models` after the logged-in line: --auth-check exits 0 within its bound', () => {
    const r = run({ auth: true, bin, modelsSleep: 40, config: SHORT_BUDGET });
    expect(r.status).toBe(0);
    expect(r.durationMs).toBeLessThan(10_000);
  }, T);

  it('a hanging `grok models` in --input mode spends the review budget: timeout, no review invocation', () => {
    const silent = run({ bin, models: '', modelsSleep: 40, config: SHORT_BUDGET });
    expect(silent.envelope?.error_code).toBe('timeout');
    expect(silent.invocations).toHaveLength(0);
    expect(silent.durationMs).toBeLessThan(10_000);
    const loggedIn = run({ bin, modelsSleep: 40, config: SHORT_BUDGET });
    expect(loggedIn.envelope?.error_code).toBe('timeout');
    expect(loggedIn.invocations).toHaveLength(0);
    expect(loggedIn.durationMs).toBeLessThan(10_000);
  }, T);

  it('a slow probe and a slow review share one budget (the clock starts before the probe)', () => {
    // Budget 8 s; the probe answers then lingers 4 s, the review sleeps 20 s.
    // One shared clock ends the run near 8 s; a clock started after the
    // probe would end it near 12 s.
    const r = run({
      bin,
      modelsSleep: 4,
      config: 'multi_model_review:\n  per_reviewer_timeout_seconds: 18\n',
      steps: { default: { stdout: PARTIAL, sleep: 20 } },
    });
    expect(r.envelope?.error_code).toBe('timeout');
    expect(r.envelope?.error_message).toContain('8s');
    expect(r.invocations).toHaveLength(1);
    expect(r.durationMs).toBeLessThan(10_500);
  }, T);
});

describe('raw_output_path that cannot be written', () => {
  it('gives an unknown_error envelope (exit 0, --envelope-out written) before any grok call', () => {
    const r = run({
      envelopeConfig: { raw_output_path: '/nonexistent-grok-runner-test/raw/g.json' },
      args: ['--input', '.synthex/tmp/grok-review-prompter-0f1e2d3c.input.json', '--envelope-out', 'env.json'],
    });
    expect(r.status).toBe(0);
    expect(r.envelope?.status).toBe('failed');
    expect(r.envelope?.error_code).toBe('unknown_error');
    expect(r.envelope?.error_message).toContain('raw_output_path');
    expect(r.envelope?.raw_output_path).toBeNull();
    expect(r.invocations).toHaveLength(0);
    expect(r.models).toHaveLength(0);
    expect(JSON.parse(readFileSync(join(r.proj, 'env.json'), 'utf8'))).toEqual(r.envelope);
  }, T);
});

// ---------------------------------------------------------------------------
// Scratch dir that cannot be entered (isolate: cd || exit 125, pwd -P check)
// ---------------------------------------------------------------------------

describe('a scratch dir that cannot be entered, or no longer resolves to itself, fails closed', () => {
  it('isolate() checks cd and pwd -P itself (errexit is ignored under `auth_probe || rc=$?`)', () => {
    const m = /\nisolate\(\) \{\n([\s\S]*?)\n\}/.exec(RUNNER_SRC);
    expect(m).not.toBeNull();
    const body = (m as RegExpExecArray)[1];
    expect(body).toContain('cd -- "$W" 2>/dev/null || exit 125');
    expect(body).toContain('[ "$(pwd -P)" = "$W" ] || exit 125');
    expect(body.indexOf('|| exit 125')).toBeLessThan(body.indexOf('export HOME'));
  });

  describe.each(BRANCHES)('%s', (_label, bin) => {
    it('--auth-check: scratch swapped for a symlink to the project before the probe: exit 11, grok never runs', () => {
      const r = run({ auth: true, bin: { ...bin, scratchHook: 'swap' } });
      expect(r.models).toHaveLength(0);
      expect(r.status).toBe(11);
      expect(r.stderr).toMatch(/could not enter its scratch dir/);
      expect(existsSync(join(r.proj, 'models.out'))).toBe(false);
    }, T);

    it('--auth-check: scratch removed before the probe: exit 11 naming the scratch dir, not a login problem', () => {
      const r = run({ auth: true, bin: { ...bin, scratchHook: 'gone' } });
      expect(r.models).toHaveLength(0);
      expect(r.status).toBe(11);
      expect(r.stderr).toMatch(/could not enter its scratch dir/);
      expect(r.stderr).not.toMatch(/run grok login/);
    }, T);

    it('--input: scratch swapped or removed before the probe: unknown_error (not cli_auth_failed), no grok call', () => {
      for (const scratchHook of ['swap', 'gone'] as const) {
        const r = run({ bin: { ...bin, scratchHook } });
        expect(r.envelope?.error_code, scratchHook).toBe('unknown_error');
        expect(r.envelope?.error_message, scratchHook).toContain('scratch dir');
        expect(r.models, scratchHook).toHaveLength(0);
        expect(r.invocations, scratchHook).toHaveLength(0);
      }
    }, T);

    it('--input: scratch swapped for a symlink after the probe: the review never runs outside it (unknown_error)', () => {
      const r = run({ bin, modelsSwap: true });
      try {
        expect(r.models).toHaveLength(1);
        expect(r.invocations).toHaveLength(0);
        expect(r.envelope?.error_code).toBe('unknown_error');
        expect(r.envelope?.error_message).toContain('scratch dir');
        expect(existsSync(`${r.rawPath}.tmp`)).toBe(false);
      } finally {
        if (r.models[0]) rmSync(`${r.models[0].pwd}.moved`, { recursive: true, force: true });
      }
    }, T);
  });
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

describe.each(BRANCHES)('the runner interrupted while grok runs (%s)', (_label, bin) => {
  it.each([
    ['SIGTERM', 143],
    ['SIGINT', 130],
  ] as const)('%s: grok is stopped, a cli_failed envelope goes to stdout and --envelope-out, exit %i', async (sig, code) => {
    const c = setupCase({
      bin,
      steps: { default: { stdout: PARTIAL, sleep: 30 } },
      args: ['--input', INPUT_REL, '--envelope-out', 'env.json'],
    });
    const rawPath = join(c.proj, ENVELOPE.config.raw_output_path as string);
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
    const envFile = join(c.proj, 'env.json');
    expect(existsSync(envFile)).toBe(true);
    const envelope = JSON.parse(readFileSync(envFile, 'utf8'));
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe('cli_failed');
    expect(envelope.error_message).toBe('grok-review.sh was interrupted; the code was not reviewed.');
    expect(envelope.raw_output_path).toBe(ENVELOPE.config.raw_output_path);
    expect(JSON.parse(stdout)).toEqual(envelope);
    // The partial raw output is kept (atomic rename), and grok was stopped.
    expect(readFileSync(rawPath, 'utf8')).toBe(PARTIAL);
    expect(existsSync(`${rawPath}.tmp`)).toBe(false);
    await waitFor(() => !alive(stubPid), 5_000, 'the stub grok to exit');
    expect(readCase(c, { status: status ?? -1, stdout, stderr: '' }, false, 0).vf.filter((v) => !v.argv.includes('--error'))).toHaveLength(0);
  }, T);
});

// ---------------------------------------------------------------------------
// node / jq fallbacks
// ---------------------------------------------------------------------------

describe('JSON tooling fallbacks (harness-modernization D19)', () => {
  it.skipIf(!HAS_JQ)('jq-only (no node): g3 still gives success with wrapper usage', () => {
    const r = run({ bin: { node: false, jq: true }, steps: { default: rec('g3-json-schema-structured-output') } });
    expect(r.envelope?.status).toBe('success');
    expect(r.envelope?.findings).toHaveLength(3);
    expect(r.envelope?.usage).toEqual({ input_tokens: 10944, output_tokens: 5108, model: 'grok-4.7-build' });
    expect(r.invocations[0].prompt).toContain('--- ARTIFACT UNDER REVIEW ---\n=== src/users.js ===');
    expect(r.invocations[0].prompt).toContain('--- CONVENTIONS ---\n=== CLAUDE.md ===');
    expect(JSON.parse(argValue(r.invocations[0].argv, '--json-schema') as string)).toEqual(SHARED_SCHEMA);
  }, T);

  it.skipIf(!HAS_JQ)('jq-only: the incomplete-run guard and the .text fallback behave the same', () => {
    expect(run({ bin: { node: false, jq: true }, steps: { default: rec('g7-max-turns-cancelled') } }).envelope?.error_code).toBe('cli_failed');
    const g2 = run({ bin: { node: false, jq: true }, steps: { default: rec('g2-review-success') } });
    expect(g2.envelope?.findings).toHaveLength(4);
    expect(g2.envelope?.usage?.model).toBe('grok-4.7-build');
    expect(run({ bin: { node: false, jq: true }, steps: { default: rec('g9-unknown-model-error') } }).envelope?.error_code).toBe('cli_failed');
  }, T);

  it.skipIf(!HAS_JQ)('jq-only: the exact end_turn compare, the stderr auth mapping and the usage.model fallback behave the same', () => {
    const jqBin = { node: false, jq: true };
    for (const [stop, shown] of [['end_turn\n', '"end_turn\\n"'], [' end_turn', '" end_turn"']]) {
      const r = run({ bin: jqBin, steps: { default: { stdout: wrapper({ stopReason: stop, text: '{"findings": []}' }), exit: 0 } } });
      expect(r.envelope?.error_code, shown).toBe('cli_failed');
      expect(r.envelope?.error_message, shown).toContain(`stopReason: ${shown}`);
      expect(normalizeCalls(r), shown).toHaveLength(0);
    }
    const auth = run({
      bin: jqBin,
      steps: { default: { stdout: '{"error":"Not signed in"}', stderr: 'Error: Not signed in. Run grok login', exit: 1 } },
    });
    expect(auth.envelope?.error_code).toBe('cli_auth_failed');
    expect(normalizeCalls(auth)).toHaveLength(0);
    const noModelUsage = wrapper({ modelUsage: undefined });
    const a = run({ bin: jqBin, steps: { default: { stdout: noModelUsage, exit: 0 } }, envelopeConfig: { model: 'grok-4.7' } });
    expect(a.envelope?.usage).toEqual({ input_tokens: 11093, output_tokens: 1758, model: 'grok-4.7' });
    const b = run({ bin: jqBin, steps: { default: { stdout: noModelUsage, exit: 0 } } });
    expect(b.envelope?.usage).toEqual({ input_tokens: 11093, output_tokens: 1758, model: null });
  }, 2 * T);

  it('neither node nor jq: an unknown_error envelope and no invocation', () => {
    const r = run({ bin: { node: false, jq: false } });
    expect(r.envelope?.error_code).toBe('unknown_error');
    expect(r.invocations).toHaveLength(0);
  }, T);
});

// ---------------------------------------------------------------------------
// The registered script-smoke cases run here too
// ---------------------------------------------------------------------------

describe('script-smoke cases for scripts/adapters/grok-review.sh', () => {
  const cases = (SMOKE_CASES as Record<string, Array<{ name: string; run: (ctx: unknown) => void }>>)[
    'scripts/adapters/grok-review.sh'
  ];

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

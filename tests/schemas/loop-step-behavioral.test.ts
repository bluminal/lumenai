/**
 * Layer 2: Behavioral fixtures for plugins/synthex/scripts/loop-step.sh —
 * the FR-HM18 portable state-file bookkeeping script that takes over the
 * refusal paths, the archive algorithm, and the list/cancel output
 * formats previously described only as prose in loop.md, list-loops.md,
 * cancel-loop.md, and plugins/synthex/docs/native-looping.md.
 *
 * Every subcommand is exercised under a jq-less PATH (pattern:
 * tests/schemas/loop-idle-wait-behavioral.test.ts:148-165 — a restricted
 * bin/ directory of symlinks, no jq anywhere on it), since none of the
 * pinned compat images ship jq (FR-HM40 item 8). A second, narrower pass
 * also excludes `node` to prove the sed/awk-only fallback actually works,
 * not just degrades silently.
 *
 * Task 34 acceptance criteria (docs/plans/harness-modernization.md):
 *   - `advance` prints `[loop <id> iteration N/M]` and exits non-zero on
 *     cancel/max.
 *   - `hold` does not increment.
 *
 * docs/plans/loop-default-completion-promise.md Task 1 (D1-D5): a fresh
 * `begin` with no/empty --completion-promise now defaults it instead of
 * refusing (the former refusal path 3, "missing --completion-promise", is
 * gone — 6 refusal paths remain), and every successful `begin` prints
 * `completion promise: <value>` as its second stdout line, after the
 * loop-id (which stays first, unchanged, for existing consumers).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Each case spawns several bash subprocesses; the 5 s default times out on
// loaded hosts and slow CI runners even though a single call takes ~40 ms.
vi.setConfig({ testTimeout: 30_000 });
import { execFileSync } from 'child_process';
import { validateLoopStateFile } from './loop-state-file';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const LOOP_STEP = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'loop-step.sh');

// ---------------------------------------------------------------------------
// jq-less PATH (mirrors loop-idle-wait-behavioral.test.ts's jqlessPath()).
// loop-step.sh needs a slightly larger POSIX toolset than the idle waiter
// (sort, cut, wc, od, dirname, basename, mktemp for `list`/`begin`/`archive`).
// ---------------------------------------------------------------------------

const NOJQ_TOOLS = [
  'bash', 'sh', 'sed', 'awk', 'grep', 'cut', 'wc', 'sort', 'head', 'tr',
  'mv', 'rm', 'mkdir', 'date', 'od', 'dirname', 'basename', 'cat', 'mktemp', 'ls',
];

function resolveRealTool(tool: string): string {
  // Bypasses any interactive-shell function/alias shadowing (this repo's dev
  // shells wrap several coreutils) by resolving through a clean /bin/sh.
  return execFileSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
}

function buildPath(dir: string, includeNode: boolean): string {
  const bin = join(dir, 'bin-nojq' + (includeNode ? '-node' : ''));
  mkdirSync(bin, { recursive: true });
  for (const tool of NOJQ_TOOLS) {
    const src = resolveRealTool(tool);
    if (src) symlinkSync(src, join(bin, tool));
  }
  if (includeNode) {
    const nodeSrc = resolveRealTool('node');
    if (nodeSrc) symlinkSync(nodeSrc, join(bin, 'node'));
  }
  return bin;
}

let projectDir: string;
let loopsDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'loop-step-'));
  loopsDir = join(projectDir, '.synthex', 'loops');
  mkdirSync(loopsDir, { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

interface RunOpts {
  path?: string;
  now?: string;
  cwd?: string;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: RunOpts = {}): RunResult {
  const env: NodeJS.ProcessEnv = {
    PATH: opts.path ?? process.env.PATH ?? '',
    SYNTHEX_LOOPS_DIR: loopsDir,
  };
  if (opts.now) env.SYNTHEX_NOW = opts.now;
  const bash = opts.path ? join(opts.path, 'bash') : 'bash';
  try {
    const stdout = execFileSync(bash, [LOOP_STEP, ...args], {
      cwd: opts.cwd ?? projectDir,
      env,
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

function readLoop(loopId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(loopsDir, `${loopId}.json`), 'utf-8'));
}

function writeLoop(loopId: string, fields: Record<string, unknown>): void {
  const full = {
    schema_version: 1,
    loop_id: loopId,
    session_id: null,
    command: '/synthex:loop',
    args: '',
    prompt_file: null,
    completion_promise: 'DONE',
    max_iterations: 20,
    iteration: 0,
    isolation: 'shared-context',
    status: 'running',
    started_at: '2026-05-13T18:22:04Z',
    last_updated: '2026-05-13T18:22:04Z',
    exited_at: null,
    exit_reason: null,
    consecutive_stop_blocks: 0,
    last_gate_iteration: -1,
    idle_streak: 0,
    last_idle_iteration: -1,
    ...fields,
  };
  writeFileSync(join(loopsDir, `${loopId}.json`), JSON.stringify(full, null, 2));
}

// Two PATH variants: jq-less-with-node (the realistic every-pinned-image
// case per FR-HM40 item 8) and jq-less-without-node (the sed/awk-only
// fallback, proven separately at the end of this file).
let nojqWithNode: string;

describe('loop-step.sh — behavioral (jq-less PATH)', () => {
  beforeEach(() => {
    nojqWithNode = buildPath(projectDir, true);
  });

  const opts = (): RunOpts => ({ path: nojqWithNode });

  describe('begin', () => {
    it('creates a fresh state file and prints the resolved loop-id, then the completion promise', () => {
      const r = run(
        ['begin', '/synthex:loop', '--completion-promise', 'DONE', '--name', 'my-loop', '--max', '5'],
        opts(),
      );
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[0]).toBe('my-loop');
      expect(lines[1]).toBe('completion promise: DONE');
      const state = readLoop('my-loop');
      expect(state).toMatchObject({
        schema_version: 1,
        loop_id: 'my-loop',
        status: 'running',
        iteration: 0,
        max_iterations: 5,
        completion_promise: 'DONE',
        exited_at: null,
        exit_reason: null,
      });
    });

    it('auto-generates <command-slug>-<hex4> when --name is omitted', () => {
      const r = run(['begin', '/synthex:next-priority', '--completion-promise', 'ALLDONE'], opts());
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[0]).toMatch(/^next-priority-[0-9a-f]{4}$/);
      expect(lines[1]).toBe('completion promise: ALLDONE');
    });

    it('derives the command slug from any plugin prefix, not just synthex', () => {
      const r = run(['begin', '/other-plugin:build-something', '--completion-promise', 'X'], opts());
      const lines = r.stdout.trim().split('\n');
      expect(lines[0]).toMatch(/^build-something-[0-9a-f]{4}$/);
    });

    it('defaults --completion-promise to ALLDONE<session_id> when omitted (D1)', () => {
      const r = run(
        ['begin', '/synthex:loop', '--name', 'default-sid', '--session-id', 'X'],
        opts(),
      );
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[0]).toBe('default-sid');
      expect(lines[1]).toBe('completion promise: ALLDONEX');
      expect(readLoop('default-sid').completion_promise).toBe('ALLDONEX');
    });

    it('falls back to ALLDONE<loop_id> when both --completion-promise and --session-id are omitted (D2)', () => {
      const r = run(['begin', '/synthex:loop', '--name', 'default-noid'], opts());
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[0]).toBe('default-noid');
      expect(lines[1]).toBe('completion promise: ALLDONEdefault-noid');
      expect(readLoop('default-noid').completion_promise).toBe('ALLDONEdefault-noid');
    });

    it('stores an explicit --completion-promise verbatim rather than the default', () => {
      const r = run(
        ['begin', '/synthex:loop', '--name', 'explicit1', '--session-id', 'X', '--completion-promise', 'CUSTOM-TOKEN'],
        opts(),
      );
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[1]).toBe('completion promise: CUSTOM-TOKEN');
      expect(readLoop('explicit1').completion_promise).toBe('CUSTOM-TOKEN');
    });

    describe('refusal paths (6 total across begin/advance/hold)', () => {
      it('1. invalid --name pattern (FR-NL11)', () => {
        const r = run(
          ['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'Bad_Name!'],
          opts(),
        );
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/Invalid --name/);
      });

      it('2. --max out of [1, 200] range (FR-NL42)', () => {
        const r = run(
          ['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'too-big', '--max', '500'],
          opts(),
        );
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/--max-iterations must be an integer in \[1, 200\]/);
      });

      it('3. --name collision with an already-running loop', () => {
        run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'dupe'], opts());
        const r = run(['begin', '/synthex:loop', '--completion-promise', 'Y', '--name', 'dupe'], opts());
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/is already running/);
      });

      it('4. --resume with an unknown loop-id (FR-NL40)', () => {
        const r = run(['begin', '/synthex:loop', '--resume', 'never-existed'], opts());
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/No loop found: never-existed/);
      });

      it('5. --resume with an unknown schema_version (FR-NL41)', () => {
        writeLoop('old-schema', { schema_version: 2 });
        const r = run(['begin', '/synthex:loop', '--resume', 'old-schema'], opts());
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/schema_version=2/);
      });

      it('6. --resume of a terminal (non-running) loop', () => {
        writeLoop('done-loop', { status: 'completed', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
        const r = run(['begin', '/synthex:loop', '--resume', 'done-loop'], opts());
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/is completed\. Cannot resume a terminal loop/);
      });
    });

    it('--resume refreshes session_id and last_updated on a running loop', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'rsm', '--session-id', 'orig'], opts());
      const r = run(['begin', '/synthex:loop', '--resume', 'rsm', '--session-id', 'new-session'], opts());
      expect(r.code).toBe(0);
      const state = readLoop('rsm');
      expect(state.session_id).toBe('new-session');
      expect(state.status).toBe('running');
    });

    // D4: --resume (and, by the same code path, the command-level
    // --resume-last, which resolves to a loop-id and calls this same
    // `begin --resume <loop-id>`, per loop.md) never recomputes or
    // overwrites the stored completion_promise — even when a default was
    // used on the original fresh start, and even when --session-id changes
    // on resume.
    it('--resume leaves an explicitly-set stored promise unchanged and prints it (D4)', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'KEEP-ME', '--name', 'rsm-explicit', '--session-id', 'orig'], opts());
      const r = run(['begin', '/synthex:loop', '--resume', 'rsm-explicit', '--session-id', 'new-session'], opts());
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[0]).toBe('rsm-explicit');
      expect(lines[1]).toBe('completion promise: KEEP-ME');
      expect(readLoop('rsm-explicit').completion_promise).toBe('KEEP-ME');
    });

    it('--resume leaves a defaulted stored promise unchanged, even though --session-id differs now (D4)', () => {
      run(['begin', '/synthex:loop', '--name', 'rsm-default', '--session-id', 'orig'], opts());
      expect(readLoop('rsm-default').completion_promise).toBe('ALLDONEorig');
      const r = run(['begin', '/synthex:loop', '--resume', 'rsm-default', '--session-id', 'different-session'], opts());
      expect(r.code).toBe(0);
      const lines = r.stdout.trim().split('\n');
      expect(lines[1]).toBe('completion promise: ALLDONEorig');
      expect(readLoop('rsm-default').completion_promise).toBe('ALLDONEorig');
    });

    it('archives terminal-status files on every begin invocation (native-looping.md § Archive)', () => {
      writeLoop('stale', { status: 'cancelled', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'fresh'], opts());
      expect(existsSync(join(loopsDir, 'stale.json'))).toBe(false);
      expect(existsSync(join(loopsDir, '.archive'))).toBe(true);
    });
  });

  describe('advance', () => {
    it('prints `[loop <id> iteration N/M]` and increments atomically', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'adv1', '--max', '5'], opts());
      const r1 = run(['advance', 'adv1'], opts());
      expect(r1.code).toBe(0);
      expect(r1.stdout.trim()).toBe('[loop adv1 iteration 1/5]');
      const r2 = run(['advance', 'adv1'], opts());
      expect(r2.stdout.trim()).toBe('[loop adv1 iteration 2/5]');
      expect(readLoop('adv1').iteration).toBe(2);
    });

    it('exits non-zero and refuses on a cancelled loop', () => {
      writeLoop('cancelled-loop', { status: 'cancelled', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
      const r = run(['advance', 'cancelled-loop'], opts());
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/is cancelled — nothing to do/);
    });

    it('exits non-zero and transitions to max-iterations-reached once the cap is hit', () => {
      writeLoop('atmax', { iteration: 3, max_iterations: 3 });
      const r = run(['advance', 'atmax'], opts());
      expect(r.code).not.toBe(0);
      const state = readLoop('atmax');
      expect(state.status).toBe('max-iterations-reached');
      expect(state.exit_reason).toContain('max_iterations=3');
      expect(state.exited_at).not.toBeNull();
    });

    it('exits non-zero for an unknown loop-id', () => {
      const r = run(['advance', 'never-existed'], opts());
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/No loop found/);
    });
  });

  describe('hold', () => {
    it('does NOT increment the iteration counter', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'hld1', '--max', '5'], opts());
      run(['advance', 'hld1'], opts());
      const before = readLoop('hld1');
      const r = run(['hold', 'hld1'], opts());
      expect(r.code).toBe(0);
      const after = readLoop('hld1');
      expect(after.iteration).toBe(before.iteration);
    });

    it('refreshes last_updated', () => {
      writeLoop('hld2', { iteration: 1, last_updated: '2026-05-13T18:00:00Z' });
      run(['hold', 'hld2'], { ...opts(), now: '2026-05-13T19:30:00Z' });
      expect(readLoop('hld2').last_updated).toBe('2026-05-13T19:30:00Z');
      expect(readLoop('hld2').iteration).toBe(1);
    });

    it('exits non-zero when the loop is not running', () => {
      writeLoop('hld3', { status: 'cancelled', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
      const r = run(['hold', 'hld3'], opts());
      expect(r.code).not.toBe(0);
    });
  });

  describe('finish', () => {
    it('transitions to completed with the FR-NL23 exit_reason', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'fin1'], opts());
      const r = run(['finish', 'fin1', 'completed'], { ...opts(), now: '2026-05-13T20:00:00Z' });
      expect(r.code).toBe(0);
      const state = readLoop('fin1');
      expect(state.status).toBe('completed');
      expect(state.exit_reason).toBe('completion-promise-emitted');
      expect(state.exited_at).toBe('2026-05-13T20:00:00Z');
    });

    it('is idempotent on an already-terminal loop', () => {
      writeLoop('fin2', { status: 'completed', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
      const r = run(['finish', 'fin2', 'cancelled'], opts());
      expect(r.code).toBe(0);
      expect(readLoop('fin2').status).toBe('completed'); // unchanged
    });

    it('rejects an invalid status value', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'fin3'], opts());
      const r = run(['finish', 'fin3', 'bogus-status'], opts());
      expect(r.code).not.toBe(0);
    });
  });

  describe('archive', () => {
    it('moves terminal-status files to .archive/ and leaves running loops alone', () => {
      writeLoop('term1', { status: 'completed', exited_at: '2026-05-13T18:22:04Z', exit_reason: 'x' });
      writeLoop('run1', { status: 'running' });
      const r = run(['archive'], opts());
      expect(r.code).toBe(0);
      expect(existsSync(join(loopsDir, 'term1.json'))).toBe(false);
      expect(existsSync(join(loopsDir, 'run1.json'))).toBe(true);
      const archived = readFileSync(
        (execFileSync('/bin/sh', ['-c', `ls ${join(loopsDir, '.archive')}/term1-*.json`], { encoding: 'utf-8' })).trim(),
        'utf-8',
      );
      expect(JSON.parse(archived).loop_id).toBe('term1');
    });
  });

  describe('list', () => {
    it('prints "No loops in this project." when the directory is empty', () => {
      const r = run(['list'], opts());
      expect(r.stdout.trim()).toBe('No loops in this project.');
    });

    it('prints RUNNING and COMPLETED buckets with the documented columns', () => {
      writeLoop('r1', { status: 'running', iteration: 5, max_iterations: 20, started_at: '2026-05-13T18:00:00Z', session_id: 'abc12345xyz' });
      writeLoop('c1', {
        status: 'completed',
        iteration: 3,
        max_iterations: 20,
        exited_at: '2026-05-13T19:00:00Z',
        exit_reason: 'completion-promise-emitted',
      });
      const r = run(['list'], opts());
      expect(r.stdout).toMatch(/^RUNNING \(1\):$/m);
      expect(r.stdout).toMatch(/r1\s+iter 5\/20/);
      expect(r.stdout).toMatch(/^COMPLETED \(1\):$/m);
      expect(r.stdout).toMatch(/c1\s+completed \(promise\)\s+iter 3\/20/);
    });

    it('truncates COMPLETED at 20 with a trailing count note', () => {
      for (let i = 0; i < 23; i++) {
        writeLoop(`c${i}`, {
          status: 'cancelled',
          exited_at: `2026-05-13T18:00:${String(i).padStart(2, '0')}Z`,
          exit_reason: 'x',
        });
      }
      const r = run(['list'], opts());
      expect(r.stdout).toMatch(/^COMPLETED \(20\):$/m);
      expect(r.stdout).toMatch(/… and 3 more terminal loops \(see \.synthex\/loops\/\.archive\/\)\./);
    });

    it('surfaces a WARNINGS line for an unparsable state file without aborting', () => {
      writeFileSync(join(loopsDir, 'broken.json'), '{not json');
      writeLoop('ok1', { status: 'running' });
      const r = run(['list'], opts());
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/WARNINGS:/);
      expect(r.stdout).toMatch(/broken\.json/);
      expect(r.stdout).toMatch(/RUNNING \(1\)/);
    });
  });

  describe('cancel', () => {
    it('cancels a single running loop and prints the confirmation', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'cxl1', '--max', '10'], opts());
      run(['advance', 'cxl1'], opts());
      const r = run(['cancel', 'cxl1'], opts());
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Cancelled loop "cxl1" \(was at iteration 1\/10\)/);
      expect(readLoop('cxl1').status).toBe('cancelled');
    });

    it('is idempotent on repeated cancellation of the same id (FR-NL29)', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'cxl2'], opts());
      run(['cancel', 'cxl2'], opts());
      const r = run(['cancel', 'cxl2'], opts());
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/is already cancelled — nothing to do/);
    });

    it('refuses for an unknown loop-id', () => {
      const r = run(['cancel', 'never-existed'], opts());
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/No loop found: never-existed/);
    });

    it('refuses when neither loop_id nor --all is supplied', () => {
      const r = run(['cancel'], opts());
      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/Usage: \/synthex:cancel-loop <loop-id> \| --all/);
    });

    it('--all cancels every running loop and summarizes each', () => {
      run(['begin', '/synthex:loop', '--completion-promise', 'A', '--name', 'call-a'], opts());
      run(['begin', '/synthex:loop', '--completion-promise', 'B', '--name', 'call-b'], opts());
      writeLoop('already-done', { status: 'completed', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
      const r = run(['cancel', '--all'], opts());
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Cancelled \(2\):/);
      expect(r.stdout).toMatch(/call-a\s+was at iter/);
      expect(r.stdout).toMatch(/call-b\s+was at iter/);
      expect(readLoop('call-a').status).toBe('cancelled');
      expect(readLoop('call-b').status).toBe('cancelled');
    });

    it('--all prints "No running loops to cancel." when nothing is running (E16)', () => {
      writeLoop('term-only', { status: 'crashed', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
      const r = run(['cancel', '--all'], opts());
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe('No running loops to cancel.');
    });
  });

  describe('check-writable', () => {
    it('exits 0 silently for a writable directory', () => {
      const r = run(['check-writable', loopsDir], opts());
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('');
    });

    it('exits non-zero with a hint for an unwritable directory', () => {
      const roDir = join(projectDir, 'readonly-target');
      mkdirSync(roDir);
      chmodSync(roDir, 0o555);
      try {
        const r = run(['check-writable', roDir], opts());
        expect(r.code).not.toBe(0);
        expect(r.stderr).toMatch(/cannot write to/);
      } finally {
        chmodSync(roDir, 0o755);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// hosts without jq AND without node — proves the sed/awk-only fallback works,
// not just that it degrades gracefully (mirrors loop-idle-wait-behavioral.test.ts's
// "hosts without jq" block, extended to also drop node since loop-step.sh, unlike
// loop-idle-wait.sh, has a real node-vs-fallback branch to prove).
// ---------------------------------------------------------------------------

describe('loop-step.sh — hosts without jq or node (sed/awk fallback)', () => {
  let bin: string;

  beforeEach(() => {
    bin = buildPath(projectDir, false);
  });

  it('has neither jq nor node on PATH for this pass', () => {
    expect(() => execFileSync('/bin/sh', ['-c', `PATH=${bin} command -v jq`])).toThrow();
    expect(() => execFileSync('/bin/sh', ['-c', `PATH=${bin} command -v node`])).toThrow();
  });

  it('runs the full begin -> advance -> advance -> hold -> finish -> list -> cancel round trip', () => {
    const opts = (): RunOpts => ({ path: bin });

    const begin = run(
      ['begin', '/synthex:next-priority', '--completion-promise', 'ALLDONE', '--name', 'nojq-e2e', '--max', '5', '--args', '@docs/plans/main.md'],
      opts(),
    );
    expect(begin.code).toBe(0);
    const beginLines = begin.stdout.trim().split('\n');
    expect(beginLines[0]).toBe('nojq-e2e');
    expect(beginLines[1]).toBe('completion promise: ALLDONE');

    const adv1 = run(['advance', 'nojq-e2e'], opts());
    expect(adv1.stdout.trim()).toBe('[loop nojq-e2e iteration 1/5]');
    const adv2 = run(['advance', 'nojq-e2e'], opts());
    expect(adv2.stdout.trim()).toBe('[loop nojq-e2e iteration 2/5]');

    const before = readLoop('nojq-e2e');
    run(['hold', 'nojq-e2e'], opts());
    expect(readLoop('nojq-e2e').iteration).toBe(before.iteration);

    const list1 = run(['list'], opts());
    expect(list1.stdout).toMatch(/RUNNING \(1\)/);
    expect(list1.stdout).toMatch(/nojq-e2e\s+iter 2\/5/);

    const finish = run(['finish', 'nojq-e2e', 'completed'], opts());
    expect(finish.code).toBe(0);
    expect(readLoop('nojq-e2e').status).toBe('completed');
  });

  it('advance still refuses on a cancelled loop and exits non-zero', () => {
    writeLoop('nojq-cancelled', { status: 'cancelled', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'x' });
    const r = run(['advance', 'nojq-cancelled'], { path: bin });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/is cancelled — nothing to do/);
  });

  it('defaults --completion-promise the same way under the sed/awk fallback (D1/D2)', () => {
    const withSession = run(
      ['begin', '/synthex:loop', '--name', 'nojq-default-sid', '--session-id', 'X'],
      { path: bin },
    );
    expect(withSession.code).toBe(0);
    expect(readLoop('nojq-default-sid').completion_promise).toBe('ALLDONEX');
    expect(withSession.stdout.trim().split('\n')[1]).toBe('completion promise: ALLDONEX');

    const withoutSession = run(['begin', '/synthex:loop', '--name', 'nojq-default-noid'], { path: bin });
    expect(withoutSession.code).toBe(0);
    expect(readLoop('nojq-default-noid').completion_promise).toBe('ALLDONEnojq-default-noid');
  });

  it('cancel --all still works end to end', () => {
    run(['begin', '/synthex:loop', '--completion-promise', 'A', '--name', 'nojq-a'], { path: bin });
    run(['begin', '/synthex:loop', '--completion-promise', 'B', '--name', 'nojq-b'], { path: bin });
    const r = run(['cancel', '--all'], { path: bin });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Cancelled \(2\):/);
  });

  it('advance --run, hold --run and hold set and clear runId under the sed/awk fallback', () => {
    const o = { path: bin, now: '2026-10-01T12:00:00Z' };
    run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'nojq-run', '--max', '5'], o);
    const adv = run(['advance', 'nojq-run', '--run'], o);
    expect(adv.code).toBe(0);
    expect(adv.stdout).toBe('[loop nojq-run iteration 1/5]\nrun-id: nojq-run-i1\n');
    expect(readLoop('nojq-run').runId).toBe('nojq-run-i1');

    const hold = run(['hold', 'nojq-run'], o);
    expect(hold.code).toBe(0);
    expect(hold.stdout).toBe('');
    expect('runId' in readLoop('nojq-run')).toBe(false);

    const holdRun = run(['hold', 'nojq-run', '--run'], o);
    expect(holdRun.code).toBe(0);
    expect(holdRun.stdout).toBe('run-id: nojq-run-i1\n');
    expect(readLoop('nojq-run').runId).toBe('nojq-run-i1');

    // A re-render under the fallback keeps the lease until something clears it.
    const adv2 = run(['advance', 'nojq-run'], o);
    expect(adv2.stdout).toBe('[loop nojq-run iteration 2/5]\n');
    const state = readLoop('nojq-run');
    expect('runId' in state).toBe(false);
    expect(state.iteration).toBe(2);
    expect(validateLoopStateFile(state).valid).toBe(true);
  });

  it('null fields stay JSON null across begin, advance and hold (sed/awk fallback)', () => {
    const o = { path: bin };
    expect(run(['begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'nojq-null'], o).code).toBe(0);
    expect(run(['advance', 'nojq-null'], o).code).toBe(0);
    expect(run(['hold', 'nojq-null'], o).code).toBe(0);
    const raw = readFileSync(join(loopsDir, 'nojq-null.json'), 'utf-8');
    expect(raw).not.toContain('__NULL__');
    const state = JSON.parse(raw);
    expect(state.session_id).toBeNull();
    expect(state.prompt_file).toBeNull();
    expect(state.exited_at).toBeNull();
    expect(state.exit_reason).toBeNull();
    expect(validateLoopStateFile(state).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-HM19 Stage 2 (Task 59): the runId lease. advance --run / hold --run set
// it; every other mutation clears it; Stage 1 loops never carry the key.
// ---------------------------------------------------------------------------

const CANONICAL_KEYS = [
  'schema_version', 'loop_id', 'session_id', 'command', 'args', 'prompt_file',
  'completion_promise', 'max_iterations', 'iteration', 'isolation', 'status',
  'started_at', 'last_updated', 'exited_at', 'exit_reason',
  'consecutive_stop_blocks', 'last_gate_iteration', 'idle_streak', 'last_idle_iteration',
];

describe('runId lease (FR-HM19, Task 59) — jq-less PATH', () => {
  let bin: string;
  beforeEach(() => {
    bin = buildPath(projectDir, true);
  });
  const o = (now?: string): RunOpts => ({ path: bin, ...(now ? { now } : {}) });
  const begin = (name: string, extra: string[] = []) =>
    run(['begin', '/synthex:next-priority', '--completion-promise', 'X', '--name', name, '--max', '5', ...extra], o());

  it('advance --run sets runId <id>-i<N>, stamps last_updated from SYNTHEX_NOW, and prints run-id on line 2', () => {
    begin('lease1');
    expect(run(['advance', 'lease1'], o()).code).toBe(0);
    const r = run(['advance', 'lease1', '--run'], o('2026-10-01T12:00:00Z'));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('[loop lease1 iteration 2/5]\nrun-id: lease1-i2\n');
    const state = readLoop('lease1');
    expect(state.runId).toBe('lease1-i2');
    expect(state.iteration).toBe(2);
    expect(state.last_updated).toBe('2026-10-01T12:00:00Z');
    // runId is the LAST key.
    expect(Object.keys(state)).toEqual([...CANONICAL_KEYS, 'runId']);
    expect(validateLoopStateFile(state).valid).toBe(true);
    // --run before the id parses the same way.
    const r2 = run(['advance', '--run', 'lease1'], o());
    expect(r2.stdout).toBe('[loop lease1 iteration 3/5]\nrun-id: lease1-i3\n');
  });

  it('plain advance clears an existing runId', () => {
    begin('lease2');
    run(['advance', 'lease2', '--run'], o());
    expect(readLoop('lease2').runId).toBe('lease2-i1');
    const r = run(['advance', 'lease2'], o());
    expect(r.stdout).toBe('[loop lease2 iteration 2/5]\n');
    expect('runId' in readLoop('lease2')).toBe(false);
  });

  it('hold clears runId and keeps the iteration', () => {
    begin('lease3');
    run(['advance', 'lease3', '--run'], o());
    const r = run(['hold', 'lease3'], o('2026-10-01T12:05:00Z'));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    const state = readLoop('lease3');
    expect('runId' in state).toBe(false);
    expect(state.iteration).toBe(1);
    expect(state.last_updated).toBe('2026-10-01T12:05:00Z');
  });

  it('hold --run sets runId <id>-i<N> without incrementing and prints exactly run-id: <id>-i<N>', () => {
    begin('lease4');
    run(['advance', 'lease4'], o());
    run(['advance', 'lease4'], o());
    const r = run(['hold', 'lease4', '--run'], o('2026-10-01T12:10:00Z'));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('run-id: lease4-i2\n');
    const state = readLoop('lease4');
    expect(state.runId).toBe('lease4-i2');
    expect(state.iteration).toBe(2);
    expect(state.last_updated).toBe('2026-10-01T12:10:00Z');
    expect(validateLoopStateFile(state).valid).toBe(true);
  });

  it('hold --run exits 5 when the loops directory is not writable', () => {
    begin('lease5');
    run(['advance', 'lease5'], o());
    const before = readFileSync(join(loopsDir, 'lease5.json'));
    chmodSync(loopsDir, 0o555);
    try {
      const r = run(['hold', 'lease5', '--run'], o());
      expect(r.code).toBe(5);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(/hold: cannot write to/);
      // Plain hold stays best-effort: exit 0.
      expect(run(['hold', 'lease5'], o()).code).toBe(0);
    } finally {
      chmodSync(loopsDir, 0o755);
    }
    expect(readFileSync(join(loopsDir, 'lease5.json')).equals(before)).toBe(true);
  });

  it('hold exits 3 for a loop cancelled while a run is pending, and the cancelled file has no runId', () => {
    begin('lease6');
    run(['advance', 'lease6', '--run'], o());
    expect(run(['cancel', 'lease6'], o()).code).toBe(0);
    const state = readLoop('lease6');
    expect(state.status).toBe('cancelled');
    expect('runId' in state).toBe(false);
    expect(validateLoopStateFile(state).valid).toBe(true);
    expect(run(['hold', 'lease6'], o()).code).toBe(3);
    expect(run(['hold', 'lease6', '--run'], o()).code).toBe(3);
    expect('runId' in readLoop('lease6')).toBe(false);
  });

  it('finish, cancel and cancel --all clear runId', () => {
    begin('lease7a');
    begin('lease7b');
    begin('lease7c');
    begin('lease7d');
    for (const id of ['lease7a', 'lease7b', 'lease7c', 'lease7d']) {
      run(['advance', id, '--run'], o());
      expect(readLoop(id).runId).toBe(`${id}-i1`);
    }
    expect(run(['finish', 'lease7a', 'completed', 'plan-complete'], o()).code).toBe(0);
    const fin = readLoop('lease7a');
    expect(fin.status).toBe('completed');
    expect(fin.exit_reason).toBe('plan-complete');
    expect('runId' in fin).toBe(false);
    expect(validateLoopStateFile(fin).valid).toBe(true);

    expect(run(['cancel', 'lease7b'], o()).code).toBe(0);
    expect('runId' in readLoop('lease7b')).toBe(false);

    const all = run(['cancel', '--all'], o());
    expect(all.code).toBe(0);
    for (const id of ['lease7c', 'lease7d']) {
      const st = readLoop(id);
      expect(st.status).toBe('cancelled');
      expect('runId' in st).toBe(false);
      expect(validateLoopStateFile(st).valid).toBe(true);
    }
  });

  it('begin --resume clears runId', () => {
    begin('lease8', ['--session-id', 'orig']);
    run(['advance', 'lease8', '--run'], o());
    const r = run(['begin', '/synthex:next-priority', '--resume', 'lease8', '--session-id', 'new'], o());
    expect(r.code).toBe(0);
    const state = readLoop('lease8');
    expect('runId' in state).toBe(false);
    expect(state.session_id).toBe('new');
    expect(state.iteration).toBe(1);
  });

  it('the max-iterations path clears runId', () => {
    writeLoop('atmax-lease', { iteration: 3, max_iterations: 3, runId: 'atmax-lease-i3' });
    const r = run(['advance', 'atmax-lease', '--run'], o());
    expect(r.code).toBe(4);
    expect(r.stdout).toBe('');
    const state = readLoop('atmax-lease');
    expect(state.status).toBe('max-iterations-reached');
    expect('runId' in state).toBe(false);
    expect(validateLoopStateFile(state).valid).toBe(true);

    writeLoop('atmax-plain', { iteration: 3, max_iterations: 3, runId: 'atmax-plain-i3' });
    expect(run(['advance', 'atmax-plain'], o()).code).toBe(4);
    expect('runId' in readLoop('atmax-plain')).toBe(false);
  });

  it('advance and hold reject an unknown extra argument with exit 1', () => {
    begin('lease9');
    const path = join(loopsDir, 'lease9.json');
    const before = readFileSync(path);
    const cases: Array<[string[], RegExp]> = [
      [['advance', 'lease9', '--bogus'], /Usage: loop-step\.sh advance <loop-id> \[--run\]/],
      [['advance', 'lease9', 'extra'], /Usage: loop-step\.sh advance <loop-id> \[--run\]/],
      [['advance', '--run'], /Usage: loop-step\.sh advance <loop-id> \[--run\]/],
      [['advance'], /Usage: loop-step\.sh advance <loop-id> \[--run\]/],
      [['hold', 'lease9', '--bogus'], /Usage: loop-step\.sh hold <loop-id> \[--run\]/],
      [['hold', 'lease9', 'extra'], /Usage: loop-step\.sh hold <loop-id> \[--run\]/],
      [['hold', '--run'], /Usage: loop-step\.sh hold <loop-id> \[--run\]/],
      [['hold'], /Usage: loop-step\.sh hold <loop-id> \[--run\]/],
    ];
    for (const [args, usage] of cases) {
      const r = run(args, o());
      expect(r.code, args.join(' ')).toBe(1);
      expect(r.stdout, args.join(' ')).toBe('');
      expect(r.stderr, args.join(' ')).toMatch(usage);
    }
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it('a loop that never leases has no runId key after begin, advance and hold (Stage 1 byte-identity)', () => {
    begin('stage1');
    const raw0 = readFileSync(join(loopsDir, 'stage1.json'), 'utf-8');
    expect(raw0).not.toContain('runId');
    expect(Object.keys(JSON.parse(raw0))).toEqual(CANONICAL_KEYS);
    run(['advance', 'stage1'], o());
    const raw1 = readFileSync(join(loopsDir, 'stage1.json'), 'utf-8');
    expect(raw1).not.toContain('runId');
    expect(Object.keys(JSON.parse(raw1))).toEqual(CANONICAL_KEYS);
    run(['hold', 'stage1'], o());
    const raw2 = readFileSync(join(loopsDir, 'stage1.json'), 'utf-8');
    expect(raw2).not.toContain('runId');
    expect(Object.keys(JSON.parse(raw2))).toEqual(CANONICAL_KEYS);
    // The last line before the closing brace is still the comma-free idle field.
    expect(raw2.endsWith('  "last_idle_iteration": -1\n}\n')).toBe(true);
  });
});

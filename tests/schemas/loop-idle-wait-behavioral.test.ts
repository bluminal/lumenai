/**
 * Layer 2: Behavioral fixtures for loop-idle-wait.sh — the in-turn idle wait a
 * looping command runs when an iteration found nothing actionable, instead of
 * ending the turn (which fires Stop hooks: "Stop hook error" noise plus
 * external "agent finished" notifications).
 *
 * Each test sets up a temp project (.synthex/loops/<id>.json + a watched plan
 * file), runs the script with tiny SYNTHEX_LOOP_IDLE_MAX / _POLL values, and
 * asserts on the printed reason and the persisted idle streak.
 *
 * Spec: plugins/synthex/hooks/loop-advance-gate.md § Idle iterations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const IDLE_WAIT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'loop-idle-wait.sh');

const hasJq = (() => {
  try {
    execFileSync('jq', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

let projectDir: string;
let planPath: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'loop-idle-'));
  mkdirSync(join(projectDir, '.synthex', 'loops'), { recursive: true });
  planPath = join(projectDir, 'plan.md');
  writeFileSync(planPath, '- [ ] task 1 (blocked on [H])\n');
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function statePath(loopId = 'np-1'): string {
  return join(projectDir, '.synthex', 'loops', `${loopId}.json`);
}

function writeLoop(state: Record<string, unknown>): void {
  const full = { schema_version: 1, loop_id: 'np-1', status: 'running', iteration: 5, ...state };
  writeFileSync(statePath(full.loop_id as string), JSON.stringify(full));
}

function readState(): Record<string, unknown> {
  return JSON.parse(readFileSync(statePath(), 'utf-8'));
}

const FAST_ENV = { ...process.env, SYNTHEX_LOOP_IDLE_MAX: '2', SYNTHEX_LOOP_IDLE_POLL: '1' };

function runWait(args: string[]): string {
  return execFileSync('bash', [IDLE_WAIT, ...args], {
    cwd: projectDir,
    env: FAST_ENV,
    encoding: 'utf-8',
  }).trim();
}

/** Run the wait in the background, apply `mutate` after `delayMs`, resolve with stdout. */
function runWaitWhile(args: string[], delayMs: number, mutate: () => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [IDLE_WAIT, ...args], {
      cwd: projectDir,
      env: { ...process.env, SYNTHEX_LOOP_IDLE_MAX: '20', SYNTHEX_LOOP_IDLE_POLL: '1' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => resolve(out.trim()));
    setTimeout(mutate, delayMs);
  });
}

describe.skipIf(!hasJq)('loop-idle-wait.sh — in-turn idle wait', () => {
  it('times out at the capped limit when nothing changes', () => {
    writeLoop({});
    const out = runWait(['np-1', planPath]);
    expect(out).toMatch(/^idle-wait np-1: timeout after 2s \(idle streak 1, limit 2s\)$/);
  });

  it('returns early with "changed" when the watched plan changes', async () => {
    writeLoop({});
    const start = Date.now();
    const out = await runWaitWhile(['np-1', planPath], 1200, () =>
      writeFileSync(planPath, '- [x] task 1 approved\n'),
    );
    expect(out).toMatch(/: changed after /);
    expect(Date.now() - start).toBeLessThan(10_000);
  }, 20_000);

  it('returns early with "not-running" when the loop is cancelled', async () => {
    writeLoop({});
    const out = await runWaitWhile(['np-1', planPath], 1200, () => writeLoop({ status: 'cancelled' }));
    expect(out).toMatch(/: not-running after /);
  }, 20_000);

  it('returns immediately when the loop is already terminal', () => {
    writeLoop({ status: 'completed' });
    expect(runWait(['np-1', planPath])).toMatch(/: not-running after 0s/);
  });

  it('starts a fresh streak and records last_idle_iteration', () => {
    writeLoop({ iteration: 5 });
    runWait(['np-1']);
    const s = readState();
    expect(s.idle_streak).toBe(1);
    expect(s.last_idle_iteration).toBe(5);
  });

  it('extends the streak on consecutive idle iterations', () => {
    writeLoop({ iteration: 6, idle_streak: 2, last_idle_iteration: 5 });
    expect(runWait(['np-1'])).toMatch(/idle streak 3/);
    expect(readState().idle_streak).toBe(3);
  });

  it('resets the streak after a productive (non-idle) iteration', () => {
    writeLoop({ iteration: 9, idle_streak: 4, last_idle_iteration: 5 });
    expect(runWait(['np-1'])).toMatch(/idle streak 1/);
    expect(readState().idle_streak).toBe(1);
  });

  it('preserves other state-file fields', () => {
    writeLoop({ completion_promise: 'ALLDONE', consecutive_stop_blocks: 2 });
    runWait(['np-1']);
    const s = readState();
    expect(s.completion_promise).toBe('ALLDONE');
    expect(s.consecutive_stop_blocks).toBe(2);
    expect(s.status).toBe('running');
  });

  it('exits 0 with a usage line when loop-id is missing', () => {
    expect(runWait([])).toMatch(/missing <loop-id>/);
  });
});

/** A PATH containing only the POSIX tools the script needs — no jq (Codex/Grok hosts may lack it). */
function jqlessPath(): string {
  const bin = join(projectDir, 'bin-nojq');
  mkdirSync(bin);
  for (const tool of ['bash', 'sleep', 'cksum', 'grep', 'sed', 'head', 'mv', 'rm']) {
    const src = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
    symlinkSync(src, join(bin, tool));
  }
  return bin;
}

describe('loop-idle-wait.sh — hosts without jq', () => {
  function runNoJq(state: Record<string, unknown>): string {
    writeLoop(state);
    const bin = jqlessPath();
    return execFileSync(join(bin, 'bash'), [IDLE_WAIT, 'np-1', planPath], {
      cwd: projectDir,
      env: { PATH: bin, SYNTHEX_LOOP_IDLE_MAX: '2', SYNTHEX_LOOP_IDLE_POLL: '1' },
      encoding: 'utf-8',
    }).trim();
  }

  it('still waits (no streak tracking) and leaves the state file untouched', () => {
    const before = JSON.stringify({ schema_version: 1, loop_id: 'np-1', status: 'running', iteration: 5 });
    expect(runNoJq({})).toMatch(/: timeout after 2s \(idle streak 1, limit 2s\)$/);
    expect(readFileSync(statePath(), 'utf-8')).toBe(before);
  });

  it('detects cancellation via the grep fallback', () => {
    expect(runNoJq({ status: 'cancelled' })).toMatch(/: not-running after 0s/);
  });
});

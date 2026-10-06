/**
 * Layer 2: Behavioral fixtures for loop-advance-gate.sh — the Stop hook that
 * drives Synthex --loop iterations (ADR-003).
 *
 * The gate is turn-per-iteration: for a running loop owned by the current
 * session it BLOCKS (re-invokes the model) unless the turn emitted the promise,
 * ended on an AskUserQuestion, or the progress-aware no-progress counter passed
 * the cap. Each test sets up a temp project (.synthex/loops/<id>.json + a
 * transcript JSONL), pipes a Stop-hook payload to the script, and asserts on
 * stdout (block JSON vs empty=allow) and the persisted counter.
 *
 * Decision: docs/specs/decisions/ADR-003-native-stop-hook-looping.md
 * Spec: plugins/synthex/hooks/loop-advance-gate.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const GATE = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'loop-advance-gate.sh');

const SESSION = 'SESSION-A';

const hasJq = (() => {
  try {
    execFileSync('jq', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'loop-gate-'));
  mkdirSync(join(projectDir, '.synthex', 'loops'), { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

interface LoopState {
  loop_id?: string;
  session_id?: string;
  status?: string;
  iteration?: number;
  max_iterations?: number;
  completion_promise?: string;
  consecutive_stop_blocks?: number;
  last_gate_iteration?: number;
  runId?: string;
  last_updated?: string;
}

function writeLoop(state: LoopState): string {
  const full = {
    schema_version: 1,
    loop_id: 'np-1',
    session_id: SESSION,
    command: '/synthex:next-priority',
    completion_promise: 'ALLDONE',
    max_iterations: 20,
    iteration: 3,
    status: 'running',
    ...state,
  };
  const path = join(projectDir, '.synthex', 'loops', `${full.loop_id}.json`);
  writeFileSync(path, JSON.stringify(full));
  return path;
}

/** Write a transcript whose most-recent assistant entry has the given text and/or an AskUserQuestion tool-use. */
function writeTranscript(opts: { text?: string; askUserQuestion?: boolean }): string {
  const content: Array<Record<string, unknown>> = [];
  if (opts.text !== undefined) content.push({ type: 'text', text: opts.text });
  if (opts.askUserQuestion) content.push({ type: 'tool_use', name: 'AskUserQuestion', input: {} });
  const line = JSON.stringify({ type: 'assistant', message: { content } });
  const path = join(projectDir, 'transcript.jsonl');
  // A leading older entry plus the most-recent one (last line wins).
  writeFileSync(path, `${JSON.stringify({ type: 'user', message: { content: [] } })}\n${line}\n`);
  return path;
}

function runGate(opts: {
  transcript: string;
  sessionId?: string;
  stopHookActive?: boolean;
  env?: Record<string, string>;
}): { stdout: string; blocked: boolean } {
  const payload = JSON.stringify({
    session_id: opts.sessionId ?? SESSION,
    cwd: projectDir,
    transcript_path: opts.transcript,
    stop_hook_active: opts.stopHookActive ?? false,
  });
  const stdout = execFileSync('bash', [GATE], {
    input: payload,
    encoding: 'utf-8',
    env: { ...process.env, ...opts.env },
  }).trim();
  return { stdout, blocked: stdout.length > 0 };
}

function readCounter(loopId = 'np-1'): { consecutive_stop_blocks: number; last_gate_iteration: number } {
  const path = join(projectDir, '.synthex', 'loops', `${loopId}.json`);
  const s = JSON.parse(readFileSync(path, 'utf-8'));
  return {
    consecutive_stop_blocks: s.consecutive_stop_blocks ?? null,
    last_gate_iteration: s.last_gate_iteration ?? null,
  };
}

describe.skipIf(!hasJq)('loop-advance-gate.sh — turn-per-iteration driver (ADR-003)', () => {
  it('blocks a running loop whose turn neither advanced nor emitted the promise', () => {
    writeLoop({ iteration: 3, last_gate_iteration: -1 });
    const t = writeTranscript({ text: 'The loop is still running at iteration 3/20. Want me to resume it now?' });
    const { stdout, blocked } = runGate({ transcript: t });
    expect(blocked).toBe(true);
    const decision = JSON.parse(stdout);
    expect(decision.decision).toBe('block');
    expect(decision.reason).toMatch(/turn-per-iteration/);
    // One line, steers to in-turn continuation, and names the idle-wait script by absolute path.
    expect(decision.reason).not.toMatch(/\n/);
    expect(decision.reason).toMatch(/same turn/);
    expect(decision.reason).toMatch(/\/plugins\/synthex\/scripts\/loop-idle-wait\.sh np-1 /);
    expect(readCounter().consecutive_stop_blocks).toBe(1);
    expect(readCounter().last_gate_iteration).toBe(3);
  });

  it('accumulates the counter across no-progress turn-ends', () => {
    writeLoop({ iteration: 3, consecutive_stop_blocks: 1, last_gate_iteration: 3 });
    const t = writeTranscript({ text: 'still stuck, no marker' });
    expect(runGate({ transcript: t }).blocked).toBe(true);
    expect(readCounter().consecutive_stop_blocks).toBe(2);
  });

  it('resets the counter to 1 when the iteration advances (progress)', () => {
    writeLoop({ iteration: 6, consecutive_stop_blocks: 5, last_gate_iteration: 3 });
    const t = writeTranscript({ text: 'did some work this turn' });
    expect(runGate({ transcript: t }).blocked).toBe(true);
    expect(readCounter().consecutive_stop_blocks).toBe(1);
    expect(readCounter().last_gate_iteration).toBe(6);
  });

  it('does NOT early-exit on stop_hook_active (the regression ADR-003 fixes)', () => {
    writeLoop({ iteration: 3, consecutive_stop_blocks: 1, last_gate_iteration: 3 });
    const t = writeTranscript({ text: 'no marker, no promise' });
    // Old behavior allowed the stop here; the fixed gate must keep blocking.
    expect(runGate({ transcript: t, stopHookActive: true }).blocked).toBe(true);
  });

  it('allows the stop when the completion promise is present', () => {
    writeLoop({ iteration: 5 });
    const t = writeTranscript({ text: 'All tasks done.\n<promise>ALLDONE</promise>' });
    expect(runGate({ transcript: t }).blocked).toBe(false);
  });

  it('allows the stop on a pending AskUserQuestion ([H]-approval escape) without counting it', () => {
    writeLoop({ iteration: 5, consecutive_stop_blocks: 2, last_gate_iteration: 5 });
    const t = writeTranscript({ text: 'Need approval for [H] criterion', askUserQuestion: true });
    expect(runGate({ transcript: t }).blocked).toBe(false);
    // Counter untouched — the escape is checked before counter logic.
    expect(readCounter().consecutive_stop_blocks).toBe(2);
  });

  it('relinquishes (allows the stop) once the no-progress cap is exceeded', () => {
    // Default SYNTHEX_LOOP_BLOCK_CAP = 7; at consec 7 with no progress it ticks to 8 > cap.
    writeLoop({ iteration: 5, consecutive_stop_blocks: 7, last_gate_iteration: 5 });
    const t = writeTranscript({ text: 'still cannot advance' });
    expect(runGate({ transcript: t }).blocked).toBe(false);
  });

  it('ignores loops owned by a different session', () => {
    writeLoop({ iteration: 3, session_id: 'OTHER-SESSION' });
    const t = writeTranscript({ text: 'no marker' });
    expect(runGate({ transcript: t, sessionId: SESSION }).blocked).toBe(false);
  });

  it('allows the stop when the only loop is in a terminal status', () => {
    writeLoop({ iteration: 5, status: 'completed' });
    const t = writeTranscript({ text: 'no marker' });
    expect(runGate({ transcript: t }).blocked).toBe(false);
  });

  it('allows the stop when there are no loop state files at all', () => {
    const t = writeTranscript({ text: 'no marker' });
    expect(runGate({ transcript: t }).blocked).toBe(false);
  });
});

describe.skipIf(!hasJq)('runId lease (FR-HM19, D30, Task 59)', () => {
  const T0 = '2026-10-01T12:00:00Z';
  const T0_MS = Date.parse(T0);
  /** SYNTHEX_NOW at T0 + seconds (whole seconds, UTC, no fraction). */
  const at = (seconds: number): string =>
    new Date(T0_MS + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const BLOCKING_TEXT = 'Verdict run started; ending the turn.';

  function leaseLoop(over: LoopState = {}): string {
    return writeLoop({ iteration: 3, last_gate_iteration: -1, last_updated: T0, runId: 'np-1-i3', ...over });
  }
  const readState = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

  it('exits 0 with no output and leaves the state file byte-identical when runId is fresh (+60 s)', () => {
    const path = leaseLoop();
    const before = readFileSync(path);
    const t = writeTranscript({ text: BLOCKING_TEXT });
    const { stdout, blocked } = runGate({ transcript: t, env: { SYNTHEX_NOW: at(60) } });
    expect(stdout).toBe('');
    expect(blocked).toBe(false);
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it('blocks once runId is stale (+901 s), removes runId, and stamps last_updated from SYNTHEX_NOW', () => {
    const path = leaseLoop();
    const t = writeTranscript({ text: BLOCKING_TEXT });
    const now = at(901);
    const { stdout, blocked } = runGate({ transcript: t, env: { SYNTHEX_NOW: now } });
    expect(blocked).toBe(true);
    expect(JSON.parse(stdout).decision).toBe('block');
    const s = readState(path);
    expect('runId' in s).toBe(false);
    expect(s.last_updated).toBe(now);
    expect(s.consecutive_stop_blocks).toBe(1);
    expect(s.last_gate_iteration).toBe(3);
  });

  it('899 s is fresh and 900 s is stale at the default threshold', () => {
    const path = leaseLoop();
    const t = writeTranscript({ text: BLOCKING_TEXT });
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(899) } }).blocked).toBe(false);
    expect(readState(path).runId).toBe('np-1-i3');
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(900) } }).blocked).toBe(true);
    expect('runId' in readState(path)).toBe(false);
  });

  it('honors SYNTHEX_LOOP_RUN_STALE (60: +61 s blocks, +59 s is fresh)', () => {
    const path = leaseLoop();
    const t = writeTranscript({ text: BLOCKING_TEXT });
    const env = { SYNTHEX_LOOP_RUN_STALE: '60' };
    expect(runGate({ transcript: t, env: { ...env, SYNTHEX_NOW: at(59) } }).blocked).toBe(false);
    expect(readState(path).runId).toBe('np-1-i3');
    expect(runGate({ transcript: t, env: { ...env, SYNTHEX_NOW: at(61) } }).blocked).toBe(true);
    expect('runId' in readState(path)).toBe(false);
  });

  it('a non-integer SYNTHEX_LOOP_RUN_STALE falls back to 900', () => {
    const t = writeTranscript({ text: BLOCKING_TEXT });
    for (const stale of ['abc', '1.5', '-60', '']) {
      const path = leaseLoop();
      const env = { SYNTHEX_LOOP_RUN_STALE: stale };
      expect(runGate({ transcript: t, env: { ...env, SYNTHEX_NOW: at(120) } }).blocked, stale).toBe(false);
      expect(runGate({ transcript: t, env: { ...env, SYNTHEX_NOW: at(899) } }).blocked, stale).toBe(false);
      expect(readState(path).runId, stale).toBe('np-1-i3');
      expect(runGate({ transcript: t, env: { ...env, SYNTHEX_NOW: at(900) } }).blocked, stale).toBe(true);
      expect('runId' in readState(path), stale).toBe(false);
    }
  });

  it('treats a missing, unparseable or fractional-second last_updated as stale', () => {
    const t = writeTranscript({ text: BLOCKING_TEXT });
    const variants: Array<[string, string | undefined]> = [
      ['missing', undefined],
      ['unparseable', 'not-a-timestamp'],
      ['fractional', '2026-10-01T12:00:00.500Z'],
    ];
    for (const [label, lu] of variants) {
      const path = leaseLoop({ last_updated: lu });
      if (lu === undefined) expect('last_updated' in readState(path), label).toBe(false);
      expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(1) } }).blocked, label).toBe(true);
      expect('runId' in readState(path), label).toBe(false);
    }
  });

  it('treats last_updated more than 300 s in the future as stale and up to 300 s as fresh', () => {
    const t = writeTranscript({ text: BLOCKING_TEXT });
    let path = leaseLoop();
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(-300) } }).blocked).toBe(false);
    expect(readState(path).runId).toBe('np-1-i3');
    path = leaseLoop();
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(-301) } }).blocked).toBe(true);
    expect('runId' in readState(path)).toBe(false);
  });

  it("ignores a runId on another session's loop", () => {
    const other = writeLoop({
      loop_id: 'np-other',
      session_id: 'OTHER-SESSION',
      iteration: 3,
      last_updated: T0,
      runId: 'np-other-i3',
    });
    const otherBefore = readFileSync(other);
    const t = writeTranscript({ text: BLOCKING_TEXT });
    // No loop for this session: allowed, and the other session's lease is untouched.
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(5000) } }).blocked).toBe(false);
    expect(readFileSync(other).equals(otherBefore)).toBe(true);
    // This session's own lease-free loop still blocks; the other file stays untouched.
    writeLoop({ iteration: 3, last_gate_iteration: -1, last_updated: T0 });
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(60) } }).blocked).toBe(true);
    expect(readFileSync(other).equals(otherBefore)).toBe(true);
  });

  it('a stale runId plus an emitted promise clears runId and still allows the stop', () => {
    const path = leaseLoop();
    const t = writeTranscript({ text: 'All tasks done.\n<promise>ALLDONE</promise>' });
    expect(runGate({ transcript: t, env: { SYNTHEX_NOW: at(901) } }).blocked).toBe(false);
    const s = readState(path);
    expect('runId' in s).toBe(false);
    expect(s.last_updated).toBe(T0);
  });

  it('a fresh runId allows the stop even when the transcript is unreadable', () => {
    const missing = join(projectDir, 'no-such-transcript.jsonl');
    const path = leaseLoop();
    const before = readFileSync(path);
    expect(runGate({ transcript: missing, env: { SYNTHEX_NOW: at(60) } }).stdout).toBe('');
    expect(readFileSync(path).equals(before)).toBe(true);
    // Contrast: a stale lease is cleared BEFORE the transcript read (skip 5a precedes skip 6).
    expect(runGate({ transcript: missing, env: { SYNTHEX_NOW: at(901) } }).stdout).toBe('');
    expect('runId' in readState(path)).toBe(false);
  });
});

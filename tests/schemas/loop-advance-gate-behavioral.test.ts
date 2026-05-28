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
}): { stdout: string; blocked: boolean } {
  const payload = JSON.stringify({
    session_id: opts.sessionId ?? SESSION,
    cwd: projectDir,
    transcript_path: opts.transcript,
    stop_hook_active: opts.stopHookActive ?? false,
  });
  const stdout = execFileSync('bash', [GATE], { input: payload, encoding: 'utf-8' }).trim();
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

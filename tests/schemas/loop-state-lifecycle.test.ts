/**
 * Layer 2: Behavioral fixtures for the native-looping state-file lifecycle.
 *
 * Tasks 34, 35, 36, 37 of native-looping plan (Phase 6 Milestone 6.2).
 * Tests the reference implementation at tests/helpers/loop-state-lifecycle.ts
 * which mirrors the spec exactly. Since the looping commands are pure
 * markdown instructions (no executable script), the helper IS the testable
 * surface — any agent following the markdown must satisfy these invariants.
 *
 * Sub-fixtures (Task 34): create, increment, complete, cancel, max-iter,
 * crash-recover. Plus Task 35 concurrent-sessions, Task 36 resume-flow,
 * Task 37 timing budget.
 *
 * Pattern: dynamic temp dirs + vitest (matches upgrade-nudge-hook-
 * behavioral.test.ts precedent from upgrade-onboarding Phase 5.2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createState,
  readState,
  incrementIteration,
  completeLoop,
  cancelLoop,
  markMaxIterations,
  resumeState,
  iterationBoundary,
} from '../helpers/loop-state-lifecycle';

describe('native-looping state-file lifecycle — Layer 2 behavioral fixtures', () => {
  let loopsDir: string;

  beforeEach(() => {
    loopsDir = mkdtempSync(join(tmpdir(), 'nl-loops-'));
  });

  afterEach(() => {
    rmSync(loopsDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────
  // Task 34: state-file lifecycle sub-fixtures
  // ──────────────────────────────────────────────────────────

  describe('Sub-fixture: create', () => {
    it('writes a fresh state file with iteration=0 and status=running', () => {
      const state = createState(loopsDir, {
        loop_id: 'loop-test1',
        session_id: 'sess-abc',
        command: '/synthex:loop',
        args: '--prompt foo --completion-promise DONE',
        prompt_file: null,
        completion_promise: 'DONE',
      });

      expect(state.iteration).toBe(0);
      expect(state.status).toBe('running');
      expect(state.exited_at).toBeNull();
      expect(state.exit_reason).toBeNull();

      const onDisk = readState(loopsDir, 'loop-test1');
      expect(onDisk).toEqual(state);
    });

    it('defaults max_iterations to 20 and isolation to shared-context', () => {
      const state = createState(loopsDir, {
        loop_id: 'loop-test2',
        session_id: null,
        command: '/synthex:loop',
        args: '--prompt bar',
        prompt_file: null,
        completion_promise: 'OK',
      });
      expect(state.max_iterations).toBe(20);
      expect(state.isolation).toBe('shared-context');
    });

    it('honors explicit max_iterations and isolation overrides', () => {
      const state = createState(loopsDir, {
        loop_id: 'loop-test3',
        session_id: 'x',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
        max_iterations: 50,
        isolation: 'subagent',
      });
      expect(state.max_iterations).toBe(50);
      expect(state.isolation).toBe('subagent');
    });
  });

  describe('Sub-fixture: increment (D-NL13 durability boundary)', () => {
    it('increments iteration counter and updates last_updated', () => {
      const { last_updated: t0 } = createState(loopsDir, {
        loop_id: 'inc1',
        session_id: 's',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
        now: () => '2026-05-14T10:00:00Z',
      });
      const after = incrementIteration(loopsDir, 'inc1', () => '2026-05-14T10:05:00Z');
      expect(after.iteration).toBe(1);
      expect(after.last_updated).toBe('2026-05-14T10:05:00Z');
      expect(after.last_updated).not.toBe(t0);
    });

    it('persists incremented counter atomically (read-after-write)', () => {
      createState(loopsDir, {
        loop_id: 'inc2',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      for (let i = 1; i <= 5; i++) {
        const after = incrementIteration(loopsDir, 'inc2');
        expect(after.iteration).toBe(i);
        const reread = readState(loopsDir, 'inc2');
        expect(reread!.iteration).toBe(i);
      }
    });

    it('refuses to increment a terminal-status loop', () => {
      createState(loopsDir, {
        loop_id: 'inc3',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      cancelLoop(loopsDir, 'inc3');
      expect(() => incrementIteration(loopsDir, 'inc3')).toThrow(/cancelled.*cannot increment/);
    });
  });

  describe('Sub-fixture: complete (FR-NL23)', () => {
    it('transitions status to completed with exit_reason verbatim', () => {
      createState(loopsDir, {
        loop_id: 'cmp1',
        session_id: 's',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      incrementIteration(loopsDir, 'cmp1');
      const result = completeLoop(loopsDir, 'cmp1', () => '2026-05-14T11:00:00Z');
      expect(result.status).toBe('completed');
      expect(result.exit_reason).toBe('completion-promise-emitted');
      expect(result.exited_at).toBe('2026-05-14T11:00:00Z');
    });
  });

  describe('Sub-fixture: cancel (FR-NL22)', () => {
    it('transitions running → cancelled with FR-NL22 exit_reason', () => {
      createState(loopsDir, {
        loop_id: 'cnl1',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      const result = cancelLoop(loopsDir, 'cnl1', () => '2026-05-14T12:00:00Z');
      expect(result.status).toBe('cancelled');
      expect(result.exit_reason).toBe('Cancelled by /synthex:cancel-loop');
      expect(result.exited_at).toBe('2026-05-14T12:00:00Z');
    });

    it('idempotent: cancelling a cancelled loop is a no-op (FR-NL29)', () => {
      createState(loopsDir, {
        loop_id: 'cnl2',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      const first = cancelLoop(loopsDir, 'cnl2', () => '2026-05-14T12:00:00Z');
      const second = cancelLoop(loopsDir, 'cnl2', () => '2026-05-14T12:05:00Z');
      // No-op: exited_at unchanged from first cancel.
      expect(second.exited_at).toBe(first.exited_at);
      expect(second.status).toBe('cancelled');
    });

    it('idempotent: cancelling a completed loop is a no-op', () => {
      createState(loopsDir, {
        loop_id: 'cnl3',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      completeLoop(loopsDir, 'cnl3');
      const result = cancelLoop(loopsDir, 'cnl3');
      expect(result.status).toBe('completed'); // unchanged
    });
  });

  describe('Sub-fixture: max-iter (FR-NL21)', () => {
    it('marks status max-iterations-reached with exit_reason naming the cap', () => {
      createState(loopsDir, {
        loop_id: 'mxi1',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
        max_iterations: 3,
      });
      for (let i = 0; i < 3; i++) incrementIteration(loopsDir, 'mxi1');
      const final = markMaxIterations(loopsDir, 'mxi1');
      expect(final.status).toBe('max-iterations-reached');
      expect(final.exit_reason).toContain('max_iterations=3');
    });

    it('iterationBoundary returns exit when iteration >= max_iterations', () => {
      createState(loopsDir, {
        loop_id: 'mxi2',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
        max_iterations: 2,
      });
      // Increment twice — iteration now == max.
      incrementIteration(loopsDir, 'mxi2');
      incrementIteration(loopsDir, 'mxi2');

      const result = iterationBoundary(loopsDir, 'mxi2');
      expect(result.action).toBe('exit');
      if (result.action === 'exit') {
        expect(result.reason).toBe('max-iterations');
      }
    });
  });

  describe('Sub-fixture: crash-recover (E1)', () => {
    it('resume picks up at iteration+1 (one iteration of work may be lost per D-NL13)', () => {
      // Simulate: loop ran 5 iterations, then crashed mid-iteration 6.
      // FR-NL14 step 3 increments BEFORE work, so state shows iteration=6 even
      // though iteration 6's work didn't complete. Resume starts at iteration=7 (next boundary).
      createState(loopsDir, {
        loop_id: 'crash1',
        session_id: 'old-session',
        command: '/synthex:loop',
        args: '--prompt foo',
        prompt_file: null,
        completion_promise: 'OK',
      });
      for (let i = 0; i < 6; i++) incrementIteration(loopsDir, 'crash1');
      // Simulate crash — state file is at iteration=6, status=running, no exited_at.
      const crashed = readState(loopsDir, 'crash1')!;
      expect(crashed.iteration).toBe(6);
      expect(crashed.status).toBe('running');
      expect(crashed.exited_at).toBeNull();

      // Resume should succeed (state is running).
      const resumed = resumeState(loopsDir, 'crash1');
      expect(resumed.iteration).toBe(6);
      // Next increment brings it to 7 — one iteration of work lost.
      const next = incrementIteration(loopsDir, 'crash1');
      expect(next.iteration).toBe(7);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Task 35: concurrent-sessions (NFR-NL2, E2)
  // ──────────────────────────────────────────────────────────

  describe('Concurrent sessions (NFR-NL2)', () => {
    it('two loops with different loop-ids do not collide on writes', () => {
      const a = createState(loopsDir, {
        loop_id: 'session-a',
        session_id: 'sess-1',
        command: '/synthex:loop',
        args: '--prompt A',
        prompt_file: null,
        completion_promise: 'A_DONE',
      });
      const b = createState(loopsDir, {
        loop_id: 'session-b',
        session_id: 'sess-2',
        command: '/synthex:next-priority',
        args: '@docs/plans/main.md',
        prompt_file: null,
        completion_promise: 'B_DONE',
      });
      expect(a.loop_id).not.toBe(b.loop_id);

      // Mutate both independently.
      for (let i = 0; i < 3; i++) incrementIteration(loopsDir, 'session-a');
      for (let i = 0; i < 7; i++) incrementIteration(loopsDir, 'session-b');

      // Counters diverge.
      const aFinal = readState(loopsDir, 'session-a');
      const bFinal = readState(loopsDir, 'session-b');
      expect(aFinal!.iteration).toBe(3);
      expect(bFinal!.iteration).toBe(7);
      // Other fields uncorrupted.
      expect(aFinal!.completion_promise).toBe('A_DONE');
      expect(bFinal!.completion_promise).toBe('B_DONE');
    });

    it('cancelling one loop does not affect the other', () => {
      createState(loopsDir, {
        loop_id: 'isolation-a',
        session_id: 'sa',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      createState(loopsDir, {
        loop_id: 'isolation-b',
        session_id: 'sb',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      cancelLoop(loopsDir, 'isolation-a');
      const a = readState(loopsDir, 'isolation-a')!;
      const b = readState(loopsDir, 'isolation-b')!;
      expect(a.status).toBe('cancelled');
      expect(b.status).toBe('running');
    });
  });

  // ──────────────────────────────────────────────────────────
  // Task 36: resume-flow
  // ──────────────────────────────────────────────────────────

  describe('Resume flow (FR-NL26, FR-NL27, FR-NL40)', () => {
    it('resume-by-id: resumes a running loop', () => {
      createState(loopsDir, {
        loop_id: 'rsm1',
        session_id: 'orig-session',
        command: '/synthex:loop',
        args: '--prompt foo',
        prompt_file: null,
        completion_promise: 'OK',
      });
      for (let i = 0; i < 4; i++) incrementIteration(loopsDir, 'rsm1');

      const resumed = resumeState(loopsDir, 'rsm1');
      expect(resumed.iteration).toBe(4);
      expect(resumed.status).toBe('running');
      // Persisted args are re-used (no new args needed).
      expect(resumed.args).toBe('--prompt foo');
    });

    it('resume-last: picks the loop matching session_id when multiple running', () => {
      // Simulate two running loops; current session matches one of them.
      createState(loopsDir, {
        loop_id: 'rsm-last-a',
        session_id: 'other-session',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      createState(loopsDir, {
        loop_id: 'rsm-last-b',
        session_id: 'current-session',
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });

      // Apply the FR-NL27 selection rule: prefer session_id match.
      const running = readdirSync(loopsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => readState(loopsDir, f.replace(/\.json$/, ''))!)
        .filter((s) => s.status === 'running');

      const sessionMatch = running.find((s) => s.session_id === 'current-session');
      expect(sessionMatch).toBeDefined();
      expect(sessionMatch!.loop_id).toBe('rsm-last-b');
    });

    it('resume-rejects-terminal-status: refuses to resume a completed loop', () => {
      createState(loopsDir, {
        loop_id: 'rsm2',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      completeLoop(loopsDir, 'rsm2');
      expect(() => resumeState(loopsDir, 'rsm2')).toThrow(/completed.*Cannot resume/);
    });

    it('FR-NL40: refuses --resume for unknown loop-id', () => {
      expect(() => resumeState(loopsDir, 'never-existed')).toThrow(/No loop found/);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Task 37: timing budget (NFR-NL1)
  // ──────────────────────────────────────────────────────────

  describe('Timing budget (NFR-NL1)', () => {
    it('state-file read + increment + write p95 ≤ 75 ms over 30 iterations', () => {
      createState(loopsDir, {
        loop_id: 'timing',
        session_id: null,
        command: '/synthex:loop',
        args: '',
        prompt_file: null,
        completion_promise: 'OK',
      });
      const samples: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = process.hrtime.bigint();
        incrementIteration(loopsDir, 'timing');
        const end = process.hrtime.bigint();
        samples.push(Number(end - start) / 1_000_000);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(30 * 0.95)];
      // NFR-NL1 target is 200ms for the FULL iteration boundary (incl. marker print);
      // the state-file operations alone are bounded much tighter.
      // We use 75ms as the test bound to account for CI overhead.
      expect(p95).toBeLessThan(75);
    });
  });
});

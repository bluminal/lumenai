/**
 * Layer 1: Schema-validator tests for .synthex/loops/<loop-id>.json
 * (native-looping plan Task 2, validates FR-NL8 / FR-NL9 / FR-NL11).
 */

import { describe, it, expect } from 'vitest';
import { validateLoopStateFile } from './loop-state-file';

const VALID_RUNNING_STATE = {
  schema_version: 1,
  loop_id: 'next-priority-3f2a',
  session_id: 'abc123',
  command: '/synthex:next-priority',
  args: '@docs/plans/main.md 3',
  prompt_file: null,
  completion_promise: 'ALLDONE',
  max_iterations: 20,
  iteration: 5,
  isolation: 'shared-context' as const,
  status: 'running' as const,
  started_at: '2026-05-13T18:22:04Z',
  last_updated: '2026-05-13T18:48:11Z',
  exited_at: null,
  exit_reason: null,
};

const VALID_COMPLETED_STATE = {
  ...VALID_RUNNING_STATE,
  status: 'completed' as const,
  exited_at: '2026-05-13T19:00:00Z',
  exit_reason: 'completion-promise-emitted',
};

describe('validateLoopStateFile — FR-NL8 schema', () => {
  describe('valid states', () => {
    it('accepts a complete running state', () => {
      const r = validateLoopStateFile(VALID_RUNNING_STATE);
      expect(r.valid).toBe(true);
    });

    it('accepts a complete terminal state (completed)', () => {
      const r = validateLoopStateFile(VALID_COMPLETED_STATE);
      expect(r.valid).toBe(true);
    });

    it('accepts subagent isolation', () => {
      const r = validateLoopStateFile({
        ...VALID_RUNNING_STATE,
        isolation: 'subagent',
      });
      expect(r.valid).toBe(true);
    });

    it('accepts null session_id', () => {
      const r = validateLoopStateFile({
        ...VALID_RUNNING_STATE,
        session_id: null,
      });
      expect(r.valid).toBe(true);
    });

    it('accepts generic-loop with prompt_file populated', () => {
      const r = validateLoopStateFile({
        ...VALID_RUNNING_STATE,
        command: '/synthex:loop',
        loop_id: 'loop-3f2a',
        prompt_file: 'my-prompt.md',
      });
      expect(r.valid).toBe(true);
    });
  });

  describe('non-object inputs', () => {
    it('rejects null', () => {
      const r = validateLoopStateFile(null);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors[0]).toMatch(/must be a JSON object/);
    });

    it('rejects array', () => {
      const r = validateLoopStateFile([]);
      expect(r.valid).toBe(false);
    });

    it('rejects string', () => {
      const r = validateLoopStateFile('not an object');
      expect(r.valid).toBe(false);
    });
  });

  describe('missing required fields', () => {
    const required = [
      'schema_version',
      'loop_id',
      'session_id',
      'command',
      'args',
      'prompt_file',
      'completion_promise',
      'max_iterations',
      'iteration',
      'isolation',
      'status',
      'started_at',
      'last_updated',
      'exited_at',
      'exit_reason',
    ] as const;

    required.forEach((field) => {
      it(`rejects state missing "${field}"`, () => {
        const partial = { ...VALID_RUNNING_STATE };
        delete (partial as any)[field];
        const r = validateLoopStateFile(partial);
        expect(r.valid).toBe(false);
        if (!r.valid) {
          expect(r.errors.some((e) => e.includes(field))).toBe(true);
        }
      });
    });
  });

  describe('schema_version', () => {
    it('rejects schema_version !== 1', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, schema_version: 2 });
      expect(r.valid).toBe(false);
    });

    it('rejects non-integer schema_version', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, schema_version: '1' });
      expect(r.valid).toBe(false);
    });
  });

  describe('loop_id pattern', () => {
    it('accepts canonical pattern', () => {
      expect(validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'next-priority-3f2a' }).valid).toBe(true);
      expect(validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'my-loop-name' }).valid).toBe(true);
      expect(validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'a' }).valid).toBe(true);
    });

    it('rejects uppercase', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'NextPriority' });
      expect(r.valid).toBe(false);
    });

    it('rejects leading hyphen', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: '-foo' });
      expect(r.valid).toBe(false);
    });

    it('rejects underscore', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'my_loop' });
      expect(r.valid).toBe(false);
    });

    it('rejects > 64 chars', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'a'.repeat(65) });
      expect(r.valid).toBe(false);
    });

    it('accepts exactly 64 chars', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, loop_id: 'a'.repeat(64) });
      expect(r.valid).toBe(true);
    });
  });

  describe('status enum', () => {
    it('rejects unknown status', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, status: 'paused' });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.toLowerCase().includes('status'))).toBe(true);
    });

    it('accepts all five known statuses with correct exited_at/exit_reason', () => {
      const cases = [
        { status: 'running', exited_at: null, exit_reason: null },
        { status: 'completed', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'done' },
        { status: 'cancelled', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'user cancelled' },
        {
          status: 'max-iterations-reached',
          exited_at: '2026-05-13T19:00:00Z',
          exit_reason: 'Reached max_iterations=20',
        },
        { status: 'crashed', exited_at: '2026-05-13T19:00:00Z', exit_reason: 'crashed mid-iteration' },
      ];
      for (const c of cases) {
        const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, ...c });
        expect(r.valid, `status "${c.status}" should be valid`).toBe(true);
      }
    });
  });

  describe('isolation enum', () => {
    it('rejects unknown isolation', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, isolation: 'process' });
      expect(r.valid).toBe(false);
    });
  });

  describe('max_iterations bounds', () => {
    it('rejects 0', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, max_iterations: 0 });
      expect(r.valid).toBe(false);
    });

    it('rejects > 200', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, max_iterations: 201 });
      expect(r.valid).toBe(false);
    });

    it('accepts 200 (ceiling)', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, max_iterations: 200 });
      expect(r.valid).toBe(true);
    });

    it('rejects float', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, max_iterations: 20.5 });
      expect(r.valid).toBe(false);
    });
  });

  describe('iteration bounds', () => {
    it('rejects negative', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, iteration: -1 });
      expect(r.valid).toBe(false);
    });

    it('accepts 0', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, iteration: 0 });
      expect(r.valid).toBe(true);
    });
  });

  describe('ISO 8601 timestamps', () => {
    it('rejects non-ISO started_at', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, started_at: '2026-05-13 18:22:04' });
      expect(r.valid).toBe(false);
    });

    it('accepts fractional seconds', () => {
      const r = validateLoopStateFile({
        ...VALID_RUNNING_STATE,
        started_at: '2026-05-13T18:22:04.123Z',
      });
      expect(r.valid).toBe(true);
    });
  });

  describe('terminal-status consistency (cross-field)', () => {
    it('rejects status=completed with exited_at=null', () => {
      const r = validateLoopStateFile({
        ...VALID_COMPLETED_STATE,
        exited_at: null,
      });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => /exited_at/.test(e))).toBe(true);
    });

    it('rejects status=completed with exit_reason=null', () => {
      const r = validateLoopStateFile({
        ...VALID_COMPLETED_STATE,
        exit_reason: null,
      });
      expect(r.valid).toBe(false);
    });

    it('rejects status=running with exited_at set', () => {
      const r = validateLoopStateFile({
        ...VALID_RUNNING_STATE,
        exited_at: '2026-05-13T19:00:00Z',
      });
      expect(r.valid).toBe(false);
    });
  });

  describe('command path', () => {
    it('rejects command without leading slash', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, command: 'synthex:next-priority' });
      expect(r.valid).toBe(false);
    });
  });

  describe('completion_promise', () => {
    it('rejects empty string', () => {
      const r = validateLoopStateFile({ ...VALID_RUNNING_STATE, completion_promise: '' });
      expect(r.valid).toBe(false);
    });
  });
});

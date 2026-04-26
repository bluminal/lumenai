/**
 * Layer 1: Schema validation tests for the stop-review-team command output.
 *
 * Tests the validateStopReviewTeamOutput validator against inline sample objects.
 */

import { describe, it, expect } from 'vitest';
import {
  validateStopReviewTeamOutput,
  STOP_RESULT_VALUES,
} from './stop-review-team-output';

// ── Inline samples ────────────────────────────────────────────────

const STOPPED_CLEANLY: Record<string, unknown> = {
  pool_name: 'review-pool-a',
  result: 'stopped_cleanly',
  message: 'Pool drained and removed cleanly.',
};

const CANCELLED: Record<string, unknown> = {
  pool_name: 'review-pool-b',
  result: 'cancelled',
};

const VALID_SINGLE_POOL = {
  pools: [STOPPED_CLEANLY],
  pre_prompt_table_shown: false,
};

// ── [T1] Single pool stopped cleanly ─────────────────────────────

describe('[T1] Single pool stopped cleanly', () => {
  it('accepts a single pool with result: stopped_cleanly and a message', () => {
    const result = validateStopReviewTeamOutput(VALID_SINGLE_POOL);
    expect(result.valid, result.errors.join('; ')).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── [T2] All STOP_RESULT_VALUES accepted ─────────────────────────

describe('[T2] All STOP_RESULT_VALUES accepted', () => {
  for (const resultValue of STOP_RESULT_VALUES) {
    it(`accepts result: "${resultValue}"`, () => {
      const result = validateStopReviewTeamOutput({
        pools: [{ pool_name: 'pool-x', result: resultValue }],
        pre_prompt_table_shown: false,
      });
      expect(result.valid, result.errors.join('; ')).toBe(true);
    });
  }

  it('STOP_RESULT_VALUES contains all five expected values', () => {
    expect(STOP_RESULT_VALUES).toEqual([
      'stopped_cleanly',
      'force_stopped',
      'cleanup_needed',
      'not_found',
      'cancelled',
    ]);
  });
});

// ── [T3] result: "cancelled" with no message ─────────────────────

describe('[T3] Cancelled with no message (message is optional)', () => {
  it('accepts result: cancelled with no message field', () => {
    const result = validateStopReviewTeamOutput({
      pools: [CANCELLED],
      pre_prompt_table_shown: true,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('accepts result: stopped_cleanly with no message field', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: 'pool-z', result: 'stopped_cleanly' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T4] Invalid result value ─────────────────────────────────────

describe('[T4] Invalid result value', () => {
  it('rejects result: "unknown_value"', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: 'pool-x', result: 'unknown_value' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('result'))).toBe(true);
  });

  it('rejects result: "removed" (cleanup agent value, not stop-team value)', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: 'pool-x', result: 'removed' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
  });
});

// ── [T5] Missing pre_prompt_table_shown ──────────────────────────

describe('[T5] Missing pre_prompt_table_shown', () => {
  it('rejects output missing pre_prompt_table_shown', () => {
    const result = validateStopReviewTeamOutput({ pools: [STOPPED_CLEANLY] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pre_prompt_table_shown'))).toBe(true);
  });

  it('rejects pre_prompt_table_shown as non-boolean', () => {
    const result = validateStopReviewTeamOutput({
      pools: [STOPPED_CLEANLY],
      pre_prompt_table_shown: 'yes',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pre_prompt_table_shown'))).toBe(true);
  });
});

// ── [T6] pools as non-array ───────────────────────────────────────

describe('[T6] pools field must be an array', () => {
  it('rejects pools as an object', () => {
    const result = validateStopReviewTeamOutput({
      pools: { pool_name: 'pool-x', result: 'stopped_cleanly' },
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pools'))).toBe(true);
  });

  it('rejects pools as null', () => {
    const result = validateStopReviewTeamOutput({
      pools: null,
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing pools field', () => {
    const result = validateStopReviewTeamOutput({ pre_prompt_table_shown: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pools'))).toBe(true);
  });
});

// ── [T7] Empty pools array (cancel/abort path) ───────────────────

describe('[T7] Empty pools array is valid', () => {
  it('accepts empty pools array (cancel/abort path)', () => {
    const result = validateStopReviewTeamOutput({
      pools: [],
      pre_prompt_table_shown: true,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T8] Multi-pool --all output with mixed results ───────────────

describe('[T8] Multi-pool --all output with mixed results', () => {
  it('accepts multiple pools with different result values', () => {
    const result = validateStopReviewTeamOutput({
      pools: [
        { pool_name: 'pool-a', result: 'stopped_cleanly', message: 'Clean shutdown.' },
        { pool_name: 'pool-b', result: 'force_stopped', message: 'Timeout exceeded.' },
        { pool_name: 'pool-c', result: 'cleanup_needed' },
        { pool_name: 'pool-d', result: 'not_found' },
      ],
      pre_prompt_table_shown: false,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T9] StopPoolResult field constraints ─────────────────────────

describe('[T9] StopPoolResult field constraints', () => {
  it('rejects missing pool_name in a pool result', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ result: 'stopped_cleanly' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pool_name'))).toBe(true);
  });

  it('rejects empty pool_name', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: '', result: 'stopped_cleanly' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pool_name'))).toBe(true);
  });

  it('rejects missing result field', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: 'pool-x' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('result'))).toBe(true);
  });

  it('rejects non-string message field', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: 'pool-x', result: 'stopped_cleanly', message: 42 }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('message'))).toBe(true);
  });

  it('accepts empty string message (no constraint on message content)', () => {
    const result = validateStopReviewTeamOutput({
      pools: [{ pool_name: 'pool-x', result: 'stopped_cleanly', message: '' }],
      pre_prompt_table_shown: false,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T10] Non-object top-level input ─────────────────────────────

describe('[T10] Non-object top-level input rejected', () => {
  it('rejects null', () => {
    const result = validateStopReviewTeamOutput(null);
    expect(result.valid).toBe(false);
  });

  it('rejects a string', () => {
    const result = validateStopReviewTeamOutput('done');
    expect(result.valid).toBe(false);
  });
});

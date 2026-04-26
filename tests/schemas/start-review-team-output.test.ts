/**
 * Layer 1: Schema validation tests for the start-review-team command output.
 *
 * Tests the validateStartReviewTeamOutput validator against inline sample objects.
 */

import { describe, it, expect } from 'vitest';
import {
  validateStartReviewTeamOutput,
  SPAWN_POOL_STATE_VALUES,
} from './start-review-team-output';

// ── Inline sample ─────────────────────────────────────────────────

const VALID_SAMPLE = {
  pool_name: 'my-review-pool',
  reviewers: ['code-reviewer', 'security-reviewer'],
  multi_model: true,
  ttl_minutes: 60,
  submission_timeout_seconds: 30,
  storage_path: '~/.claude/teams/standing/my-review-pool',
  pool_state: 'idle',
  cost_warning_shown: true,
};

// ── [T1] Valid sample passes ──────────────────────────────────────

describe('[T1] Valid full sample', () => {
  it('passes for a complete valid spawn confirmation', () => {
    const result = validateStartReviewTeamOutput(VALID_SAMPLE);
    expect(result.valid, result.errors.join('; ')).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with cost_warning_shown: false', () => {
    const result = validateStartReviewTeamOutput({
      ...VALID_SAMPLE,
      cost_warning_shown: false,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('passes with multi_model: false', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, multi_model: false });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T2] Non-object input ─────────────────────────────────────────

describe('[T2] Non-object input rejected', () => {
  it('rejects null', () => {
    const result = validateStartReviewTeamOutput(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a string', () => {
    const result = validateStartReviewTeamOutput('not-an-object');
    expect(result.valid).toBe(false);
  });

  it('rejects an array', () => {
    const result = validateStartReviewTeamOutput([VALID_SAMPLE]);
    expect(result.valid).toBe(false);
  });
});

// ── [T3] Missing required fields ─────────────────────────────────

describe('[T3] Missing required fields', () => {
  const REQUIRED_FIELDS = [
    'pool_name',
    'reviewers',
    'ttl_minutes',
    'submission_timeout_seconds',
    'pool_state',
    'cost_warning_shown',
  ] as const;

  for (const field of REQUIRED_FIELDS) {
    it(`rejects missing field: "${field}"`, () => {
      const sample = { ...VALID_SAMPLE };
      delete (sample as Record<string, unknown>)[field];
      const result = validateStartReviewTeamOutput(sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(field))).toBe(true);
    });
  }

  it('rejects missing field: "multi_model"', () => {
    const sample = { ...VALID_SAMPLE };
    delete (sample as Record<string, unknown>)['multi_model'];
    const result = validateStartReviewTeamOutput(sample);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('multi_model'))).toBe(true);
  });

  it('rejects missing field: "storage_path"', () => {
    const sample = { ...VALID_SAMPLE };
    delete (sample as Record<string, unknown>)['storage_path'];
    const result = validateStartReviewTeamOutput(sample);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('storage_path'))).toBe(true);
  });
});

// ── [T4] reviewers: non-empty constraint ─────────────────────────

describe('[T4] reviewers array constraints', () => {
  it('rejects reviewers as empty array', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, reviewers: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reviewers'))).toBe(true);
  });

  it('rejects reviewers containing non-strings', () => {
    const result = validateStartReviewTeamOutput({
      ...VALID_SAMPLE,
      reviewers: ['code-reviewer', 42],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts reviewers with a single element', () => {
    const result = validateStartReviewTeamOutput({
      ...VALID_SAMPLE,
      reviewers: ['code-reviewer'],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T5] ttl_minutes: positive integer constraint ─────────────────

describe('[T5] ttl_minutes constraints', () => {
  it('rejects ttl_minutes of 0', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, ttl_minutes: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ttl_minutes'))).toBe(true);
  });

  it('rejects negative ttl_minutes', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, ttl_minutes: -5 });
    expect(result.valid).toBe(false);
  });

  it('rejects fractional ttl_minutes', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, ttl_minutes: 1.5 });
    expect(result.valid).toBe(false);
  });

  it('accepts ttl_minutes of 1', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, ttl_minutes: 1 });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T6] submission_timeout_seconds: positive integer ─────────────

describe('[T6] submission_timeout_seconds constraints', () => {
  it('rejects submission_timeout_seconds of 0', () => {
    const result = validateStartReviewTeamOutput({
      ...VALID_SAMPLE,
      submission_timeout_seconds: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('submission_timeout_seconds'))).toBe(true);
  });

  it('rejects negative submission_timeout_seconds', () => {
    const result = validateStartReviewTeamOutput({
      ...VALID_SAMPLE,
      submission_timeout_seconds: -10,
    });
    expect(result.valid).toBe(false);
  });
});

// ── [T7] pool_state: must be "idle" at spawn ──────────────────────

describe('[T7] pool_state at spawn', () => {
  it('rejects pool_state "active" at spawn', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, pool_state: 'active' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pool_state'))).toBe(true);
  });

  it('rejects pool_state "draining" at spawn', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, pool_state: 'draining' });
    expect(result.valid).toBe(false);
  });

  it('rejects pool_state "stopping" at spawn', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, pool_state: 'stopping' });
    expect(result.valid).toBe(false);
  });

  it('rejects unknown pool_state value', () => {
    const result = validateStartReviewTeamOutput({
      ...VALID_SAMPLE,
      pool_state: 'unknown_state',
    });
    expect(result.valid).toBe(false);
  });

  it('SPAWN_POOL_STATE_VALUES contains only "idle"', () => {
    expect(SPAWN_POOL_STATE_VALUES).toEqual(['idle']);
  });
});

// ── [T8] pool_name and storage_path: non-empty string ────────────

describe('[T8] Non-empty string fields', () => {
  it('rejects empty pool_name', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, pool_name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pool_name'))).toBe(true);
  });

  it('rejects empty storage_path', () => {
    const result = validateStartReviewTeamOutput({ ...VALID_SAMPLE, storage_path: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('storage_path'))).toBe(true);
  });
});

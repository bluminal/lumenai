/**
 * Layer 1: Schema validation tests for standing-pool index.json.
 *
 * Validates index.json against the normative schema in
 * docs/specs/multi-model-teams/pool-lifecycle.md §2 (FR-MMT9b).
 *
 * Covers:
 * - FR-MMT9b normative example (passing sample, verbatim from PRD lines 416-427)
 * - Rejection: entries missing pool_state or last_active_at (denormalized fields)
 * - Rejection: invalid pool_state enum value
 * - Rejection: pools array shape errors
 * - All four pool_state values covered in inline samples
 */

import { describe, it, expect } from 'vitest';
import {
  validatePoolIndex,
  validatePoolIndexJSON,
  validatePoolIndexEntry,
  POOL_STATE_VALUES,
} from './standing-pool-index.js';

// ── FR-MMT9b normative example (PRD lines 416-427, verbatim) ────

const NORMATIVE_INDEX = {
  pools: [
    {
      name: 'review-pool',
      pool_state: 'idle',
      last_active_at: '2026-04-25T14:32:11Z',
      metadata_dir: '~/.claude/teams/standing/review-pool',
    },
  ],
};

// ── Base valid entry used across rejection tests ─────────────────

const BASE_ENTRY = {
  name: 'review-pool',
  pool_state: 'idle',
  last_active_at: '2026-04-25T14:32:11Z',
  metadata_dir: '~/.claude/teams/standing/review-pool',
};

// ── Tests ────────────────────────────────────────────────────────

describe('Standing Pool index.json — Schema Validator', () => {

  // ── Passing sample: FR-MMT9b normative example ──────────────────

  describe('FR-MMT9b normative example (PRD verbatim)', () => {
    it('passes validation for the normative index', () => {
      const result = validatePoolIndex(NORMATIVE_INDEX);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts an empty pools array (no active pools)', () => {
      const result = validatePoolIndex({ pools: [] });
      expect(result.valid).toBe(true);
    });

    it('accepts multiple entries in pools array', () => {
      const multiPool = {
        pools: [
          BASE_ENTRY,
          {
            name: 'bg-pool',
            pool_state: 'draining',
            last_active_at: '2026-04-25T14:00:00Z',
            metadata_dir: '~/.claude/teams/standing/bg-pool',
          },
        ],
      };
      const result = validatePoolIndex(multiPool);
      expect(result.valid).toBe(true);
    });
  });

  // ── All four pool_state values covered ──────────────────────────

  describe('All four pool_state enum values', () => {
    it('accepts pool_state: "idle"', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: 'idle' }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: "active"', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: 'active' }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: "draining"', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: 'draining' }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: "stopping"', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: 'stopping' }],
      });
      expect(result.valid).toBe(true);
    });

    it('POOL_STATE_VALUES covers all four required values', () => {
      expect(POOL_STATE_VALUES).toContain('idle');
      expect(POOL_STATE_VALUES).toContain('active');
      expect(POOL_STATE_VALUES).toContain('draining');
      expect(POOL_STATE_VALUES).toContain('stopping');
    });
  });

  // ── Rejection: pools array shape errors ─────────────────────────

  describe('Top-level structure validation', () => {
    it('rejects null input', () => {
      const result = validatePoolIndex(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects array input (missing pools wrapper)', () => {
      const result = validatePoolIndex([BASE_ENTRY]);
      expect(result.valid).toBe(false);
    });

    it('rejects object without pools key', () => {
      const result = validatePoolIndex({ data: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"pools"'))).toBe(true);
    });

    it('rejects pools that is not an array', () => {
      const result = validatePoolIndex({ pools: BASE_ENTRY });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('array'))).toBe(true);
    });

    it('rejects pools that is a string', () => {
      const result = validatePoolIndex({ pools: 'review-pool' });
      expect(result.valid).toBe(false);
    });

    it('rejects pools array containing non-object entries', () => {
      const result = validatePoolIndex({ pools: ['review-pool'] });
      expect(result.valid).toBe(false);
    });

    it('rejects pools array with null entries', () => {
      const result = validatePoolIndex({ pools: [null] });
      expect(result.valid).toBe(false);
    });
  });

  // ── Rejection: entries missing denormalized fields ───────────────

  describe('Required field validation on pool entries (FR-MMT9b denormalization)', () => {
    const REQUIRED_ENTRY_FIELDS = ['name', 'pool_state', 'last_active_at', 'metadata_dir'];

    for (const field of REQUIRED_ENTRY_FIELDS) {
      it(`rejects entry missing required field: "${field}"`, () => {
        const entry = { ...BASE_ENTRY };
        delete (entry as Record<string, unknown>)[field];
        const result = validatePoolIndex({ pools: [entry] });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes(field))).toBe(true);
      });
    }

    it('specifically rejects entries missing pool_state (FR-MMT9b denormalized field)', () => {
      const { pool_state, ...withoutState } = BASE_ENTRY;
      const result = validatePoolIndex({ pools: [withoutState] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_state'))).toBe(true);
    });

    it('specifically rejects entries missing last_active_at (FR-MMT9b denormalized field)', () => {
      const { last_active_at, ...withoutTimestamp } = BASE_ENTRY;
      const result = validatePoolIndex({ pools: [withoutTimestamp] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('last_active_at'))).toBe(true);
    });
  });

  // ── Rejection: invalid pool_state ───────────────────────────────

  describe('pool_state enum validation on entries', () => {
    it('rejects unknown pool_state: "running"', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: 'running' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_state'))).toBe(true);
    });

    it('rejects pool_state: "stopped" (use "stopping")', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: 'stopped' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects pool_state: "" (empty string)', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: '' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects pool_state: null', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, pool_state: null }],
      });
      expect(result.valid).toBe(false);
    });
  });

  // ── Rejection: non-UTC last_active_at ───────────────────────────

  describe('last_active_at UTC validation on entries', () => {
    it('rejects timestamp with offset instead of Z', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, last_active_at: '2026-04-25T14:32:11+00:00' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects date-only string', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, last_active_at: '2026-04-25' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects numeric timestamp', () => {
      const result = validatePoolIndex({
        pools: [{ ...BASE_ENTRY, last_active_at: 1745592731 }],
      });
      expect(result.valid).toBe(false);
    });
  });

  // ── Multi-entry validation ───────────────────────────────────────

  describe('Multi-entry validation', () => {
    it('reports errors for all invalid entries, not just the first', () => {
      const index = {
        pools: [
          { ...BASE_ENTRY, pool_state: 'zombie' },
          { ...BASE_ENTRY, name: 'pool-2', pool_state: 'ghost' },
        ],
      };
      const result = validatePoolIndex(index);
      expect(result.valid).toBe(false);
      // Should have errors for both entries
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('passes when all entries are valid', () => {
      const index = {
        pools: [
          { ...BASE_ENTRY, pool_state: 'idle' },
          { ...BASE_ENTRY, name: 'pool-2', pool_state: 'active' },
          { ...BASE_ENTRY, name: 'pool-3', pool_state: 'draining' },
          { ...BASE_ENTRY, name: 'pool-4', pool_state: 'stopping' },
        ],
      };
      const result = validatePoolIndex(index);
      expect(result.valid).toBe(true);
    });
  });

  // ── Entry-level validator ────────────────────────────────────────

  describe('validatePoolIndexEntry (entry-level validation)', () => {
    it('passes for a valid entry', () => {
      const result = validatePoolIndexEntry(BASE_ENTRY, 0);
      expect(result.valid).toBe(true);
      expect(result.entryIndex).toBe(0);
    });

    it('includes entry index in error messages', () => {
      const bad = { ...BASE_ENTRY, pool_state: 'invalid' };
      const result = validatePoolIndexEntry(bad, 3);
      expect(result.entryIndex).toBe(3);
      expect(result.errors.some(e => e.includes('[3]'))).toBe(true);
    });
  });

  // ── JSON string wrapper ──────────────────────────────────────────

  describe('validatePoolIndexJSON (JSON string input)', () => {
    it('accepts valid JSON string of normative index', () => {
      const result = validatePoolIndexJSON(JSON.stringify(NORMATIVE_INDEX));
      expect(result.valid).toBe(true);
    });

    it('rejects malformed JSON', () => {
      const result = validatePoolIndexJSON('{not valid json}');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/parse/i);
    });

    it('rejects JSON with invalid pool_state in entry', () => {
      const bad = { pools: [{ ...BASE_ENTRY, pool_state: 'unknown' }] };
      const result = validatePoolIndexJSON(JSON.stringify(bad));
      expect(result.valid).toBe(false);
    });
  });
});

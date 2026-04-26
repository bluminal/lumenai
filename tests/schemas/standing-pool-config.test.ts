/**
 * Layer 1: Schema validation tests for standing-pool config.json.
 *
 * Validates per-pool config.json against the normative schema in
 * docs/specs/multi-model-teams/pool-lifecycle.md §1 (FR-MMT7).
 *
 * Covers:
 * - FR-MMT7 normative example (passing sample, verbatim from PRD lines 323-335)
 * - Rejection: missing required fields
 * - Rejection: invalid pool_state enum
 * - Rejection: non-UTC timestamp (last_active_at without 'Z' suffix)
 * - Rejection: negative ttl_minutes
 */

import { describe, it, expect } from 'vitest';
import {
  validatePoolConfig,
  validatePoolConfigJSON,
  POOL_STATE_VALUES,
  isISO8601UTC,
} from './standing-pool-config.js';

// ── FR-MMT7 normative example (PRD lines 323-335, verbatim) ─────

const NORMATIVE_CONFIG = {
  name: 'review-pool',
  standing: true,
  reviewers: ['code-reviewer', 'security-reviewer'],
  multi_model: false,
  ttl_minutes: 60,
  spawn_timestamp: '2026-04-25T14:32:11Z',
  host_pid: 12345,
  host_session_id: '<opaque>',
  last_active_at: '2026-04-25T14:32:11Z',
  pool_state: 'idle',
};

// ── Tests ────────────────────────────────────────────────────────

describe('Standing Pool config.json — Schema Validator', () => {

  // ── ISO-8601 UTC helper tests ───────────────────────────────────

  describe('isISO8601UTC helper', () => {
    it('accepts valid UTC timestamps ending in Z', () => {
      expect(isISO8601UTC('2026-04-25T14:32:11Z')).toBe(true);
      expect(isISO8601UTC('2026-01-01T00:00:00Z')).toBe(true);
      expect(isISO8601UTC('2026-12-31T23:59:59.999Z')).toBe(true);
    });

    it('rejects timestamps with timezone offset instead of Z', () => {
      expect(isISO8601UTC('2026-04-25T14:32:11+00:00')).toBe(false);
      expect(isISO8601UTC('2026-04-25T14:32:11-05:00')).toBe(false);
    });

    it('rejects date-only strings', () => {
      expect(isISO8601UTC('2026-04-25')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isISO8601UTC(null)).toBe(false);
      expect(isISO8601UTC(12345)).toBe(false);
      expect(isISO8601UTC(undefined)).toBe(false);
    });

    it('rejects invalid date strings', () => {
      expect(isISO8601UTC('not-a-date')).toBe(false);
      expect(isISO8601UTC('2026-13-01T00:00:00Z')).toBe(false); // month 13
    });
  });

  // ── pool_state enum coverage ────────────────────────────────────

  describe('POOL_STATE_VALUES enum', () => {
    it('contains all four valid pool_state values', () => {
      expect(POOL_STATE_VALUES).toContain('idle');
      expect(POOL_STATE_VALUES).toContain('active');
      expect(POOL_STATE_VALUES).toContain('draining');
      expect(POOL_STATE_VALUES).toContain('stopping');
      expect(POOL_STATE_VALUES).toHaveLength(4);
    });
  });

  // ── Passing sample: FR-MMT7 normative example ───────────────────

  describe('FR-MMT7 normative example (PRD verbatim)', () => {
    it('passes validation for the normative config', () => {
      const result = validatePoolConfig(NORMATIVE_CONFIG);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: idle', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'idle' });
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: active', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'active' });
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: draining', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'draining' });
      expect(result.valid).toBe(true);
    });

    it('accepts pool_state: stopping', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'stopping' });
      expect(result.valid).toBe(true);
    });

    it('accepts ttl_minutes: 0 (no TTL)', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: 0 });
      expect(result.valid).toBe(true);
    });
  });

  // ── Rejection: missing required fields ──────────────────────────

  describe('Required field validation', () => {
    const REQUIRED_FIELDS = [
      'name',
      'standing',
      'reviewers',
      'multi_model',
      'ttl_minutes',
      'spawn_timestamp',
      'host_pid',
      'host_session_id',
      'last_active_at',
      'pool_state',
    ];

    for (const field of REQUIRED_FIELDS) {
      it(`rejects config missing required field: "${field}"`, () => {
        const withoutField = { ...NORMATIVE_CONFIG };
        delete (withoutField as Record<string, unknown>)[field];
        const result = validatePoolConfig(withoutField);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes(field))).toBe(true);
      });
    }

    it('rejects null input', () => {
      const result = validatePoolConfig(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects array input', () => {
      const result = validatePoolConfig([]);
      expect(result.valid).toBe(false);
    });

    it('rejects string input', () => {
      const result = validatePoolConfig('{"name": "test"}');
      expect(result.valid).toBe(false);
    });
  });

  // ── Rejection: invalid pool_state enum ──────────────────────────

  describe('pool_state enum validation', () => {
    it('rejects unknown pool_state value: "running"', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'running' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_state'))).toBe(true);
    });

    it('rejects pool_state: "stopped" (use "stopping" instead)', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'stopped' });
      expect(result.valid).toBe(false);
    });

    it('rejects pool_state: "paused"', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: 'paused' });
      expect(result.valid).toBe(false);
    });

    it('rejects pool_state: "" (empty string)', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: '' });
      expect(result.valid).toBe(false);
    });

    it('rejects pool_state: null', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, pool_state: null });
      expect(result.valid).toBe(false);
    });
  });

  // ── Rejection: non-UTC timestamp ────────────────────────────────

  describe('last_active_at ISO-8601 UTC validation', () => {
    it('rejects timestamp with offset instead of Z', () => {
      const result = validatePoolConfig({
        ...NORMATIVE_CONFIG,
        last_active_at: '2026-04-25T14:32:11+00:00',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('last_active_at'))).toBe(true);
    });

    it('rejects date-only string', () => {
      const result = validatePoolConfig({
        ...NORMATIVE_CONFIG,
        last_active_at: '2026-04-25',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects numeric timestamp (Unix epoch)', () => {
      const result = validatePoolConfig({
        ...NORMATIVE_CONFIG,
        last_active_at: 1745592731,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects null timestamp', () => {
      const result = validatePoolConfig({
        ...NORMATIVE_CONFIG,
        last_active_at: null,
      });
      expect(result.valid).toBe(false);
    });

    it('accepts fractional seconds UTC', () => {
      const result = validatePoolConfig({
        ...NORMATIVE_CONFIG,
        last_active_at: '2026-04-25T14:32:11.123Z',
      });
      expect(result.valid).toBe(true);
    });
  });

  // ── Rejection: negative ttl_minutes ─────────────────────────────

  describe('ttl_minutes non-negative integer validation', () => {
    it('rejects negative ttl_minutes', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ttl_minutes'))).toBe(true);
    });

    it('rejects fractional ttl_minutes', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: 1.5 });
      expect(result.valid).toBe(false);
    });

    it('rejects string ttl_minutes', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: '60' });
      expect(result.valid).toBe(false);
    });

    it('accepts ttl_minutes: 0 (no TTL guard)', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: 0 });
      expect(result.valid).toBe(true);
    });

    it('accepts ttl_minutes: 60', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: 60 });
      expect(result.valid).toBe(true);
    });

    it('accepts ttl_minutes: 1440 (24 hours)', () => {
      const result = validatePoolConfig({ ...NORMATIVE_CONFIG, ttl_minutes: 1440 });
      expect(result.valid).toBe(true);
    });
  });

  // ── JSON string wrapper ──────────────────────────────────────────

  describe('validatePoolConfigJSON (JSON string input)', () => {
    it('accepts valid JSON string of normative config', () => {
      const result = validatePoolConfigJSON(JSON.stringify(NORMATIVE_CONFIG));
      expect(result.valid).toBe(true);
    });

    it('rejects malformed JSON', () => {
      const result = validatePoolConfigJSON('{not valid json}');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/parse/i);
    });

    it('rejects JSON with invalid pool_state', () => {
      const bad = { ...NORMATIVE_CONFIG, pool_state: 'zombie' };
      const result = validatePoolConfigJSON(JSON.stringify(bad));
      expect(result.valid).toBe(false);
    });
  });
});

/**
 * Layer 1: Schema validation tests for standing-pool-cleanup agent OUTPUT shapes
 * and inline-discovery output shape (Tasks 54/57).
 *
 * Distinct from standing-pool-cleanup.test.ts (which validates the agent .md file
 * structure/frontmatter). This file validates the runtime output objects.
 *
 * Validator source: tests/schemas/standing-pool-cleanup.ts
 * Normative schemas:
 *   - Cleanup result: plugins/synthex-plus/agents/standing-pool-cleanup.md §Output Contract
 *   - Inline-discovery output: FR-MMT30 (docs/reqs/multi-model-teams.md §4.9)
 *
 * Acceptance criteria covered:
 *   [T1] Validator rejects cleanup outputs missing required fields
 *   [T2] Validator validates inline-discovery output: conditional fields per routing_decision
 *   [T3] Validator accepts would_have_routed block when present
 *   [T4] Output enum covers all FR-MMT30 routing_decision values (seven total)
 */

import { describe, it, expect } from 'vitest';
import {
  validateCleanupResult,
  validateInlineDiscoveryOutput,
  CLEANUP_RESULT_VALUES,
  ROUTING_DECISION_VALUES,
  KNOWN_REASONS_NOT_USED,
} from './standing-pool-cleanup.js';

// ═════════════════════════════════════════════════════════════════
// SECTION 1: validateCleanupResult
// ═════════════════════════════════════════════════════════════════

describe('validateCleanupResult', () => {

  // ── Enum coverage sanity ──────────────────────────────────────

  describe('CLEANUP_RESULT_VALUES enum', () => {
    it('contains all three valid result values', () => {
      expect(CLEANUP_RESULT_VALUES).toContain('removed');
      expect(CLEANUP_RESULT_VALUES).toContain('not-found');
      expect(CLEANUP_RESULT_VALUES).toContain('lock-failed');
      expect(CLEANUP_RESULT_VALUES).toHaveLength(3);
    });
  });

  // ── Accepting well-formed shapes ──────────────────────────────

  describe('accepts well-formed result shapes', () => {
    it('accepts a well-formed "removed" result with both boolean flags', () => {
      const result = validateCleanupResult({
        result: 'removed',
        pool_name: 'review-pool',
        removed_index_entry: true,
        removed_metadata_dir: false,
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts removed_metadata_dir: true when dir was present', () => {
      const result = validateCleanupResult({
        result: 'removed',
        pool_name: 'perf-pool',
        removed_index_entry: true,
        removed_metadata_dir: true,
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a well-formed "not-found" result with only result and pool_name', () => {
      const result = validateCleanupResult({
        result: 'not-found',
        pool_name: 'review-pool',
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts a well-formed "lock-failed" result with non-empty error string', () => {
      const result = validateCleanupResult({
        result: 'lock-failed',
        pool_name: 'review-pool',
        error: 'Could not acquire .index.lock after 5 retries; another process holds the lock',
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // ── [T1] Rejects missing required fields ─────────────────────

  describe('[T1] rejects missing required fields', () => {
    it('rejects object missing "result" field', () => {
      const result = validateCleanupResult({
        pool_name: 'review-pool',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('result'))).toBe(true);
    });

    it('rejects unknown "result" enum value (e.g., "weird")', () => {
      const result = validateCleanupResult({
        result: 'weird',
        pool_name: 'review-pool',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('result'))).toBe(true);
    });

    it('rejects missing "pool_name"', () => {
      const result = validateCleanupResult({
        result: 'removed',
        removed_index_entry: true,
        removed_metadata_dir: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
    });

    it('rejects empty-string "pool_name"', () => {
      const result = validateCleanupResult({
        result: 'not-found',
        pool_name: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
    });

    it('rejects "removed" result missing "removed_index_entry"', () => {
      const result = validateCleanupResult({
        result: 'removed',
        pool_name: 'review-pool',
        removed_metadata_dir: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('removed_index_entry'))).toBe(true);
    });

    it('rejects "removed" result missing "removed_metadata_dir"', () => {
      const result = validateCleanupResult({
        result: 'removed',
        pool_name: 'review-pool',
        removed_index_entry: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('removed_metadata_dir'))).toBe(true);
    });

    it('rejects "lock-failed" result missing "error"', () => {
      const result = validateCleanupResult({
        result: 'lock-failed',
        pool_name: 'review-pool',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error'))).toBe(true);
    });

    it('rejects "lock-failed" result with empty-string "error"', () => {
      const result = validateCleanupResult({
        result: 'lock-failed',
        pool_name: 'review-pool',
        error: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error'))).toBe(true);
    });
  });

  // ── Strict shape: "not-found" rejects extra keys ──────────────

  describe('"not-found" strict shape validation', () => {
    it('rejects "not-found" result with extra unknown keys', () => {
      const result = validateCleanupResult({
        result: 'not-found',
        pool_name: 'review-pool',
        removed_index_entry: false, // extra key not allowed for not-found
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('removed_index_entry'))).toBe(true);
    });

    it('rejects "not-found" result with "error" field (strict shape)', () => {
      const result = validateCleanupResult({
        result: 'not-found',
        pool_name: 'review-pool',
        error: 'unexpected',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error'))).toBe(true);
    });
  });

  // ── Non-object inputs ─────────────────────────────────────────

  describe('rejects non-object inputs', () => {
    it('rejects null input', () => {
      const result = validateCleanupResult(null);
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateCleanupResult([]);
      expect(result.valid).toBe(false);
    });

    it('rejects string input', () => {
      const result = validateCleanupResult('{"result":"removed"}');
      expect(result.valid).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 2: validateInlineDiscoveryOutput
// ═════════════════════════════════════════════════════════════════

describe('validateInlineDiscoveryOutput', () => {

  // ── [T4] Enum covers all seven FR-MMT30 routing_decision values ─

  describe('[T4] ROUTING_DECISION_VALUES enum', () => {
    it('contains all seven FR-MMT30 routing_decision values', () => {
      expect(ROUTING_DECISION_VALUES).toContain('routed-to-pool');
      expect(ROUTING_DECISION_VALUES).toContain('fell-back-no-pool');
      expect(ROUTING_DECISION_VALUES).toContain('fell-back-roster-mismatch');
      expect(ROUTING_DECISION_VALUES).toContain('fell-back-pool-draining');
      expect(ROUTING_DECISION_VALUES).toContain('fell-back-pool-stale');
      expect(ROUTING_DECISION_VALUES).toContain('fell-back-timeout');
      expect(ROUTING_DECISION_VALUES).toContain('skipped-routing-mode-explicit');
      expect(ROUTING_DECISION_VALUES).toHaveLength(7);
    });
  });

  // ── KNOWN_REASONS_NOT_USED documentation export ───────────────

  describe('KNOWN_REASONS_NOT_USED documentation export', () => {
    it('exports the three known reason_not_used values for documentation', () => {
      expect(KNOWN_REASONS_NOT_USED).toContain('roster_mismatch');
      expect(KNOWN_REASONS_NOT_USED).toContain('draining');
      expect(KNOWN_REASONS_NOT_USED).toContain('stale');
    });
  });

  // ── [T4] Accepts each of the seven routing_decision values ────
  // One accept test per value, parameterized via it.each

  describe('[T4] accepts each valid routing_decision value in minimal-required form', () => {
    // Minimal-required samples for each decision value
    it.each([
      [
        'routed-to-pool',
        {
          routing_decision: 'routed-to-pool',
          pool_name: 'review-pool',
          multi_model: true,
          match_rationale: 'pool roster {code-reviewer,security-reviewer} ⊇ required {code-reviewer}',
        },
      ],
      [
        'fell-back-no-pool',
        { routing_decision: 'fell-back-no-pool' },
      ],
      [
        'fell-back-roster-mismatch',
        { routing_decision: 'fell-back-roster-mismatch' },
      ],
      [
        'fell-back-pool-draining',
        { routing_decision: 'fell-back-pool-draining', pool_name: 'review-pool' },
      ],
      [
        'fell-back-pool-stale',
        { routing_decision: 'fell-back-pool-stale', pool_name: 'review-pool' },
      ],
      [
        'fell-back-timeout',
        { routing_decision: 'fell-back-timeout' },
      ],
      [
        'skipped-routing-mode-explicit',
        { routing_decision: 'skipped-routing-mode-explicit' },
      ],
    ])('accepts routing_decision: "%s" in minimal form', (_label, input) => {
      const result = validateInlineDiscoveryOutput(input);
      expect(
        result.errors,
        `routing_decision "${_label}" failed:\n${result.errors.join('\n')}`
      ).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // ── [T1][T2] Rejects missing routing_decision ─────────────────

  describe('rejects missing or invalid routing_decision', () => {
    it('rejects missing "routing_decision" field', () => {
      const result = validateInlineDiscoveryOutput({
        pool_name: 'review-pool',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('routing_decision'))).toBe(true);
    });

    it('rejects unknown routing_decision value (e.g., "unknown-decision")', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'unknown-decision',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('routing_decision'))).toBe(true);
    });

    it('rejects empty-string routing_decision', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: '',
      });
      expect(result.valid).toBe(false);
    });
  });

  // ── [T2] routed-to-pool: conditional field requirements ────────

  describe('[T2] routed-to-pool — conditional required fields', () => {
    const BASE_ROUTED = {
      routing_decision: 'routed-to-pool',
      pool_name: 'review-pool',
      multi_model: false,
      match_rationale: 'pool roster ⊇ required reviewers',
    };

    it('accepts routed-to-pool when all three required fields are present', () => {
      const result = validateInlineDiscoveryOutput(BASE_ROUTED);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('rejects routed-to-pool missing pool_name', () => {
      const { pool_name: _removed, ...without } = BASE_ROUTED;
      const result = validateInlineDiscoveryOutput(without);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
    });

    it('rejects routed-to-pool missing multi_model', () => {
      const { multi_model: _removed, ...without } = BASE_ROUTED;
      const result = validateInlineDiscoveryOutput(without);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('multi_model'))).toBe(true);
    });

    it('rejects routed-to-pool missing match_rationale', () => {
      const { match_rationale: _removed, ...without } = BASE_ROUTED;
      const result = validateInlineDiscoveryOutput(without);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('match_rationale'))).toBe(true);
    });

    it('accepts routed-to-pool with multi_model: true', () => {
      const result = validateInlineDiscoveryOutput({ ...BASE_ROUTED, multi_model: true });
      expect(result.valid).toBe(true);
    });
  });

  // ── [T2] fell-back-pool-draining: pool_name required ──────────

  describe('[T2] fell-back-pool-draining — pool_name required', () => {
    it('rejects fell-back-pool-draining with missing pool_name', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-pool-draining',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
    });

    it('accepts fell-back-pool-draining with pool_name present', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-pool-draining',
        pool_name: 'review-pool',
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // ── [T2] fell-back-pool-stale: pool_name required ─────────────

  describe('[T2] fell-back-pool-stale — pool_name required', () => {
    it('rejects fell-back-pool-stale with missing pool_name', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-pool-stale',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
    });

    it('accepts fell-back-pool-stale with pool_name present', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-pool-stale',
        pool_name: 'perf-pool',
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // ── [T2] fell-back-no-pool: no optional fields required ───────

  describe('[T2] fell-back-no-pool — no optional fields required', () => {
    it('accepts fell-back-no-pool with no optional fields', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-no-pool',
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // ── [T3] would_have_routed: optional but validated when present ─

  describe('[T3] would_have_routed — optional field validation', () => {
    it('accepts fell-back-roster-mismatch with a well-formed would_have_routed block', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-roster-mismatch',
        would_have_routed: {
          pool_name: 'review-pool',
          reason_not_used: 'roster_mismatch',
        },
      });
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts would_have_routed with forward-compatible custom reason_not_used string', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-pool-stale',
        pool_name: 'review-pool',
        would_have_routed: {
          pool_name: 'review-pool',
          reason_not_used: 'some-future-reason',
        },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects would_have_routed with missing pool_name', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-roster-mismatch',
        would_have_routed: {
          reason_not_used: 'roster_mismatch',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('would_have_routed.pool_name'))).toBe(true);
    });

    it('rejects would_have_routed with missing reason_not_used', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-roster-mismatch',
        would_have_routed: {
          pool_name: 'review-pool',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('would_have_routed.reason_not_used'))).toBe(true);
    });

    it('rejects would_have_routed with empty-string pool_name', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-roster-mismatch',
        would_have_routed: {
          pool_name: '',
          reason_not_used: 'stale',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('would_have_routed.pool_name'))).toBe(true);
    });

    it('rejects would_have_routed with empty-string reason_not_used', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-pool-draining',
        pool_name: 'review-pool',
        would_have_routed: {
          pool_name: 'review-pool',
          reason_not_used: '',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('would_have_routed.reason_not_used'))).toBe(true);
    });

    it('accepts absence of would_have_routed field (it is optional)', () => {
      const result = validateInlineDiscoveryOutput({
        routing_decision: 'fell-back-no-pool',
      });
      expect(result.valid).toBe(true);
    });
  });

  // ── Non-object inputs ─────────────────────────────────────────

  describe('rejects non-object inputs', () => {
    it('rejects null input', () => {
      const result = validateInlineDiscoveryOutput(null);
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateInlineDiscoveryOutput([]);
      expect(result.valid).toBe(false);
    });

    it('rejects string input', () => {
      const result = validateInlineDiscoveryOutput('{"routing_decision":"routed-to-pool"}');
      expect(result.valid).toBe(false);
    });
  });
});

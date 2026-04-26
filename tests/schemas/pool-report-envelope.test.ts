/**
 * Layer 1: Schema validation tests for the FR-MMT16a report envelope shape.
 *
 * The report envelope is written by the Pool Lead to the report-to path and
 * polled by the submitting command. This validator is the source-of-truth schema
 * for that shape (Task 37).
 *
 * Validator source: tests/schemas/pool-report-envelope.ts
 * Normative schema: docs/specs/multi-model-teams/routing.md §3.1 (shape) and §3.2 (semantics)
 *
 * Acceptance criteria covered:
 *   [T1] Validator catches envelopes missing required fields per status
 *   [T2] Both status: success and status: failed samples validated
 *   [T3] metadata.task_uuids is non-empty array
 */

import { describe, it, expect } from 'vitest';
import {
  validateReportEnvelope,
  ENVELOPE_STATUS_VALUES,
  KNOWN_ERROR_CODES,
} from './pool-report-envelope.js';

// ── Inline sample envelopes (prove [T2]) ──────────────────────────

/**
 * [T2] Canonical success envelope sample.
 * status: "success" → report is non-null string, error is null.
 */
const SUCCESS_ENVELOPE = {
  status: 'success',
  report: '## Code Review\n\n**PASS** — No critical findings.\n\n### Summary\n\nAll checks passed.',
  error: null,
  metadata: {
    pool_name: 'review-pool',
    multi_model: true,
    task_uuids: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    completed_at: '2026-04-25T14:30:00Z',
  },
};

/**
 * [T2] Canonical failed envelope sample.
 * status: "failed" → report is null, error is non-null object.
 */
const FAILED_ENVELOPE = {
  status: 'failed',
  report: null,
  error: {
    code: 'pool_lead_crashed',
    message: 'Pool Lead process exited unexpectedly after 3 tasks completed (PID 12345).',
  },
  metadata: {
    pool_name: 'review-pool',
    multi_model: false,
    task_uuids: [
      '11111111-2222-3333-4444-555555555555',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ],
    completed_at: '2026-04-25T15:00:00Z',
  },
};

// ═════════════════════════════════════════════════════════════════
// SECTION 0: Enum / constant exports
// ═════════════════════════════════════════════════════════════════

describe('ENVELOPE_STATUS_VALUES enum', () => {
  it('contains exactly the two valid status values', () => {
    expect(ENVELOPE_STATUS_VALUES).toContain('success');
    expect(ENVELOPE_STATUS_VALUES).toContain('failed');
    expect(ENVELOPE_STATUS_VALUES).toHaveLength(2);
  });
});

describe('KNOWN_ERROR_CODES export', () => {
  it('contains the three codes named in routing.md §3.1', () => {
    expect(KNOWN_ERROR_CODES).toContain('pool_lead_crashed');
    expect(KNOWN_ERROR_CODES).toContain('orchestrator_failed');
    expect(KNOWN_ERROR_CODES).toContain('drain_timed_out');
  });

  it('is a readonly array (non-exhaustive — forward-compatible)', () => {
    // The list is explicitly non-exhaustive: the validator accepts any non-empty string.
    expect(Array.isArray(KNOWN_ERROR_CODES)).toBe(true);
    expect(KNOWN_ERROR_CODES.length).toBeGreaterThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 1: [T2] Valid success envelope
// ═════════════════════════════════════════════════════════════════

describe('[T2] valid status: success envelope', () => {
  it('accepts the canonical success sample', () => {
    const result = validateReportEnvelope(SUCCESS_ENVELOPE);
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts success envelope with empty-string report (empty review body is valid)', () => {
    const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, report: '' });
    // Empty string is a string — validator allows it (non-null is the constraint)
    expect(result.valid).toBe(true);
  });

  it('accepts success envelope with multi_model: false', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, multi_model: false },
    });
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts success envelope with multiple task_uuids', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: {
        ...SUCCESS_ENVELOPE.metadata,
        task_uuids: [
          'uuid-0001-0000-0000-000000000001',
          'uuid-0001-0000-0000-000000000002',
          'uuid-0001-0000-0000-000000000003',
        ],
      },
    });
    expect(result.valid).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 2: [T2] Valid failed envelope
// ═════════════════════════════════════════════════════════════════

describe('[T2] valid status: failed envelope', () => {
  it('accepts the canonical failed sample', () => {
    const result = validateReportEnvelope(FAILED_ENVELOPE);
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts failed envelope with error.code: "orchestrator_failed"', () => {
    const result = validateReportEnvelope({
      ...FAILED_ENVELOPE,
      error: { code: 'orchestrator_failed', message: 'Orchestrator exited with code 1.' },
    });
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts failed envelope with error.code: "drain_timed_out"', () => {
    const result = validateReportEnvelope({
      ...FAILED_ENVELOPE,
      error: {
        code: 'drain_timed_out',
        message: 'Pool did not finish draining within the configured timeout.',
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts failed envelope with a forward-compatible unknown error.code', () => {
    // KNOWN_ERROR_CODES is non-exhaustive; any non-empty string is valid.
    const result = validateReportEnvelope({
      ...FAILED_ENVELOPE,
      error: { code: 'some_future_error_code', message: 'Details here.' },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts failed envelope with multi_model: true in metadata', () => {
    const result = validateReportEnvelope({
      ...FAILED_ENVELOPE,
      metadata: { ...FAILED_ENVELOPE.metadata, multi_model: true },
    });
    expect(result.valid).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 3: [T1] Missing required top-level fields
// ═════════════════════════════════════════════════════════════════

describe('[T1] rejects envelopes missing required top-level fields', () => {
  it('rejects object missing "status" field', () => {
    const { status: _removed, ...without } = SUCCESS_ENVELOPE;
    const result = validateReportEnvelope(without);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  it('rejects unknown "status" enum value (e.g., "partial")', () => {
    const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, status: 'partial' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  it('rejects empty-string "status"', () => {
    const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, status: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  it('rejects object missing "report" field', () => {
    const { report: _removed, ...without } = SUCCESS_ENVELOPE;
    const result = validateReportEnvelope(without);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"report"'))).toBe(true);
  });

  it('rejects object missing "error" field', () => {
    const { error: _removed, ...without } = SUCCESS_ENVELOPE;
    const result = validateReportEnvelope(without);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"error"'))).toBe(true);
  });

  it('rejects object missing "metadata" field', () => {
    const { metadata: _removed, ...without } = SUCCESS_ENVELOPE;
    const result = validateReportEnvelope(without);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"metadata"'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 4: [T1] Wrong status-conditional fields
// ═════════════════════════════════════════════════════════════════

describe('[T1] rejects envelopes violating status-conditional invariants', () => {

  // ── success path violations ────────────────────────────────────

  describe('status: "success" violations', () => {
    it('rejects success envelope where report is null', () => {
      const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, report: null });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"report"'))).toBe(true);
    });

    it('rejects success envelope where report is a number', () => {
      const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, report: 42 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"report"'))).toBe(true);
    });

    it('rejects success envelope where error is non-null (e.g., an error object)', () => {
      const result = validateReportEnvelope({
        ...SUCCESS_ENVELOPE,
        error: { code: 'pool_lead_crashed', message: 'Should not be here.' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"error"'))).toBe(true);
    });

    it('rejects success envelope where error is a non-null string', () => {
      const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, error: 'oops' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"error"'))).toBe(true);
    });
  });

  // ── failed path violations ─────────────────────────────────────

  describe('status: "failed" violations', () => {
    it('rejects failed envelope where report is non-null (e.g., a string)', () => {
      const result = validateReportEnvelope({
        ...FAILED_ENVELOPE,
        report: 'This should be null.',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"report"'))).toBe(true);
    });

    it('rejects failed envelope where error is null', () => {
      const result = validateReportEnvelope({ ...FAILED_ENVELOPE, error: null });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"error"'))).toBe(true);
    });

    it('rejects failed envelope where error is a string (not an object)', () => {
      const result = validateReportEnvelope({
        ...FAILED_ENVELOPE,
        error: 'pool_lead_crashed: something went wrong',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"error"'))).toBe(true);
    });

    it('rejects failed envelope where error.code is missing', () => {
      const result = validateReportEnvelope({
        ...FAILED_ENVELOPE,
        error: { message: 'No code field.' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error.code'))).toBe(true);
    });

    it('rejects failed envelope where error.code is empty string', () => {
      const result = validateReportEnvelope({
        ...FAILED_ENVELOPE,
        error: { code: '', message: 'Empty code.' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error.code'))).toBe(true);
    });

    it('rejects failed envelope where error.message is missing', () => {
      const result = validateReportEnvelope({
        ...FAILED_ENVELOPE,
        error: { code: 'pool_lead_crashed' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error.message'))).toBe(true);
    });

    it('rejects failed envelope where error.message is empty string', () => {
      const result = validateReportEnvelope({
        ...FAILED_ENVELOPE,
        error: { code: 'pool_lead_crashed', message: '' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('error.message'))).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 5: [T3] metadata validation
// ═════════════════════════════════════════════════════════════════

describe('[T3] metadata validation', () => {

  // ── metadata must be an object ─────────────────────────────────

  it('rejects envelope where metadata is null', () => {
    const result = validateReportEnvelope({ ...SUCCESS_ENVELOPE, metadata: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"metadata"'))).toBe(true);
  });

  it('rejects envelope where metadata is a string', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: '{"pool_name":"review-pool"}',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"metadata"'))).toBe(true);
  });

  // ── metadata.pool_name ─────────────────────────────────────────

  it('rejects missing metadata.pool_name', () => {
    const { pool_name: _removed, ...metaWithout } = SUCCESS_ENVELOPE.metadata;
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: metaWithout,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
  });

  it('rejects empty-string metadata.pool_name', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, pool_name: '' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('pool_name'))).toBe(true);
  });

  // ── metadata.multi_model ───────────────────────────────────────

  it('rejects missing metadata.multi_model', () => {
    const { multi_model: _removed, ...metaWithout } = SUCCESS_ENVELOPE.metadata;
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: metaWithout,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('multi_model'))).toBe(true);
  });

  it('rejects metadata.multi_model as a string "true"', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, multi_model: 'true' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('multi_model'))).toBe(true);
  });

  it('rejects metadata.multi_model as a number', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, multi_model: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('multi_model'))).toBe(true);
  });

  // ── [T3] metadata.task_uuids ──────────────────────────────────

  it('[T3] rejects missing metadata.task_uuids', () => {
    const { task_uuids: _removed, ...metaWithout } = SUCCESS_ENVELOPE.metadata;
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: metaWithout,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('task_uuids'))).toBe(true);
  });

  it('[T3] rejects empty metadata.task_uuids array', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, task_uuids: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('task_uuids'))).toBe(true);
  });

  it('[T3] rejects metadata.task_uuids as a string (not an array)', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, task_uuids: 'uuid-0001' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('task_uuids'))).toBe(true);
  });

  it('[T3] rejects metadata.task_uuids containing non-string elements', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, task_uuids: [42, 'valid-uuid'] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('task_uuids'))).toBe(true);
  });

  it('[T3] accepts metadata.task_uuids with a single UUID string', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: {
        ...SUCCESS_ENVELOPE.metadata,
        task_uuids: ['deadbeef-dead-beef-dead-beefdeadbeef'],
      },
    });
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('[T3] accepts metadata.task_uuids with three UUID strings', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: {
        ...SUCCESS_ENVELOPE.metadata,
        task_uuids: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003',
        ],
      },
    });
    expect(result.valid).toBe(true);
  });

  // ── metadata.completed_at ──────────────────────────────────────

  it('rejects missing metadata.completed_at', () => {
    const { completed_at: _removed, ...metaWithout } = SUCCESS_ENVELOPE.metadata;
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: metaWithout,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('completed_at'))).toBe(true);
  });

  it('rejects empty-string metadata.completed_at', () => {
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, completed_at: '' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('completed_at'))).toBe(true);
  });

  it('accepts any non-empty string for completed_at (string check only, no date parse)', () => {
    // The spec says "non-empty string (ISO-8601 UTC)" — the validator does a
    // string check only, not a date parse. A syntactically-wrong but non-empty
    // string must pass validation (forward-compatibility).
    const result = validateReportEnvelope({
      ...SUCCESS_ENVELOPE,
      metadata: { ...SUCCESS_ENVELOPE.metadata, completed_at: 'not-a-real-date' },
    });
    expect(result.valid).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION 6: Non-object inputs
// ═════════════════════════════════════════════════════════════════

describe('rejects non-object inputs', () => {
  it('rejects null input', () => {
    const result = validateReportEnvelope(null);
    expect(result.valid).toBe(false);
  });

  it('rejects array input', () => {
    const result = validateReportEnvelope([]);
    expect(result.valid).toBe(false);
  });

  it('rejects string input', () => {
    const result = validateReportEnvelope('{"status":"success"}');
    expect(result.valid).toBe(false);
  });

  it('rejects number input', () => {
    const result = validateReportEnvelope(42);
    expect(result.valid).toBe(false);
  });

  it('rejects undefined input', () => {
    const result = validateReportEnvelope(undefined);
    expect(result.valid).toBe(false);
  });
});

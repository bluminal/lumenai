/**
 * Schema validator for the FR-MMT16a report envelope shape.
 *
 * Exports one validator function:
 *
 *   validateReportEnvelope(obj: unknown): { valid: boolean; errors: string[] }
 *
 * The report envelope is written by the Pool Lead (or multi-model orchestrator)
 * to the report-to path, and polled by the submitting command.
 *
 * Normative schema source:
 *   docs/specs/multi-model-teams/routing.md §3.1 (shape) and §3.2 (semantics)
 *
 * No external runtime dependencies — pure TypeScript returning plain objects.
 */

// ── Status enum ───────────────────────────────────────────────────

export const ENVELOPE_STATUS_VALUES = ['success', 'failed'] as const;
export type EnvelopeStatus = typeof ENVELOPE_STATUS_VALUES[number];

// ── Known error codes (non-exhaustive — "..." in routing.md §3.1) ─
//
// The spec lists three named codes; the "..." in the source is
// explicit — additional codes may be added in future implementations
// without changing this validator's acceptance logic (any non-empty
// string is accepted for forward-compatibility).

export const KNOWN_ERROR_CODES: readonly string[] = [
  'pool_lead_crashed',
  'orchestrator_failed',
  'drain_timed_out',
  // NOTE: This list is non-exhaustive per routing.md §3.1.
  // The validator accepts any non-empty string for `error.code`.
];

// ── Shared validation result ──────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Internal helpers ──────────────────────────────────────────────

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── validateReportEnvelope ────────────────────────────────────────

/**
 * Validates a FR-MMT16a report envelope object.
 *
 * Required top-level fields: status, report, error, metadata.
 *
 * Status-conditional invariants (routing.md §3.2):
 *
 *   status: "success"
 *     → report must be a non-null string
 *     → error must be null
 *
 *   status: "failed"
 *     → report must be null
 *     → error must be a non-null object with non-empty-string code and message
 *
 * Metadata invariants:
 *   pool_name     — non-empty string
 *   multi_model   — boolean
 *   task_uuids    — non-empty array of strings
 *   completed_at  — non-empty string (ISO-8601 UTC; string check only, no date parse)
 */
export function validateReportEnvelope(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    errors.push('Report envelope must be a non-null JSON object');
    return { valid: false, errors };
  }

  // ── status: required, must be one of the two enum values ─────────

  if (!('status' in obj)) {
    errors.push('Missing required field: "status"');
    return { valid: false, errors };
  }

  const status = obj['status'];
  if (!ENVELOPE_STATUS_VALUES.includes(status as EnvelopeStatus)) {
    errors.push(
      `Invalid status value: "${status}". ` +
      `Must be one of: ${ENVELOPE_STATUS_VALUES.join(', ')}`
    );
    return { valid: false, errors };
  }

  const envelopeStatus = status as EnvelopeStatus;

  // ── report: required field (must be present at top level) ─────────

  if (!('report' in obj)) {
    errors.push('Missing required field: "report"');
  }

  // ── error: required field (must be present at top level) ──────────

  if (!('error' in obj)) {
    errors.push('Missing required field: "error"');
  }

  // ── metadata: required field (must be present at top level) ───────

  if (!('metadata' in obj)) {
    errors.push('Missing required field: "metadata"');
  }

  // Early return if top-level structure is broken — conditional checks
  // below depend on the fields existing.
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // ── Status-conditional invariants (routing.md §3.2) ───────────────

  if (envelopeStatus === 'success') {
    // report must be a non-null string
    if (obj['report'] === null || obj['report'] === undefined) {
      errors.push(
        'Field "report" must be a non-null string when status is "success"'
      );
    } else if (typeof obj['report'] !== 'string') {
      errors.push(
        `Field "report" must be a string when status is "success", ` +
        `got: "${typeof obj['report']}"`
      );
    }

    // error must be null
    if (obj['error'] !== null) {
      errors.push(
        'Field "error" must be null when status is "success", ' +
        `got: ${JSON.stringify(obj['error'])}`
      );
    }
  }

  if (envelopeStatus === 'failed') {
    // report must be null
    if (obj['report'] !== null) {
      errors.push(
        'Field "report" must be null when status is "failed", ' +
        `got: ${JSON.stringify(obj['report'])}`
      );
    }

    // error must be a non-null object with non-empty-string code and message
    if (obj['error'] === null || obj['error'] === undefined) {
      errors.push(
        'Field "error" must be a non-null object when status is "failed"'
      );
    } else if (!isObject(obj['error'])) {
      errors.push(
        `Field "error" must be a non-null object when status is "failed", ` +
        `got: "${typeof obj['error']}"`
      );
    } else {
      const errorObj = obj['error'];

      // error.code: required, non-empty string
      if (!('code' in errorObj)) {
        errors.push('Missing required field "error.code" when status is "failed"');
      } else if (!isNonEmptyString(errorObj['code'])) {
        errors.push('Field "error.code" must be a non-empty string when status is "failed"');
      }

      // error.message: required, non-empty string
      if (!('message' in errorObj)) {
        errors.push('Missing required field "error.message" when status is "failed"');
      } else if (!isNonEmptyString(errorObj['message'])) {
        errors.push('Field "error.message" must be a non-empty string when status is "failed"');
      }
    }
  }

  // ── metadata validation ────────────────────────────────────────────

  if (!isObject(obj['metadata'])) {
    errors.push(
      `Field "metadata" must be a non-null object, ` +
      `got: "${typeof obj['metadata']}"`
    );
  } else {
    const meta = obj['metadata'];

    // pool_name: non-empty string
    if (!('pool_name' in meta)) {
      errors.push('Missing required field "metadata.pool_name"');
    } else if (!isNonEmptyString(meta['pool_name'])) {
      errors.push('Field "metadata.pool_name" must be a non-empty string');
    }

    // multi_model: boolean
    if (!('multi_model' in meta)) {
      errors.push('Missing required field "metadata.multi_model"');
    } else if (typeof meta['multi_model'] !== 'boolean') {
      errors.push(
        `Field "metadata.multi_model" must be a boolean, ` +
        `got: "${typeof meta['multi_model']}"`
      );
    }

    // task_uuids: non-empty array of strings
    if (!('task_uuids' in meta)) {
      errors.push('Missing required field "metadata.task_uuids"');
    } else if (!Array.isArray(meta['task_uuids'])) {
      errors.push(
        `Field "metadata.task_uuids" must be an array, ` +
        `got: "${typeof meta['task_uuids']}"`
      );
    } else if (meta['task_uuids'].length === 0) {
      errors.push('Field "metadata.task_uuids" must be a non-empty array');
    } else {
      // All elements must be strings
      const nonStrings = (meta['task_uuids'] as unknown[]).filter(
        (v) => typeof v !== 'string'
      );
      if (nonStrings.length > 0) {
        errors.push(
          `Field "metadata.task_uuids" must contain only strings; ` +
          `found ${nonStrings.length} non-string element(s)`
        );
      }
    }

    // completed_at: non-empty string (ISO-8601 UTC, string check only)
    if (!('completed_at' in meta)) {
      errors.push('Missing required field "metadata.completed_at"');
    } else if (!isNonEmptyString(meta['completed_at'])) {
      errors.push('Field "metadata.completed_at" must be a non-empty string');
    }
  }

  return { valid: errors.length === 0, errors };
}

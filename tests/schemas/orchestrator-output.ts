/**
 * Multi-model review orchestrator unified-output validator.
 *
 * Source of truth: orchestrator's contract in docs/specs/multi-model-review/architecture.md
 * + plugins/synthex/agents/multi-model-review-orchestrator.md (Task 19).
 *
 * Validates:
 * - per_reviewer_results: array of { reviewer_id, source_type, family, status, findings_count, error_code?, usage? }
 *   Native and external entries appear in the SAME array; source_type distinguishes them.
 * - findings: array, each entry validated against canonical-finding schema (Task 1).
 * - path_and_reason_header: matches D21 literal regex.
 * - aggregator_resolution: { name, source }
 * - continuation_event: null OR { type, details }
 */

import { validateCanonicalFinding } from './canonical-finding';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const SOURCE_TYPE_VALUES = ['native-team', 'external', 'native-recovery'] as const;
export const STATUS_VALUES = ['success', 'failed'] as const;
export const AGGREGATOR_SOURCE_VALUES = ['configured', 'tier-table', 'host-fallback'] as const;
export const CONTINUATION_TYPE_VALUES = [
  'all-externals-failed',
  'all-natives-failed',
  'cloud-surface-no-clis',
] as const;

// D21 literal regex (verbatim from plan)
export const PATH_AND_REASON_HEADER_REGEX =
  /^Review path: [^()]+\([^)]+; reviewers: \d+ native(?:\s*[+,]\s*\d+ external(?:\s+\w+)?)?\)$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

function isNonNegativeInteger(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function validatePerReviewerEntry(entry: unknown, idx: number, errors: string[]): { source_type?: string } {
  if (!isObject(entry)) {
    errors.push(`per_reviewer_results[${idx}] must be an object`);
    return {};
  }
  if (!isNonEmptyString(entry.reviewer_id)) errors.push(`per_reviewer_results[${idx}].reviewer_id must be a non-empty string`);
  if (!isNonEmptyString(entry.family)) errors.push(`per_reviewer_results[${idx}].family must be a non-empty string`);

  const sourceType = entry.source_type as string;
  if (!SOURCE_TYPE_VALUES.includes(sourceType as typeof SOURCE_TYPE_VALUES[number])) {
    errors.push(
      `per_reviewer_results[${idx}].source_type must be one of: ${SOURCE_TYPE_VALUES.join(', ')} (got: ${entry.source_type})`
    );
  }

  if (!STATUS_VALUES.includes(entry.status as typeof STATUS_VALUES[number])) {
    errors.push(`per_reviewer_results[${idx}].status must be one of: ${STATUS_VALUES.join(', ')}`);
  }

  if (!isNonNegativeInteger(entry.findings_count)) {
    errors.push(`per_reviewer_results[${idx}].findings_count must be a non-negative integer`);
  }

  // error_code can be null (success) or a non-empty string (failed)
  if (entry.status === 'failed' && (entry.error_code == null || !isNonEmptyString(entry.error_code))) {
    errors.push(`per_reviewer_results[${idx}].error_code must be a non-empty string when status is "failed"`);
  }

  return { source_type: sourceType };
}

export function validateOrchestratorOutput(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['Orchestrator output must be a non-null object'] };
  }

  // per_reviewer_results: required, array of entries, native+external in same array
  if (!('per_reviewer_results' in obj)) {
    errors.push('Missing required field "per_reviewer_results"');
  } else if (!Array.isArray(obj.per_reviewer_results)) {
    errors.push('"per_reviewer_results" must be an array');
  } else {
    obj.per_reviewer_results.forEach((entry, i) => validatePerReviewerEntry(entry, i, errors));
  }

  // findings: required, array; each entry validated against canonical-finding schema
  if (!('findings' in obj)) {
    errors.push('Missing required field "findings"');
  } else if (!Array.isArray(obj.findings)) {
    errors.push('"findings" must be an array');
  } else {
    obj.findings.forEach((f, i) => {
      const r = validateCanonicalFinding(f);
      if (!r.valid) {
        for (const err of r.errors) errors.push(`findings[${i}]: ${err}`);
      }
      // Ensure attribution is present (source object) — checked by canonical-finding validator
    });
  }

  // path_and_reason_header: required, matches D21 regex
  if (!('path_and_reason_header' in obj)) {
    errors.push('Missing required field "path_and_reason_header" (D21)');
  } else if (typeof obj.path_and_reason_header !== 'string') {
    errors.push('"path_and_reason_header" must be a string');
  } else if (!PATH_AND_REASON_HEADER_REGEX.test(obj.path_and_reason_header as string)) {
    errors.push(
      `"path_and_reason_header" does not match D21 regex (got: "${obj.path_and_reason_header}")`
    );
  }

  // aggregator_resolution: required object with name + source
  if (!('aggregator_resolution' in obj)) {
    errors.push('Missing required field "aggregator_resolution"');
  } else if (!isObject(obj.aggregator_resolution)) {
    errors.push('"aggregator_resolution" must be an object');
  } else {
    const ar = obj.aggregator_resolution;
    if (!isNonEmptyString(ar.name)) errors.push('"aggregator_resolution.name" must be a non-empty string');
    if (!AGGREGATOR_SOURCE_VALUES.includes(ar.source as typeof AGGREGATOR_SOURCE_VALUES[number])) {
      errors.push(`"aggregator_resolution.source" must be one of: ${AGGREGATOR_SOURCE_VALUES.join(', ')}`);
    }
  }

  // continuation_event: nullable; when present, must have valid type
  if ('continuation_event' in obj && obj.continuation_event !== null && obj.continuation_event !== undefined) {
    if (!isObject(obj.continuation_event)) {
      errors.push('"continuation_event" must be null or an object');
    } else {
      const ce = obj.continuation_event;
      if (!CONTINUATION_TYPE_VALUES.includes(ce.type as typeof CONTINUATION_TYPE_VALUES[number])) {
        errors.push(`"continuation_event.type" must be one of: ${CONTINUATION_TYPE_VALUES.join(', ')}`);
      }
      if (!isNonEmptyString(ce.details)) {
        errors.push('"continuation_event.details" must be a non-empty string when continuation_event is present');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

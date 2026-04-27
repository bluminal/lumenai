/**
 * Adapter envelope validator (shared across all *-review-prompter adapters).
 *
 * Validates the canonical Output envelope per docs/specs/multi-model-review/adapter-contract.md
 * AND validates each entry in findings[] against the canonical-finding schema
 * (plugins/synthex/agents/_shared/canonical-finding-schema.md).
 *
 * Used by Tasks 12, 15, 15a, 18, 18a (per-adapter Layer 1 + Layer 2 tests).
 *
 * Builds on:
 * - tests/schemas/adapter-contract.ts (Task 4) — base envelope shape validator
 * - tests/schemas/canonical-finding.ts (Task 1) — per-finding shape validator
 */

import { validateAdapterEnvelope } from './adapter-contract';
import { validateCanonicalFinding } from './canonical-finding';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the full adapter envelope including all findings[] entries against
 * the canonical-finding schema. Use this for end-to-end adapter output validation.
 */
export function validateFullAdapterEnvelope(obj: unknown): ValidationResult {
  // First: validate the envelope shape (status, error_code, raw_output_path, etc.)
  const envelopeResult = validateAdapterEnvelope(obj);
  const errors = [...envelopeResult.errors];

  // Then: validate each finding entry, even if envelope shape failed (helps surface all errors at once)
  if (
    typeof obj === 'object' &&
    obj !== null &&
    'findings' in (obj as Record<string, unknown>) &&
    Array.isArray((obj as Record<string, unknown>).findings)
  ) {
    const findings = (obj as Record<string, unknown>).findings as unknown[];
    findings.forEach((f, i) => {
      const r = validateCanonicalFinding(f);
      if (!r.valid) {
        for (const err of r.errors) {
          errors.push(`findings[${i}]: ${err}`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// Re-export the underlying validators for callers that need them separately.
export { validateAdapterEnvelope } from './adapter-contract';
export { validateCanonicalFinding } from './canonical-finding';
export { STATUS_VALUES, ERROR_CODE_VALUES } from './adapter-contract';

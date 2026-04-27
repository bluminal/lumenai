/**
 * Adapter contract envelope validator.
 * Source of truth: docs/specs/multi-model-review/adapter-contract.md
 *
 * Validates the input/output envelope contract that every multi-model review
 * adapter (*-review-prompter) must conform to, per FR-MR9 and FR-MR16.
 *
 * Task 11 will build the broader shared adapter-envelope.ts validator on top
 * of this contract-spec validator.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const STATUS_VALUES = ['success', 'failed'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

export const ERROR_CODE_VALUES = [
  'cli_missing',
  'cli_auth_failed',
  'cli_failed',
  'parse_failed',
  'timeout',
  'sandbox_violation',
  'unknown_error',
] as const;
export type ErrorCodeValue = (typeof ERROR_CODE_VALUES)[number];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Validates an adapter output envelope against the contract defined in
 * docs/specs/multi-model-review/adapter-contract.md (FR-MR9, FR-MR16).
 */
export function validateAdapterEnvelope(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    return { valid: false, errors: ['Adapter envelope must be a non-null object'] };
  }

  // status: required, enum
  if (!('status' in obj)) {
    errors.push('Missing required field "status"');
  } else if (!STATUS_VALUES.includes(obj.status as StatusValue)) {
    errors.push(`"status" must be one of: ${STATUS_VALUES.join(', ')}`);
  }

  const status = obj.status;

  // error_code: required and in enum when failed; null when success
  if (status === 'failed') {
    if (!('error_code' in obj) || obj.error_code == null) {
      errors.push('"error_code" is required when status is "failed"');
    } else if (!ERROR_CODE_VALUES.includes(obj.error_code as ErrorCodeValue)) {
      errors.push(`"error_code" must be one of: ${ERROR_CODE_VALUES.join(', ')}`);
    }
  } else if (status === 'success') {
    if ('error_code' in obj && obj.error_code != null) {
      errors.push('"error_code" must be null when status is "success"');
    }
  }

  // findings: required array
  if (!('findings' in obj)) {
    errors.push('Missing required field "findings"');
  } else if (!Array.isArray(obj.findings)) {
    errors.push('"findings" must be an array');
  }

  // usage: object with required sub-fields, or null/absent
  if ('usage' in obj && obj.usage !== null && obj.usage !== undefined) {
    if (!isObject(obj.usage)) {
      errors.push('"usage" must be an object or null');
    } else {
      const u = obj.usage;
      if (!('input_tokens' in u)) {
        errors.push('"usage.input_tokens" required when usage is present');
      }
      if (!('output_tokens' in u)) {
        errors.push('"usage.output_tokens" required when usage is present');
      }
      if (!('model' in u)) {
        errors.push('"usage.model" required when usage is present');
      }
    }
  }

  // raw_output_path: required non-empty string
  if (!('raw_output_path' in obj)) {
    errors.push('Missing required field "raw_output_path"');
  } else if (!isNonEmptyString(obj.raw_output_path)) {
    errors.push('"raw_output_path" must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

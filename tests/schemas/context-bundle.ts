/**
 * Context bundle manifest validator.
 *
 * Source of truth: plugins/synthex/agents/context-bundle-assembler.md (Task 5)
 *
 * The context-bundle-assembler agent returns one of two shapes:
 *
 * 1. Success:
 *    {
 *      status: "success",
 *      manifest: {
 *        artifact: { path, size_bytes, summarized },
 *        conventions: [{ path, size_bytes, summarized }],
 *        touched_files: [{ path, size_bytes, summarized }],
 *        specs: [{ path, size_bytes, summarized }],
 *        total_bytes: number
 *      },
 *      files: [{ path, content }]
 *    }
 *
 * 2. Error (narrow scope required):
 *    {
 *      status: "error",
 *      error_code: "narrow_scope_required",
 *      error_message: string,
 *      manifest: null,
 *      files: []
 *    }
 *
 * Per FR-MR28 / D5 / OQ-8.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const STATUS_VALUES = ['success', 'error'] as const;
export const ERROR_CODE_VALUES = ['narrow_scope_required'] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

function isNonNegativeInteger(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isPositiveInteger(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function validateFileEntry(entry: unknown, label: string, errors: string[]): void {
  if (!isObject(entry)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!isNonEmptyString(entry.path)) errors.push(`${label}.path must be a non-empty string`);
  if (!isNonNegativeInteger(entry.size_bytes)) errors.push(`${label}.size_bytes must be a non-negative integer`);
  if (typeof entry.summarized !== 'boolean') errors.push(`${label}.summarized must be a boolean`);
}

export interface ValidateOptions {
  /** When provided, validates that manifest.total_bytes does not exceed this cap. */
  maxBundleBytes?: number;
}

export function validateContextBundle(obj: unknown, options: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['Context bundle must be a non-null object'] };
  }

  // status: required, enum
  if (!('status' in obj)) {
    errors.push('Missing required field "status"');
    return { valid: false, errors };
  }
  if (!STATUS_VALUES.includes(obj.status as (typeof STATUS_VALUES)[number])) {
    errors.push(`"status" must be one of: ${STATUS_VALUES.join(', ')}`);
    return { valid: false, errors };
  }

  const status = obj.status;

  // files array required (empty allowed for error path)
  if (!('files' in obj)) errors.push('Missing required field "files"');
  else if (!Array.isArray(obj.files)) errors.push('"files" must be an array');

  if (status === 'error') {
    // error_code required + enum
    if (!('error_code' in obj)) errors.push('"error_code" required when status is "error"');
    else if (!ERROR_CODE_VALUES.includes(obj.error_code as (typeof ERROR_CODE_VALUES)[number])) {
      errors.push(`"error_code" must be one of: ${ERROR_CODE_VALUES.join(', ')}`);
    }
    // error_message required, non-empty
    if (!('error_message' in obj) || !isNonEmptyString(obj.error_message)) {
      errors.push('"error_message" must be a non-empty string when status is "error"');
    }
    // manifest must be null on error
    if (obj.manifest !== null && obj.manifest !== undefined) {
      errors.push('"manifest" must be null when status is "error"');
    }
    // files must be empty on error
    if (Array.isArray(obj.files) && obj.files.length !== 0) {
      errors.push('"files" must be empty array when status is "error"');
    }
    return { valid: errors.length === 0, errors };
  }

  // status === "success"
  if (!('manifest' in obj)) {
    errors.push('"manifest" required when status is "success"');
    return { valid: false, errors };
  }
  if (!isObject(obj.manifest)) {
    errors.push('"manifest" must be an object when status is "success"');
    return { valid: false, errors };
  }

  const m = obj.manifest;

  // artifact: required object, never summarized (FR-MR28 + Task 5 behavioral rule)
  if (!('artifact' in m)) errors.push('"manifest.artifact" is required');
  else {
    validateFileEntry(m.artifact, 'manifest.artifact', errors);
    if (isObject(m.artifact) && m.artifact.summarized === true) {
      errors.push('"manifest.artifact.summarized" must be false — the artifact is never summarized (Task 5 Behavioral Rule 1)');
    }
  }

  // conventions, touched_files, specs: arrays of file entries
  for (const key of ['conventions', 'touched_files', 'specs'] as const) {
    if (!(key in m)) errors.push(`"manifest.${key}" is required (may be empty array)`);
    else if (!Array.isArray(m[key])) errors.push(`"manifest.${key}" must be an array`);
    else {
      (m[key] as unknown[]).forEach((entry, i) => {
        validateFileEntry(entry, `manifest.${key}[${i}]`, errors);
      });
    }
  }

  // total_bytes: positive integer
  if (!('total_bytes' in m)) errors.push('"manifest.total_bytes" is required');
  else if (!isPositiveInteger(m.total_bytes)) errors.push('"manifest.total_bytes" must be a positive integer');

  // Cap check (optional, only when caller provides maxBundleBytes)
  if (
    options.maxBundleBytes !== undefined &&
    typeof m.total_bytes === 'number' &&
    m.total_bytes > options.maxBundleBytes
  ) {
    errors.push(`"manifest.total_bytes" (${m.total_bytes}) exceeds maxBundleBytes (${options.maxBundleBytes})`);
  }

  // files array entries: each has path + content
  if (Array.isArray(obj.files)) {
    obj.files.forEach((entry, i) => {
      if (!isObject(entry)) {
        errors.push(`files[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(entry.path)) errors.push(`files[${i}].path must be a non-empty string`);
      if (typeof entry.content !== 'string') errors.push(`files[${i}].content must be a string`);
    });
  }

  return { valid: errors.length === 0, errors };
}

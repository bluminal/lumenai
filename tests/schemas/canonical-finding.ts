/**
 * Canonical Finding Schema validator.
 * Source of truth: plugins/synthex/agents/_shared/canonical-finding-schema.md
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;
export const SOURCE_TYPE_VALUES = ['native-team', 'external', 'native-recovery'] as const;
export const CONFIDENCE_VALUES = ['low', 'medium', 'high'] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

const LINE_NUMBER_RE = /:\d+|L\d+|line[-_]\d+/i;

export function validateCanonicalFinding(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['Finding must be a non-null object'] };
  }

  // Required: finding_id (no line numbers!)
  if (!('finding_id' in obj)) errors.push('Missing required field "finding_id"');
  else if (!isNonEmptyString(obj.finding_id)) errors.push('"finding_id" must be a non-empty string');
  else if (LINE_NUMBER_RE.test(obj.finding_id as string)) {
    errors.push(`"finding_id" must not contain line numbers (got "${obj.finding_id}")`);
  }

  // Required: severity
  if (!('severity' in obj)) errors.push('Missing required field "severity"');
  else if (!SEVERITY_VALUES.includes(obj.severity as any)) {
    errors.push(`"severity" must be one of: ${SEVERITY_VALUES.join(', ')}`);
  }

  // Required: category
  if (!('category' in obj) || !isNonEmptyString(obj.category)) errors.push('Missing or empty "category"');

  // Required: title (max 200 chars)
  if (!('title' in obj) || !isNonEmptyString(obj.title)) errors.push('Missing or empty "title"');
  else if ((obj.title as string).length > 200) errors.push('"title" exceeds 200 chars');

  // Required: description
  if (!('description' in obj) || !isNonEmptyString(obj.description)) errors.push('Missing or empty "description"');

  // Required: file
  if (!('file' in obj) || !isNonEmptyString(obj.file)) errors.push('Missing or empty "file"');

  // Required: source object with reviewer_id, family, source_type
  if (!('source' in obj)) errors.push('Missing required field "source"');
  else if (!isObject(obj.source)) errors.push('"source" must be an object');
  else {
    const src = obj.source;
    if (!isNonEmptyString(src.reviewer_id)) errors.push('"source.reviewer_id" must be a non-empty string');
    if (!isNonEmptyString(src.family)) errors.push('"source.family" must be a non-empty string');
    if (!SOURCE_TYPE_VALUES.includes(src.source_type as any)) {
      errors.push(`"source.source_type" must be one of: ${SOURCE_TYPE_VALUES.join(', ')}`);
    }
  }

  // Optional fields validation
  if ('confidence' in obj && obj.confidence !== undefined && !CONFIDENCE_VALUES.includes(obj.confidence as any)) {
    errors.push(`"confidence" must be one of: ${CONFIDENCE_VALUES.join(', ')}`);
  }

  if ('line_range' in obj && obj.line_range !== null && obj.line_range !== undefined) {
    if (!isObject(obj.line_range)) errors.push('"line_range" must be an object or null');
    else {
      const lr = obj.line_range;
      if (typeof lr.start !== 'number' || lr.start < 1) errors.push('"line_range.start" must be a positive integer');
      if (typeof lr.end !== 'number' || lr.end < 1) errors.push('"line_range.end" must be a positive integer');
    }
  }

  if ('raised_by' in obj && obj.raised_by !== undefined) {
    if (!Array.isArray(obj.raised_by)) errors.push('"raised_by" must be an array');
    else {
      obj.raised_by.forEach((entry, i) => {
        if (!isObject(entry)) { errors.push(`raised_by[${i}] must be an object`); return; }
        if (!isNonEmptyString(entry.reviewer_id)) errors.push(`raised_by[${i}].reviewer_id must be non-empty string`);
        if (!isNonEmptyString(entry.family)) errors.push(`raised_by[${i}].family must be non-empty string`);
        if (!SOURCE_TYPE_VALUES.includes(entry.source_type as any)) {
          errors.push(`raised_by[${i}].source_type must be one of: ${SOURCE_TYPE_VALUES.join(', ')}`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

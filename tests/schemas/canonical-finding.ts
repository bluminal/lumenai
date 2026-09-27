/**
 * Canonical Finding Schema validator.
 *
 * Source of truth: plugins/synthex/agents/_shared/canonical-finding.schema.json
 * (D13, FR-HM28). This validator loads the JSON Schema at import time and
 * derives its enums, required-field list, and length limits from it — it
 * does not duplicate those constants — so the JSON file and this validator
 * cannot drift apart. Prose documentation lives in
 * plugins/synthex/agents/_shared/canonical-finding-schema.md, which embeds
 * the same JSON verbatim.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SCHEMA_JSON_PATH = resolve(
  __dirname,
  '../../plugins/synthex/agents/_shared/canonical-finding.schema.json',
);

interface CanonicalFindingSchema {
  required: string[];
  properties: {
    severity: { enum: readonly string[] };
    title: { maxLength: number };
    finding_id: { not: { pattern: string } };
    source: {
      properties: {
        source_type: { enum: readonly string[] };
      };
    };
    confidence: { enum: readonly string[] };
    raised_by: {
      items: {
        properties: {
          source_type: { enum: readonly string[] };
        };
      };
    };
  };
}

const SCHEMA: CanonicalFindingSchema = JSON.parse(readFileSync(SCHEMA_JSON_PATH, 'utf8'));

export const SEVERITY_VALUES = SCHEMA.properties.severity.enum as unknown as readonly [
  'critical',
  'high',
  'medium',
  'low',
];
export const SOURCE_TYPE_VALUES = SCHEMA.properties.source.properties.source_type
  .enum as unknown as readonly ['native-team', 'external', 'native-recovery'];
export const CONFIDENCE_VALUES = SCHEMA.properties.confidence.enum as unknown as readonly [
  'low',
  'medium',
  'high',
];

const REQUIRED_FIELDS = SCHEMA.required;
const TITLE_MAX_LENGTH = SCHEMA.properties.title.maxLength;
// The 'i' flag is an implementation nicety (catches "LINE_42" as well as
// "line_42"); every pattern in the schema already matches the tested cases
// case-sensitively.
const LINE_NUMBER_RE = new RegExp(SCHEMA.properties.finding_id.not.pattern, 'i');

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

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
  if (REQUIRED_FIELDS.includes('category') && (!('category' in obj) || !isNonEmptyString(obj.category))) {
    errors.push('Missing or empty "category"');
  }

  // Required: title (max chars per schema)
  if (!('title' in obj) || !isNonEmptyString(obj.title)) errors.push('Missing or empty "title"');
  else if ((obj.title as string).length > TITLE_MAX_LENGTH) errors.push(`"title" exceeds ${TITLE_MAX_LENGTH} chars`);

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

/**
 * Schema validator for standing-pool index.json.
 *
 * Validates the index file at:
 *   ~/.claude/teams/standing/index.json
 *
 * Per the normative schema defined in:
 *   docs/specs/multi-model-teams/pool-lifecycle.md §2 (FR-MMT9b)
 *
 * Validates:
 * - Top-level structure is { pools: [...] }
 * - Each entry has: name, pool_state, last_active_at, metadata_dir
 * - pool_state is one of the four valid enum values
 * - last_active_at is ISO-8601 UTC (ends in 'Z')
 */

import { POOL_STATE_VALUES, isISO8601UTC, type PoolState } from './standing-pool-config.js';

export { POOL_STATE_VALUES, isISO8601UTC };

// ── Required fields per FR-MMT9b denormalization schema ──────────

const REQUIRED_ENTRY_FIELDS: ReadonlyArray<string> = [
  'name',
  'pool_state',
  'last_active_at',
  'metadata_dir',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IndexEntryValidationResult extends ValidationResult {
  entryIndex: number;
}

// ── Entry Validator ──────────────────────────────────────────────

export function validatePoolIndexEntry(
  entry: unknown,
  entryIndex: number
): IndexEntryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const prefix = `pools[${entryIndex}]`;

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    errors.push(`${prefix}: must be a non-null object`);
    return { valid: false, errors, warnings, entryIndex };
  }

  const e = entry as Record<string, unknown>;

  // 1. Required fields
  for (const field of REQUIRED_ENTRY_FIELDS) {
    if (!(field in e)) {
      errors.push(`${prefix}: missing required field "${field}"`);
    }
  }

  // 2. pool_state enum
  if ('pool_state' in e) {
    if (!POOL_STATE_VALUES.includes(e.pool_state as PoolState)) {
      errors.push(
        `${prefix}.pool_state: invalid value "${e.pool_state}". ` +
        `Must be one of: ${POOL_STATE_VALUES.join(', ')}`
      );
    }
  }

  // 3. last_active_at must be ISO-8601 UTC (ending in 'Z')
  if ('last_active_at' in e) {
    if (!isISO8601UTC(e.last_active_at)) {
      errors.push(
        `${prefix}.last_active_at: invalid value "${e.last_active_at}". ` +
        'Must be ISO-8601 UTC format ending in "Z" (e.g., "2026-04-25T14:32:11Z")'
      );
    }
  }

  // 4. name must be a non-empty string
  if ('name' in e) {
    if (typeof e.name !== 'string' || e.name.length === 0) {
      errors.push(`${prefix}.name: must be a non-empty string`);
    }
  }

  // 5. metadata_dir must be a non-empty string
  if ('metadata_dir' in e) {
    if (typeof e.metadata_dir !== 'string' || e.metadata_dir.length === 0) {
      errors.push(`${prefix}.metadata_dir: must be a non-empty string path`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, entryIndex };
}

// ── Top-Level Index Validator ────────────────────────────────────

export function validatePoolIndex(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Top-level must be a non-null object
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push('Pool index must be a non-null JSON object with a "pools" array');
    return { valid: false, errors, warnings };
  }

  const index = data as Record<string, unknown>;

  // 1. Must have a top-level "pools" key
  if (!('pools' in index)) {
    errors.push('Missing required top-level field: "pools"');
    return { valid: false, errors, warnings };
  }

  // 2. pools must be an array
  if (!Array.isArray(index.pools)) {
    errors.push('"pools" must be an array');
    return { valid: false, errors, warnings };
  }

  // 3. Empty pools array is valid (no active standing pools)
  if (index.pools.length === 0) {
    // No entries to validate — valid empty state
    return { valid: true, errors, warnings };
  }

  // 4. Validate each entry
  for (let i = 0; i < index.pools.length; i++) {
    const entryResult = validatePoolIndexEntry(index.pools[i], i);
    errors.push(...entryResult.errors);
    warnings.push(...entryResult.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates a JSON string representing a pool index.
 * Convenience wrapper that parses JSON before validating.
 */
export function validatePoolIndexJSON(json: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      valid: false,
      errors: [`Failed to parse index JSON: ${(e as Error).message}`],
      warnings: [],
    };
  }
  return validatePoolIndex(parsed);
}

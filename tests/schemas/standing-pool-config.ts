/**
 * Schema validator for standing-pool per-pool config.json.
 *
 * Validates the config.json stored at:
 *   ~/.claude/teams/standing/<name>/config.json
 *
 * Per the normative schema defined in:
 *   docs/specs/multi-model-teams/pool-lifecycle.md §1 (FR-MMT7)
 *
 * Validates:
 * - All required fields are present
 * - pool_state is one of the four valid enum values
 * - last_active_at is ISO-8601 UTC (ends in 'Z')
 * - ttl_minutes is a non-negative integer
 * - standing is always true
 */

// ── Valid pool_state values (FR-MMT7, §3 state machine) ─────────

export const POOL_STATE_VALUES = ['idle', 'active', 'draining', 'stopping'] as const;
export type PoolState = typeof POOL_STATE_VALUES[number];

// ── Required fields per FR-MMT7 normative schema ─────────────────

const REQUIRED_FIELDS: ReadonlyArray<string> = [
  'name',
  'standing',
  'reviewers',
  'multi_model',
  'ttl_minutes',
  'spawn_timestamp',
  'host_pid',
  'host_session_id',
  'last_active_at',
  'pool_state',
];

// ── ISO-8601 UTC validation ───────────────────────────────────────
// Must end in 'Z' (UTC designator). Examples:
//   "2026-04-25T14:32:11Z"   — valid
//   "2026-04-25T14:32:11+00:00" — invalid (not UTC 'Z' suffix)
//   "2026-04-25"             — invalid (date only)

const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function isISO8601UTC(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!ISO_8601_UTC_REGEX.test(value)) return false;
  // Additionally verify it parses as a real date
  const d = new Date(value);
  return !isNaN(d.getTime());
}

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validatePoolConfig(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Top-level must be a non-null object
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push('Pool config must be a non-null JSON object');
    return { valid: false, errors, warnings };
  }

  const config = data as Record<string, unknown>;

  // 1. Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in config)) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  // 2. pool_state must be one of the four valid enum values
  if ('pool_state' in config) {
    if (!POOL_STATE_VALUES.includes(config.pool_state as PoolState)) {
      errors.push(
        `Invalid pool_state: "${config.pool_state}". ` +
        `Must be one of: ${POOL_STATE_VALUES.join(', ')}`
      );
    }
  }

  // 3. last_active_at must be ISO-8601 UTC (ending in 'Z')
  if ('last_active_at' in config) {
    if (!isISO8601UTC(config.last_active_at)) {
      errors.push(
        `Invalid last_active_at: "${config.last_active_at}". ` +
        'Must be ISO-8601 UTC format ending in "Z" (e.g., "2026-04-25T14:32:11Z")'
      );
    }
  }

  // 4. spawn_timestamp must be ISO-8601 UTC (ending in 'Z')
  if ('spawn_timestamp' in config) {
    if (!isISO8601UTC(config.spawn_timestamp)) {
      errors.push(
        `Invalid spawn_timestamp: "${config.spawn_timestamp}". ` +
        'Must be ISO-8601 UTC format ending in "Z" (e.g., "2026-04-25T14:32:11Z")'
      );
    }
  }

  // 5. ttl_minutes must be a non-negative integer
  if ('ttl_minutes' in config) {
    const ttl = config.ttl_minutes;
    if (typeof ttl !== 'number' || !Number.isInteger(ttl) || ttl < 0) {
      errors.push(
        `Invalid ttl_minutes: "${ttl}". Must be a non-negative integer (0 = no TTL)`
      );
    }
  }

  // 6. standing must be true (this is a standing pool config)
  if ('standing' in config) {
    if (config.standing !== true) {
      errors.push(
        `Invalid standing: "${config.standing}". Must be true for a standing pool config`
      );
    }
  }

  // 7. reviewers must be a non-empty array of strings
  if ('reviewers' in config) {
    const reviewers = config.reviewers;
    if (!Array.isArray(reviewers)) {
      errors.push('reviewers must be an array of strings');
    } else if (reviewers.length === 0) {
      warnings.push('reviewers array is empty — pool would have no reviewers');
    } else {
      for (const r of reviewers) {
        if (typeof r !== 'string') {
          errors.push(`reviewers must contain only strings; found: ${JSON.stringify(r)}`);
          break;
        }
      }
    }
  }

  // 8. multi_model must be a boolean
  if ('multi_model' in config) {
    if (typeof config.multi_model !== 'boolean') {
      errors.push(`multi_model must be a boolean, got: "${typeof config.multi_model}"`);
    }
  }

  // 9. host_pid must be a positive integer
  if ('host_pid' in config) {
    const pid = config.host_pid;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      errors.push(`host_pid must be a positive integer, got: "${pid}"`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates a JSON string representing a pool config.
 * Convenience wrapper that parses JSON before validating.
 */
export function validatePoolConfigJSON(json: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      valid: false,
      errors: [`Failed to parse config JSON: ${(e as Error).message}`],
      warnings: [],
    };
  }
  return validatePoolConfig(parsed);
}

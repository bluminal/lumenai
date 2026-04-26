/**
 * Schema validator for the start-review-team command spawn confirmation output.
 *
 * Exports one validator function:
 *
 *   validateStartReviewTeamOutput(obj: unknown): { valid: boolean; errors: string[] }
 *
 * The spawn confirmation is the structured output emitted by the start-review-team
 * command after successfully spawning a standing pool.
 *
 * No external runtime dependencies — pure TypeScript returning plain objects.
 */

// ── Pool state enum at spawn time ─────────────────────────────────

export const SPAWN_POOL_STATE_VALUES = ['idle'] as const;
export type SpawnPoolState = typeof SPAWN_POOL_STATE_VALUES[number];

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

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// ── validateStartReviewTeamOutput ─────────────────────────────────

/**
 * Validates the spawn confirmation output shape produced by start-review-team.
 *
 * Required fields:
 *   pool_name                   — non-empty string
 *   reviewers                   — non-empty array of strings
 *   multi_model                 — boolean
 *   ttl_minutes                 — positive integer (> 0)
 *   submission_timeout_seconds  — positive integer (> 0)
 *   storage_path                — non-empty string
 *   pool_state                  — must be "idle" (only valid value at spawn)
 *   cost_warning_shown          — boolean
 */
export function validateStartReviewTeamOutput(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    errors.push('Start-review-team output must be a non-null JSON object');
    return { valid: false, errors };
  }

  // ── pool_name: required, non-empty string ─────────────────────────
  if (!('pool_name' in obj)) {
    errors.push('Missing required field: "pool_name"');
  } else if (!isNonEmptyString(obj['pool_name'])) {
    errors.push('Field "pool_name" must be a non-empty string');
  }

  // ── reviewers: required non-empty array of strings ────────────────
  if (!('reviewers' in obj)) {
    errors.push('Missing required field: "reviewers"');
  } else if (!Array.isArray(obj['reviewers'])) {
    errors.push(`Field "reviewers" must be an array, got: "${typeof obj['reviewers']}"`);
  } else if (obj['reviewers'].length === 0) {
    errors.push('Field "reviewers" must be a non-empty array');
  } else {
    const nonStrings = (obj['reviewers'] as unknown[]).filter((v) => typeof v !== 'string');
    if (nonStrings.length > 0) {
      errors.push(
        `Field "reviewers" must contain only strings; found ${nonStrings.length} non-string element(s)`
      );
    }
  }

  // ── multi_model: required boolean ────────────────────────────────
  if (!('multi_model' in obj)) {
    errors.push('Missing required field: "multi_model"');
  } else if (typeof obj['multi_model'] !== 'boolean') {
    errors.push(`Field "multi_model" must be a boolean, got: "${typeof obj['multi_model']}"`);
  }

  // ── ttl_minutes: required positive integer ────────────────────────
  if (!('ttl_minutes' in obj)) {
    errors.push('Missing required field: "ttl_minutes"');
  } else if (!isPositiveInteger(obj['ttl_minutes'])) {
    errors.push(
      `Field "ttl_minutes" must be a positive integer (> 0), got: ${JSON.stringify(obj['ttl_minutes'])}`
    );
  }

  // ── submission_timeout_seconds: required positive integer ─────────
  if (!('submission_timeout_seconds' in obj)) {
    errors.push('Missing required field: "submission_timeout_seconds"');
  } else if (!isPositiveInteger(obj['submission_timeout_seconds'])) {
    errors.push(
      `Field "submission_timeout_seconds" must be a positive integer (> 0), got: ${JSON.stringify(obj['submission_timeout_seconds'])}`
    );
  }

  // ── storage_path: required non-empty string ───────────────────────
  if (!('storage_path' in obj)) {
    errors.push('Missing required field: "storage_path"');
  } else if (!isNonEmptyString(obj['storage_path'])) {
    errors.push('Field "storage_path" must be a non-empty string');
  }

  // ── pool_state: required, must be "idle" at spawn ─────────────────
  if (!('pool_state' in obj)) {
    errors.push('Missing required field: "pool_state"');
  } else if (!SPAWN_POOL_STATE_VALUES.includes(obj['pool_state'] as SpawnPoolState)) {
    errors.push(
      `Invalid pool_state value: "${obj['pool_state']}". ` +
      `Must be one of: ${SPAWN_POOL_STATE_VALUES.join(', ')} (only "idle" is valid at spawn time)`
    );
  }

  // ── cost_warning_shown: required boolean ──────────────────────────
  if (!('cost_warning_shown' in obj)) {
    errors.push('Missing required field: "cost_warning_shown"');
  } else if (typeof obj['cost_warning_shown'] !== 'boolean') {
    errors.push(
      `Field "cost_warning_shown" must be a boolean, got: "${typeof obj['cost_warning_shown']}"`
    );
  }

  return { valid: errors.length === 0, errors };
}

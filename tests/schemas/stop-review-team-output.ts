/**
 * Schema validator for the stop-review-team command output.
 *
 * Exports one validator function:
 *
 *   validateStopReviewTeamOutput(obj: unknown): { valid: boolean; errors: string[] }
 *
 * The stop-review-team command emits one StopPoolResult per targeted pool,
 * plus a flag indicating whether the no-args interactive path was used.
 *
 * No external runtime dependencies — pure TypeScript returning plain objects.
 */

// ── Stop result enum ──────────────────────────────────────────────

export const STOP_RESULT_VALUES = [
  'stopped_cleanly',
  'force_stopped',
  'cleanup_needed',
  'not_found',
  'cancelled',
] as const;
export type StopResult = typeof STOP_RESULT_VALUES[number];

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

// ── Internal: validateStopPoolResult ─────────────────────────────

function validateStopPoolResult(
  entry: unknown,
  index: number,
  errors: string[]
): void {
  const prefix = `pools[${index}]`;

  if (!isObject(entry)) {
    errors.push(`${prefix} must be a non-null object`);
    return;
  }

  // pool_name: required non-empty string
  if (!('pool_name' in entry)) {
    errors.push(`Missing required field "${prefix}.pool_name"`);
  } else if (!isNonEmptyString(entry['pool_name'])) {
    errors.push(`Field "${prefix}.pool_name" must be a non-empty string`);
  }

  // result: required enum value
  if (!('result' in entry)) {
    errors.push(`Missing required field "${prefix}.result"`);
  } else if (!STOP_RESULT_VALUES.includes(entry['result'] as StopResult)) {
    errors.push(
      `Invalid result value: "${entry['result']}" in ${prefix}. ` +
      `Must be one of: ${STOP_RESULT_VALUES.join(', ')}`
    );
  }

  // message: optional string (when present must be a string)
  if ('message' in entry && entry['message'] !== undefined) {
    if (typeof entry['message'] !== 'string') {
      errors.push(
        `Field "${prefix}.message" must be a string when present, ` +
        `got: "${typeof entry['message']}"`
      );
    }
  }
}

// ── validateStopReviewTeamOutput ──────────────────────────────────

/**
 * Validates the stop-review-team command output shape.
 *
 * Required top-level fields:
 *   pools                   — array of StopPoolResult (may be empty on cancel/abort)
 *   pre_prompt_table_shown  — boolean (true when no-args interactive path was used)
 *
 * Each StopPoolResult requires: pool_name, result.
 * Optional per-result field: message (human-readable detail string).
 */
export function validateStopReviewTeamOutput(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    errors.push('Stop-review-team output must be a non-null JSON object');
    return { valid: false, errors };
  }

  // ── pools: required array (may be empty) ──────────────────────────
  if (!('pools' in obj)) {
    errors.push('Missing required field: "pools"');
  } else if (!Array.isArray(obj['pools'])) {
    errors.push(`Field "pools" must be an array, got: "${typeof obj['pools']}"`);
  } else {
    for (let i = 0; i < (obj['pools'] as unknown[]).length; i++) {
      validateStopPoolResult((obj['pools'] as unknown[])[i], i, errors);
    }
  }

  // ── pre_prompt_table_shown: required boolean ──────────────────────
  if (!('pre_prompt_table_shown' in obj)) {
    errors.push('Missing required field: "pre_prompt_table_shown"');
  } else if (typeof obj['pre_prompt_table_shown'] !== 'boolean') {
    errors.push(
      `Field "pre_prompt_table_shown" must be a boolean, ` +
      `got: "${typeof obj['pre_prompt_table_shown']}"`
    );
  }

  return { valid: errors.length === 0, errors };
}

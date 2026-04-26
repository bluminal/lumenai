/**
 * Schema validator for the list-teams command output.
 *
 * Exports one validator function:
 *
 *   validateListTeamsOutput(obj: unknown): { valid: boolean; errors: string[] }
 *
 * The list-teams command emits a structured object describing all known pools
 * and teams. This validator checks the machine-readable form of that output.
 *
 * No external runtime dependencies — pure TypeScript returning plain objects.
 */

// ── Pool state enum ───────────────────────────────────────────────

export const POOL_STATE_VALUES = ['idle', 'active', 'draining', 'stopping'] as const;
export type PoolState = typeof POOL_STATE_VALUES[number];

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

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// ── Internal: validateTasksObject ────────────────────────────────

function validateTasksObject(
  tasks: unknown,
  prefix: string,
  errors: string[]
): void {
  if (!isObject(tasks)) {
    errors.push(`Field "${prefix}.tasks" must be a non-null object`);
    return;
  }

  for (const counter of ['pending', 'in_progress', 'completed'] as const) {
    if (!(counter in tasks)) {
      errors.push(`Missing required field "${prefix}.tasks.${counter}"`);
    } else if (!isNonNegativeInteger(tasks[counter])) {
      errors.push(
        `Field "${prefix}.tasks.${counter}" must be a non-negative integer, ` +
        `got: ${JSON.stringify(tasks[counter])}`
      );
    }
  }
}

// ── Internal: validateReviewersArray ─────────────────────────────

function validateReviewersArray(
  reviewers: unknown,
  prefix: string,
  errors: string[]
): void {
  if (!Array.isArray(reviewers)) {
    errors.push(`Field "${prefix}.reviewers" must be an array, got: "${typeof reviewers}"`);
    return;
  }
  if (reviewers.length === 0) {
    errors.push(`Field "${prefix}.reviewers" must be a non-empty array`);
    return;
  }
  const nonStrings = (reviewers as unknown[]).filter((v) => typeof v !== 'string');
  if (nonStrings.length > 0) {
    errors.push(
      `Field "${prefix}.reviewers" must contain only strings; ` +
      `found ${nonStrings.length} non-string element(s)`
    );
  }
}

// ── Internal: validateStandingPoolEntry ───────────────────────────

function validateStandingPoolEntry(
  entry: unknown,
  index: number,
  errors: string[]
): void {
  const prefix = `standing_pools[${index}]`;

  if (!isObject(entry)) {
    errors.push(`${prefix} must be a non-null object`);
    return;
  }

  // name: required non-empty string
  if (!('name' in entry)) {
    errors.push(`Missing required field "${prefix}.name"`);
  } else if (!isNonEmptyString(entry['name'])) {
    errors.push(`Field "${prefix}.name" must be a non-empty string`);
  }

  // pool_state: required enum value
  if (!('pool_state' in entry)) {
    errors.push(`Missing required field "${prefix}.pool_state"`);
  } else if (!POOL_STATE_VALUES.includes(entry['pool_state'] as PoolState)) {
    errors.push(
      `Invalid pool_state value: "${entry['pool_state']}" in ${prefix}. ` +
      `Must be one of: ${POOL_STATE_VALUES.join(', ')}`
    );
  }

  // reviewers: required non-empty array of strings
  if (!('reviewers' in entry)) {
    errors.push(`Missing required field "${prefix}.reviewers"`);
  } else {
    validateReviewersArray(entry['reviewers'], prefix, errors);
  }

  // multi_model: required boolean
  if (!('multi_model' in entry)) {
    errors.push(`Missing required field "${prefix}.multi_model"`);
  } else if (typeof entry['multi_model'] !== 'boolean') {
    errors.push(
      `Field "${prefix}.multi_model" must be a boolean, got: "${typeof entry['multi_model']}"`
    );
  }

  // tasks: required object with three counters
  if (!('tasks' in entry)) {
    errors.push(`Missing required field "${prefix}.tasks"`);
  } else {
    validateTasksObject(entry['tasks'], prefix, errors);
  }

  // idle_minutes: required non-negative integer
  if (!('idle_minutes' in entry)) {
    errors.push(`Missing required field "${prefix}.idle_minutes"`);
  } else if (!isNonNegativeInteger(entry['idle_minutes'])) {
    errors.push(
      `Field "${prefix}.idle_minutes" must be a non-negative integer, ` +
      `got: ${JSON.stringify(entry['idle_minutes'])}`
    );
  }

  // ttl_remaining_minutes: required non-negative integer
  if (!('ttl_remaining_minutes' in entry)) {
    errors.push(`Missing required field "${prefix}.ttl_remaining_minutes"`);
  } else if (!isNonNegativeInteger(entry['ttl_remaining_minutes'])) {
    errors.push(
      `Field "${prefix}.ttl_remaining_minutes" must be a non-negative integer, ` +
      `got: ${JSON.stringify(entry['ttl_remaining_minutes'])}`
    );
  }
}

// ── Internal: validateNonStandingTeamEntry ────────────────────────

function validateNonStandingTeamEntry(
  entry: unknown,
  index: number,
  errors: string[]
): void {
  const prefix = `non_standing_teams[${index}]`;

  if (!isObject(entry)) {
    errors.push(`${prefix} must be a non-null object`);
    return;
  }

  // name: required non-empty string
  if (!('name' in entry)) {
    errors.push(`Missing required field "${prefix}.name"`);
  } else if (!isNonEmptyString(entry['name'])) {
    errors.push(`Field "${prefix}.name" must be a non-empty string`);
  }

  // reviewers: required non-empty array of strings
  if (!('reviewers' in entry)) {
    errors.push(`Missing required field "${prefix}.reviewers"`);
  } else {
    validateReviewersArray(entry['reviewers'], prefix, errors);
  }

  // tasks: required object with three counters
  if (!('tasks' in entry)) {
    errors.push(`Missing required field "${prefix}.tasks"`);
  } else {
    validateTasksObject(entry['tasks'], prefix, errors);
  }

  // started_minutes_ago: required non-negative integer
  if (!('started_minutes_ago' in entry)) {
    errors.push(`Missing required field "${prefix}.started_minutes_ago"`);
  } else if (!isNonNegativeInteger(entry['started_minutes_ago'])) {
    errors.push(
      `Field "${prefix}.started_minutes_ago" must be a non-negative integer, ` +
      `got: ${JSON.stringify(entry['started_minutes_ago'])}`
    );
  }
}

// ── validateListTeamsOutput ───────────────────────────────────────

/**
 * Validates the list-teams command output shape.
 *
 * Required top-level fields:
 *   standing_pools        — array of StandingPoolEntry (may be empty)
 *   non_standing_teams    — array of NonStandingTeamEntry (may be empty)
 *
 * Each StandingPoolEntry requires: name, pool_state, reviewers, multi_model,
 *   tasks, idle_minutes, ttl_remaining_minutes.
 *
 * Each NonStandingTeamEntry requires: name, reviewers, tasks, started_minutes_ago.
 */
export function validateListTeamsOutput(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    errors.push('List-teams output must be a non-null JSON object');
    return { valid: false, errors };
  }

  // ── standing_pools: required array ────────────────────────────────
  if (!('standing_pools' in obj)) {
    errors.push('Missing required field: "standing_pools"');
  } else if (!Array.isArray(obj['standing_pools'])) {
    errors.push(
      `Field "standing_pools" must be an array, got: "${typeof obj['standing_pools']}"`
    );
  } else {
    for (let i = 0; i < (obj['standing_pools'] as unknown[]).length; i++) {
      validateStandingPoolEntry((obj['standing_pools'] as unknown[])[i], i, errors);
    }
  }

  // ── non_standing_teams: required array ────────────────────────────
  if (!('non_standing_teams' in obj)) {
    errors.push('Missing required field: "non_standing_teams"');
  } else if (!Array.isArray(obj['non_standing_teams'])) {
    errors.push(
      `Field "non_standing_teams" must be an array, got: "${typeof obj['non_standing_teams']}"`
    );
  } else {
    for (let i = 0; i < (obj['non_standing_teams'] as unknown[]).length; i++) {
      validateNonStandingTeamEntry((obj['non_standing_teams'] as unknown[])[i], i, errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

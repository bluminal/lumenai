/**
 * Schema validators for standing-pool-cleanup agent outputs.
 *
 * Exports TWO validator functions used by downstream tasks (47, 54, 57):
 *
 *   1. validateCleanupResult — validates the three cleanup-agent result shapes:
 *        { result: "removed" | "not-found" | "lock-failed", ... }
 *      Output Contract is normative per:
 *        plugins/synthex-plus/agents/standing-pool-cleanup.md §Output Contract
 *
 *   2. validateInlineDiscoveryOutput — validates the inline-discovery output shape
 *      emitted by submitting commands (Tasks 54/57) after pool-routing decisions.
 *      This file is the source-of-truth schema for that shape, per FR-MMT30.
 *
 * No external runtime dependencies — pure TypeScript returning plain objects.
 */

// ── Cleanup result enum ───────────────────────────────────────────

export const CLEANUP_RESULT_VALUES = ['removed', 'not-found', 'lock-failed'] as const;
export type CleanupResult = typeof CLEANUP_RESULT_VALUES[number];

// ── Routing decision enum (FR-MMT30, all seven values) ───────────

export const ROUTING_DECISION_VALUES = [
  'routed-to-pool',
  'fell-back-no-pool',
  'fell-back-roster-mismatch',
  'fell-back-pool-draining',
  'fell-back-pool-stale',
  'fell-back-timeout',              // added by submitter (Task 35) on polling timeout
  'skipped-routing-mode-explicit',  // added by submitting command when standing_pools.enabled=false
] as const;
export type RoutingDecision = typeof ROUTING_DECISION_VALUES[number];

// ── Known reason_not_used values (forward-compatible: validator accepts any string) ──

export const KNOWN_REASONS_NOT_USED: readonly string[] = [
  'roster_mismatch',
  'draining',
  'stale',
];

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

// ── validateCleanupResult ─────────────────────────────────────────

/**
 * Validates the cleanup-agent output shape.
 *
 * Three valid result shapes (per standing-pool-cleanup.md §Output Contract):
 *
 *   { result: "removed",    pool_name: string, removed_index_entry: boolean, removed_metadata_dir: boolean }
 *   { result: "not-found",  pool_name: string }
 *   { result: "lock-failed", pool_name: string, error: string }
 *
 * The "not-found" shape is strict: no keys beyond result and pool_name are allowed.
 */
export function validateCleanupResult(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    errors.push('Cleanup result must be a non-null JSON object');
    return { valid: false, errors };
  }

  // ── result: required, must be one of the three enum values ───────
  if (!('result' in obj)) {
    errors.push('Missing required field: "result"');
    return { valid: false, errors };
  }

  const result = obj['result'];
  if (!CLEANUP_RESULT_VALUES.includes(result as CleanupResult)) {
    errors.push(
      `Invalid result value: "${result}". ` +
      `Must be one of: ${CLEANUP_RESULT_VALUES.join(', ')}`
    );
    return { valid: false, errors };
  }

  // ── pool_name: required, non-empty string ─────────────────────────
  if (!('pool_name' in obj)) {
    errors.push('Missing required field: "pool_name"');
  } else if (!isNonEmptyString(obj['pool_name'])) {
    errors.push('Field "pool_name" must be a non-empty string');
  }

  // ── result-specific fields ─────────────────────────────────────────

  if (result === 'removed') {
    // removed_index_entry: required boolean
    if (!('removed_index_entry' in obj)) {
      errors.push('Missing required field "removed_index_entry" for result: "removed"');
    } else if (typeof obj['removed_index_entry'] !== 'boolean') {
      errors.push(
        `Field "removed_index_entry" must be a boolean, got: "${typeof obj['removed_index_entry']}"`
      );
    }

    // removed_metadata_dir: required boolean
    if (!('removed_metadata_dir' in obj)) {
      errors.push('Missing required field "removed_metadata_dir" for result: "removed"');
    } else if (typeof obj['removed_metadata_dir'] !== 'boolean') {
      errors.push(
        `Field "removed_metadata_dir" must be a boolean, got: "${typeof obj['removed_metadata_dir']}"`
      );
    }
  }

  if (result === 'lock-failed') {
    // error: required, non-empty string
    if (!('error' in obj)) {
      errors.push('Missing required field "error" for result: "lock-failed"');
    } else if (!isNonEmptyString(obj['error'])) {
      errors.push('Field "error" must be a non-empty string for result: "lock-failed"');
    }
  }

  if (result === 'not-found') {
    // Strict shape: only result + pool_name are allowed
    const allowedKeys = new Set(['result', 'pool_name']);
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.has(key)) {
        errors.push(
          `Unexpected field "${key}" in result: "not-found" — ` +
          'only "result" and "pool_name" are allowed'
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── validateInlineDiscoveryOutput ────────────────────────────────

/**
 * Validates the inline-discovery output shape emitted by submitting commands
 * (Tasks 54/57) after executing pool-routing decisions.
 *
 * This is the normative schema source-of-truth for that output shape per FR-MMT30.
 *
 * Conditional required fields:
 *   routing_decision === "routed-to-pool"
 *     → requires: pool_name (non-empty), multi_model (boolean), match_rationale (non-empty)
 *
 *   routing_decision === "fell-back-pool-draining" | "fell-back-pool-stale"
 *     → requires: pool_name (non-empty)
 *
 *   All other routing_decision values
 *     → pool_name, multi_model, match_rationale are optional
 *
 * Optional would_have_routed, when present:
 *   { pool_name: string (non-empty), reason_not_used: string (non-empty) }
 */
export function validateInlineDiscoveryOutput(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    errors.push('Inline-discovery output must be a non-null JSON object');
    return { valid: false, errors };
  }

  // ── routing_decision: required, must be one of the seven values ───
  if (!('routing_decision' in obj)) {
    errors.push('Missing required field: "routing_decision"');
    return { valid: false, errors };
  }

  const decision = obj['routing_decision'];
  if (!ROUTING_DECISION_VALUES.includes(decision as RoutingDecision)) {
    errors.push(
      `Invalid routing_decision value: "${decision}". ` +
      `Must be one of: ${ROUTING_DECISION_VALUES.join(', ')}`
    );
    return { valid: false, errors };
  }

  const routingDecision = decision as RoutingDecision;

  // ── Conditional required fields ────────────────────────────────────

  if (routingDecision === 'routed-to-pool') {
    // pool_name: required non-empty string
    if (!('pool_name' in obj)) {
      errors.push(
        'Missing required field "pool_name" when routing_decision is "routed-to-pool"'
      );
    } else if (!isNonEmptyString(obj['pool_name'])) {
      errors.push(
        'Field "pool_name" must be a non-empty string when routing_decision is "routed-to-pool"'
      );
    }

    // multi_model: required boolean
    if (!('multi_model' in obj)) {
      errors.push(
        'Missing required field "multi_model" when routing_decision is "routed-to-pool"'
      );
    } else if (typeof obj['multi_model'] !== 'boolean') {
      errors.push(
        `Field "multi_model" must be a boolean when routing_decision is "routed-to-pool", ` +
        `got: "${typeof obj['multi_model']}"`
      );
    }

    // match_rationale: required non-empty string
    if (!('match_rationale' in obj)) {
      errors.push(
        'Missing required field "match_rationale" when routing_decision is "routed-to-pool"'
      );
    } else if (!isNonEmptyString(obj['match_rationale'])) {
      errors.push(
        'Field "match_rationale" must be a non-empty string when routing_decision is "routed-to-pool"'
      );
    }
  }

  if (
    routingDecision === 'fell-back-pool-draining' ||
    routingDecision === 'fell-back-pool-stale'
  ) {
    // pool_name: required non-empty string
    if (!('pool_name' in obj)) {
      errors.push(
        `Missing required field "pool_name" when routing_decision is "${routingDecision}"`
      );
    } else if (!isNonEmptyString(obj['pool_name'])) {
      errors.push(
        `Field "pool_name" must be a non-empty string when routing_decision is "${routingDecision}"`
      );
    }
  }

  // ── Optional: would_have_routed ────────────────────────────────────
  if ('would_have_routed' in obj && obj['would_have_routed'] !== undefined) {
    const whr = obj['would_have_routed'];

    if (!isObject(whr)) {
      errors.push(
        'Field "would_have_routed" must be a non-null object when present ' +
        `(got: ${JSON.stringify(whr)})`
      );
    } else {
      // pool_name: required non-empty string
      if (!('pool_name' in whr)) {
        errors.push('Missing required field "would_have_routed.pool_name"');
      } else if (!isNonEmptyString(whr['pool_name'])) {
        errors.push('Field "would_have_routed.pool_name" must be a non-empty string');
      }

      // reason_not_used: required non-empty string (any string for forward-compatibility)
      if (!('reason_not_used' in whr)) {
        errors.push('Missing required field "would_have_routed.reason_not_used"');
      } else if (!isNonEmptyString(whr['reason_not_used'])) {
        errors.push('Field "would_have_routed.reason_not_used" must be a non-empty string');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

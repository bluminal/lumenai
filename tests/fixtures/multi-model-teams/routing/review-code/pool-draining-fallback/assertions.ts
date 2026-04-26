/**
 * Assertion helpers for scenario (f): pool-draining-fallback.
 *
 * Pool listed as idle in index.json but config.json shows pool_state: draining.
 * Expected: routing_decision = "fell-back-pool-draining"; falls back silently.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface PoolDrainingFallbackFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: Array<{ name: string; pool_state: string }> };
    pool_config_json: { name: string; pool_state: string };
    config: Record<string, unknown>;
    command_args: Record<string, unknown>;
  };
  expected: {
    routing_decision: string;
    pool_name: string | null;
    multi_model: boolean | null;
    notification_contains: string | null;
    fallback_type: string;
    audit_decision: string;
    error: string | null;
    error_shown: boolean;
  };
}

export const fixture = fixtureData as PoolDrainingFallbackFixture;

/** Asserts routing_decision is "fell-back-pool-draining". */
export function assertFellBackPoolDraining(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'fell-back-pool-draining') {
    return `Expected routing_decision "fell-back-pool-draining", got "${decision}"`;
  }
  return null;
}

/** Asserts audit_decision is "fell-back-pool-draining". */
export function assertAuditDecision(): string | null {
  const audit = fixture.expected.audit_decision;
  if (audit !== 'fell-back-pool-draining') {
    return `Expected audit_decision "fell-back-pool-draining", got "${audit}"`;
  }
  return null;
}

/** Asserts pool_name is "review-pool-c" (pool identified in audit). */
export function assertPoolNameInAudit(): string | null {
  const poolName = fixture.expected.pool_name;
  if (poolName !== 'review-pool-c') {
    return `Expected pool_name "review-pool-c", got "${poolName}"`;
  }
  return null;
}

/** Asserts no error is emitted. */
export function assertNoError(): string | null {
  const error = fixture.expected.error;
  if (error !== null) {
    return `Expected error null, got ${JSON.stringify(error)}`;
  }
  return null;
}

/** Asserts error_shown is false. */
export function assertErrorNotShown(): string | null {
  const shown = fixture.expected.error_shown;
  if (shown !== false) {
    return `Expected error_shown false, got ${JSON.stringify(shown)}`;
  }
  return null;
}

/**
 * Asserts the mismatch condition: index.json shows idle but config.json shows draining.
 * This is what triggers the fell-back-pool-draining decision.
 */
export function assertDrainingMismatch(): string | null {
  const indexPool = fixture.setup.index_json.pools[0];
  const poolConfig = fixture.setup.pool_config_json;

  if (indexPool.pool_state !== 'idle') {
    return `Expected index_json pool_state "idle" (stale snapshot), got "${indexPool.pool_state}"`;
  }
  if (poolConfig.pool_state !== 'draining') {
    return `Expected pool_config_json pool_state "draining" (real state), got "${poolConfig.pool_state}"`;
  }
  return null;
}

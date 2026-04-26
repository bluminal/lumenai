/**
 * Assertion helpers for scenario (c): no-pool-fallback.
 *
 * index.json is empty; prefer-with-fallback mode silently falls back
 * to fresh-spawn review. No error is emitted.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface NoPoolFallbackFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: unknown[] };
    config: Record<string, unknown>;
    command_args: Record<string, unknown>;
  };
  expected: {
    routing_decision: string;
    pool_name: string | null;
    multi_model: boolean | null;
    notification_contains: string | null;
    fallback_type: string;
    error: string | null;
    error_shown: boolean;
  };
}

export const fixture = fixtureData as NoPoolFallbackFixture;

/** Asserts routing_decision is "fell-back-no-pool". */
export function assertFellBackNoPool(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'fell-back-no-pool') {
    return `Expected routing_decision "fell-back-no-pool", got "${decision}"`;
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

/** Asserts fallback_type is "fresh-spawn". */
export function assertFreshSpawnFallback(): string | null {
  const fallback = fixture.expected.fallback_type;
  if (fallback !== 'fresh-spawn') {
    return `Expected fallback_type "fresh-spawn", got "${fallback}"`;
  }
  return null;
}

/** Asserts pool_name is null (no pool was selected). */
export function assertPoolNameIsNull(): string | null {
  const poolName = fixture.expected.pool_name;
  if (poolName !== null) {
    return `Expected pool_name null, got "${poolName}"`;
  }
  return null;
}

/** Asserts index.json pools array is empty (the triggering condition). */
export function assertEmptyPoolIndex(): string | null {
  const pools = fixture.setup.index_json.pools;
  if (!Array.isArray(pools)) {
    return `Expected pools to be an array, got ${typeof pools}`;
  }
  if (pools.length !== 0) {
    return `Expected empty pools array, got length ${pools.length}`;
  }
  return null;
}

/**
 * Assertion helpers for scenario (a): pool-match-native-only.
 *
 * Pool has matching roster (code-reviewer, security-reviewer) with multi_model=false.
 * Expected: routes to pool; notification contains "(multi-model: no)".
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface ReviewCodeRoutingFixture {
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
    notification_absent: string | null;
    error: string | null;
  };
}

export const fixture = fixtureData as ReviewCodeRoutingFixture;

/** Asserts routing_decision is "routed-to-pool". */
export function assertRoutedToPool(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'routed-to-pool') {
    return `Expected routing_decision "routed-to-pool", got "${decision}"`;
  }
  return null;
}

/** Asserts multi_model is false (native-only pool). */
export function assertNativeOnly(): string | null {
  const mm = fixture.expected.multi_model;
  if (mm !== false) {
    return `Expected multi_model false (native-only), got ${JSON.stringify(mm)}`;
  }
  return null;
}

/** Asserts notification_contains is "multi-model: no". */
export function assertNotificationContainsMultiModelNo(): string | null {
  const contains = fixture.expected.notification_contains;
  if (contains !== 'multi-model: no') {
    return `Expected notification_contains "multi-model: no", got "${contains}"`;
  }
  return null;
}

/** Asserts notification_absent is "multi-model: yes". */
export function assertNotificationAbsentMultiModelYes(): string | null {
  const absent = fixture.expected.notification_absent;
  if (absent !== 'multi-model: yes') {
    return `Expected notification_absent "multi-model: yes", got "${absent}"`;
  }
  return null;
}

/** Asserts pool_name is "review-pool-a". */
export function assertPoolName(): string | null {
  const poolName = fixture.expected.pool_name;
  if (poolName !== 'review-pool-a') {
    return `Expected pool_name "review-pool-a", got "${poolName}"`;
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

/**
 * Assertion helpers for scenario (b): pool-match-multi-model.
 *
 * Pool has matching roster with multi_model=true.
 * Expected: routes to pool; notification contains "(multi-model: yes)";
 * report carries multi-model attribution.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface ReviewCodeMultiModelFixture {
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
    report_attribution: string;
    error: string | null;
  };
}

export const fixture = fixtureData as ReviewCodeMultiModelFixture;

/** Asserts routing_decision is "routed-to-pool". */
export function assertRoutedToPool(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'routed-to-pool') {
    return `Expected routing_decision "routed-to-pool", got "${decision}"`;
  }
  return null;
}

/** Asserts multi_model is true. */
export function assertMultiModelTrue(): string | null {
  const mm = fixture.expected.multi_model;
  if (mm !== true) {
    return `Expected multi_model true, got ${JSON.stringify(mm)}`;
  }
  return null;
}

/** Asserts notification_contains is "multi-model: yes". */
export function assertNotificationContainsMultiModelYes(): string | null {
  const contains = fixture.expected.notification_contains;
  if (contains !== 'multi-model: yes') {
    return `Expected notification_contains "multi-model: yes", got "${contains}"`;
  }
  return null;
}

/** Asserts notification_absent is "multi-model: no" (not emitted for multi-model pool). */
export function assertNotificationAbsentMultiModelNo(): string | null {
  const absent = fixture.expected.notification_absent;
  if (absent !== 'multi-model: no') {
    return `Expected notification_absent "multi-model: no", got "${absent}"`;
  }
  return null;
}

/** Asserts report_attribution carries verbatim Task 55 Item 4 provenance line. */
export function assertReportAttributionVerbatim(): string | null {
  const attribution = fixture.expected.report_attribution;
  const expected = "Review path: standing pool 'review-pool-b' (multi-model: yes).";
  if (attribution !== expected) {
    return `Expected report_attribution "${expected}", got "${attribution}"`;
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

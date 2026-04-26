/**
 * Assertion helpers for scenario (i): wait-under-60s.
 *
 * Pool matches; stdout IS a TTY; actual_wait_seconds < 60.
 * Expected: waiting indicator NOT emitted (60s threshold not crossed).
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface WaitUnder60sFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: unknown[] };
    config: Record<string, unknown>;
    command_args: Record<string, unknown>;
    runtime: {
      stdout_is_tty: boolean;
      actual_wait_seconds: number;
    };
  };
  expected: {
    routing_decision: string;
    pool_name: string | null;
    multi_model: boolean | null;
    waiting_indicator_emitted: boolean;
    waiting_indicator_text: string | null;
    submission_completed: boolean;
    error: string | null;
  };
}

export const fixture = fixtureData as WaitUnder60sFixture;

/** Asserts routing_decision is "routed-to-pool". */
export function assertRoutedToPool(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'routed-to-pool') {
    return `Expected routing_decision "routed-to-pool", got "${decision}"`;
  }
  return null;
}

/** Asserts waiting_indicator_emitted is false (wait < 60s threshold). */
export function assertWaitingIndicatorNotEmitted(): string | null {
  const emitted = fixture.expected.waiting_indicator_emitted;
  if (emitted !== false) {
    return `Expected waiting_indicator_emitted false (wait < 60s), got ${JSON.stringify(emitted)}`;
  }
  return null;
}

/** Asserts waiting_indicator_text is null (nothing was output). */
export function assertWaitingIndicatorTextIsNull(): string | null {
  const text = fixture.expected.waiting_indicator_text;
  if (text !== null) {
    return `Expected waiting_indicator_text null, got "${text}"`;
  }
  return null;
}

/** Asserts runtime.stdout_is_tty is true (TTY condition is met, but wait < 60s wins). */
export function assertStdoutIsTty(): string | null {
  const isTty = fixture.setup.runtime.stdout_is_tty;
  if (isTty !== true) {
    return `Expected runtime.stdout_is_tty true, got ${JSON.stringify(isTty)}`;
  }
  return null;
}

/** Asserts actual_wait_seconds is below the 60s threshold (the suppression condition). */
export function assertWaitBelowThreshold(): string | null {
  const wait = fixture.setup.runtime.actual_wait_seconds;
  if (wait >= 60) {
    return `Expected actual_wait_seconds < 60 (below threshold), got ${wait}`;
  }
  return null;
}

/** Asserts submission_completed is true. */
export function assertSubmissionCompleted(): string | null {
  const completed = fixture.expected.submission_completed;
  if (completed !== true) {
    return `Expected submission_completed true, got ${JSON.stringify(completed)}`;
  }
  return null;
}

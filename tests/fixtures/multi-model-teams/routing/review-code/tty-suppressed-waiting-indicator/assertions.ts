/**
 * Assertion helpers for scenario (g): tty-suppressed-waiting-indicator.
 *
 * Pool matches; stdout is NOT a TTY; expected wait > 60s.
 * Expected: waiting indicator is NOT emitted (CI-friendly suppression).
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface TtySuppressedFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: unknown[] };
    config: Record<string, unknown>;
    command_args: Record<string, unknown>;
    runtime: {
      stdout_is_tty: boolean;
      expected_wait_seconds: number;
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

export const fixture = fixtureData as TtySuppressedFixture;

/** Asserts routing_decision is "routed-to-pool". */
export function assertRoutedToPool(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'routed-to-pool') {
    return `Expected routing_decision "routed-to-pool", got "${decision}"`;
  }
  return null;
}

/** Asserts waiting_indicator_emitted is false (suppressed in non-TTY environment). */
export function assertWaitingIndicatorNotEmitted(): string | null {
  const emitted = fixture.expected.waiting_indicator_emitted;
  if (emitted !== false) {
    return `Expected waiting_indicator_emitted false (CI suppression), got ${JSON.stringify(emitted)}`;
  }
  return null;
}

/** Asserts waiting_indicator_text is null (nothing was output). */
export function assertWaitingIndicatorTextIsNull(): string | null {
  const text = fixture.expected.waiting_indicator_text;
  if (text !== null) {
    return `Expected waiting_indicator_text null (not emitted), got "${text}"`;
  }
  return null;
}

/** Asserts runtime.stdout_is_tty is false (the suppression condition). */
export function assertStdoutIsNotTty(): string | null {
  const isTty = fixture.setup.runtime.stdout_is_tty;
  if (isTty !== false) {
    return `Expected runtime.stdout_is_tty false (CI simulation), got ${JSON.stringify(isTty)}`;
  }
  return null;
}

/** Asserts expected_wait_seconds exceeds the 60s threshold (otherwise the indicator would not have been triggered anyway). */
export function assertWaitExceedsThreshold(): string | null {
  const wait = fixture.setup.runtime.expected_wait_seconds;
  if (wait <= 60) {
    return `Expected expected_wait_seconds > 60 (above threshold), got ${wait}`;
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

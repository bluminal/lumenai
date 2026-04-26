/**
 * Assertion helpers for scenario (h): waiting-indicator-tty.
 *
 * Pool matches; stdout IS a TTY; expected wait > 60s.
 * Expected: waiting indicator IS emitted with verbatim Task 55 Item 3 text.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface WaitingIndicatorTtyFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: unknown[] };
    config: Record<string, unknown>;
    command_args: Record<string, unknown>;
    runtime: {
      stdout_is_tty: boolean;
      expected_wait_seconds: number;
      indicator_interval_seconds: number;
    };
  };
  expected: {
    routing_decision: string;
    pool_name: string | null;
    multi_model: boolean | null;
    waiting_indicator_emitted: boolean;
    waiting_indicator_verbatim_template: string;
    waiting_indicator_sample: string;
    indicator_interval_seconds: number;
    submission_completed: boolean;
    error: string | null;
  };
}

export const fixture = fixtureData as WaitingIndicatorTtyFixture;

/** Asserts routing_decision is "routed-to-pool". */
export function assertRoutedToPool(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'routed-to-pool') {
    return `Expected routing_decision "routed-to-pool", got "${decision}"`;
  }
  return null;
}

/** Asserts waiting_indicator_emitted is true (TTY, wait > 60s). */
export function assertWaitingIndicatorEmitted(): string | null {
  const emitted = fixture.expected.waiting_indicator_emitted;
  if (emitted !== true) {
    return `Expected waiting_indicator_emitted true (TTY + wait > 60s), got ${JSON.stringify(emitted)}`;
  }
  return null;
}

/** Asserts verbatim template matches Task 55 Item 3 exactly. */
export function assertVerbatimTemplate(): string | null {
  const template = fixture.expected.waiting_indicator_verbatim_template;
  const expected = "Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete...";
  if (template !== expected) {
    return (
      `Waiting indicator template does not match Task 55 Item 3 verbatim.\n` +
      `Expected: "${expected}"\n` +
      `Got: "${template}"`
    );
  }
  return null;
}

/** Asserts sample indicator text includes pool name and task progress pattern. */
export function assertSampleIndicatorText(): string | null {
  const sample = fixture.expected.waiting_indicator_sample;
  if (!sample.includes("review-pool-tty")) {
    return `Indicator sample missing pool name "review-pool-tty": "${sample}"`;
  }
  if (!sample.includes('working:')) {
    return `Indicator sample missing "working:": "${sample}"`;
  }
  if (!sample.includes('tasks complete...')) {
    return `Indicator sample missing "tasks complete...": "${sample}"`;
  }
  return null;
}

/** Asserts runtime.stdout_is_tty is true (TTY condition). */
export function assertStdoutIsTty(): string | null {
  const isTty = fixture.setup.runtime.stdout_is_tty;
  if (isTty !== true) {
    return `Expected runtime.stdout_is_tty true (TTY environment), got ${JSON.stringify(isTty)}`;
  }
  return null;
}

/** Asserts expected_wait_seconds exceeds the 60s threshold. */
export function assertWaitExceedsThreshold(): string | null {
  const wait = fixture.setup.runtime.expected_wait_seconds;
  if (wait <= 60) {
    return `Expected expected_wait_seconds > 60, got ${wait}`;
  }
  return null;
}

/** Asserts indicator_interval_seconds is 30. */
export function assertIndicatorInterval(): string | null {
  const interval = fixture.expected.indicator_interval_seconds;
  if (interval !== 30) {
    return `Expected indicator_interval_seconds 30, got ${interval}`;
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

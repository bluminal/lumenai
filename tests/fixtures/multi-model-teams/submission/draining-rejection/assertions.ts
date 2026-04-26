/**
 * Assertion helpers for the draining-rejection submission fixture.
 *
 * Scenario: pool transitions to draining between inline discovery and
 * submitter invocation. Submitter re-reads config.json, detects
 * pool_state: draining, and returns fell-back-pool-draining without
 * writing any task files or mailbox notifications.
 *
 * Layer 2 fixture for FR-MMT14a — draining-state submission semantics.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

// ── Fixture shape ─────────────────────────────────────────────────────────────

export interface DrainingRejectionFixture {
  scenario: string;
  description: string;
  setup: {
    pool_name: string;
    pool_roster: string[];
    index_state: {
      pool_state: string;
      note: string;
    };
    config_json_state: {
      pool_state: string;
      note: string;
    };
  };
  submitter_inputs: {
    pool_name: string;
    tasks: Array<{ subject: string; description: string }>;
    submission_timeout_seconds: number;
  };
  submitter_outputs: {
    routing_decision: string;
  };
  expected: {
    routing_decision: string;
    task_files_written: boolean;
    mailbox_notification_sent: boolean;
    drain_check_exercised: boolean;
    config_reread: boolean;
    note: string;
  };
}

export const fixture = fixtureData as DrainingRejectionFixture;

// ── Assertion helpers ─────────────────────────────────────────────────────────

/**
 * Asserts expected.routing_decision is "fell-back-pool-draining".
 * Returns null on pass, error string on failure.
 */
export function assertRoutingDecisionIsDraining(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'fell-back-pool-draining') {
    return `Expected routing_decision "fell-back-pool-draining", got "${decision}"`;
  }
  return null;
}

/**
 * Asserts submitter_outputs.routing_decision matches expected.routing_decision.
 * Returns null on pass, error string on failure.
 */
export function assertSubmitterOutputMatchesExpected(): string | null {
  const output = fixture.submitter_outputs.routing_decision;
  const expected = fixture.expected.routing_decision;
  if (output !== expected) {
    return `submitter_outputs.routing_decision "${output}" does not match expected.routing_decision "${expected}"`;
  }
  return null;
}

/**
 * Asserts expected.task_files_written is false.
 * Returns null on pass, error string on failure.
 */
export function assertNoTaskFilesWritten(): string | null {
  if (fixture.expected.task_files_written !== false) {
    return `Expected task_files_written false (no writes when draining), got ${fixture.expected.task_files_written}`;
  }
  return null;
}

/**
 * Asserts expected.mailbox_notification_sent is false.
 * Returns null on pass, error string on failure.
 */
export function assertNoMailboxNotification(): string | null {
  if (fixture.expected.mailbox_notification_sent !== false) {
    return `Expected mailbox_notification_sent false (no notification when draining), got ${fixture.expected.mailbox_notification_sent}`;
  }
  return null;
}

/**
 * Asserts expected.drain_check_exercised is true.
 * Returns null on pass, error string on failure.
 */
export function assertDrainCheckExercised(): string | null {
  if (fixture.expected.drain_check_exercised !== true) {
    return `Expected drain_check_exercised true (Step 1 must run), got ${fixture.expected.drain_check_exercised}`;
  }
  return null;
}

/**
 * Asserts expected.config_reread is true.
 * Returns null on pass, error string on failure.
 */
export function assertConfigWasReread(): string | null {
  if (fixture.expected.config_reread !== true) {
    return `Expected config_reread true (submitter re-reads config.json, not index), got ${fixture.expected.config_reread}`;
  }
  return null;
}

/**
 * Asserts the race condition is correctly modeled:
 * index_state.pool_state is "idle" AND config_json_state.pool_state is "draining".
 * Returns null on pass, error string on failure.
 */
export function assertRaceConditionModeled(): string | null {
  const indexState = fixture.setup.index_state.pool_state;
  const configState = fixture.setup.config_json_state.pool_state;

  if (indexState !== 'idle') {
    return `Expected index_state.pool_state "idle" (stale snapshot), got "${indexState}"`;
  }
  if (configState !== 'draining') {
    return `Expected config_json_state.pool_state "draining" (real state), got "${configState}"`;
  }
  return null;
}

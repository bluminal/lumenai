/**
 * Assertion helpers for scenario: timeout-fallback.
 *
 * Standing-pool-submitter polls for report but pool times out before responding.
 * Tasks are marked abandoned; command falls back to fresh-spawn review.
 *
 * Expected: routing_decision = "fell-back-timeout"; tasks_marked_abandoned = true;
 * verbatim_timeout_note matches FR-MMT16a §3.4 pattern; fresh_spawn_triggered = true.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

// ── Fixture shape ────────────────────────────────────────────────

export interface TimeoutFallbackSetup {
  pool_name: string;
  pool_roster: string[];
  pool_state: string;
  submission_timeout_seconds: number;
  submitted_tasks: Array<{ subject: string; description: string }>;
  pool_response: string;
  elapsed_seconds: number;
}

export interface TimeoutFallbackSubmitterOutputs {
  routing_decision: string;
}

export interface TimeoutFallbackExpected {
  routing_decision: string;
  tasks_marked_abandoned: boolean;
  verbatim_timeout_note: string;
  fresh_spawn_triggered: boolean;
}

export interface TimeoutFallbackFixture {
  scenario: string;
  description: string;
  setup: TimeoutFallbackSetup;
  submitter_outputs: TimeoutFallbackSubmitterOutputs;
  expected: TimeoutFallbackExpected;
}

export const fixture = fixtureData as TimeoutFallbackFixture;

// ── Assertion helpers ─────────────────────────────────────────────

/**
 * Asserts routing_decision is "fell-back-timeout" in expected outputs.
 * Returns an error string on failure, null on success.
 */
export function assertFellBackTimeout(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'fell-back-timeout') {
    return `Expected routing_decision "fell-back-timeout", got "${decision}"`;
  }
  return null;
}

/**
 * Asserts submitter_outputs.routing_decision matches expected.routing_decision.
 * Returns an error string on failure, null on success.
 */
export function assertSubmitterOutputMatchesExpected(): string | null {
  const actual = fixture.submitter_outputs.routing_decision;
  const expected = fixture.expected.routing_decision;
  if (actual !== expected) {
    return `submitter_outputs.routing_decision "${actual}" does not match expected.routing_decision "${expected}"`;
  }
  return null;
}

/**
 * Asserts tasks_marked_abandoned is true.
 * Returns an error string on failure, null on success.
 */
export function assertTasksMarkedAbandoned(): string | null {
  const abandoned = fixture.expected.tasks_marked_abandoned;
  if (abandoned !== true) {
    return `Expected tasks_marked_abandoned true, got ${JSON.stringify(abandoned)}`;
  }
  return null;
}

/**
 * Asserts fresh_spawn_triggered is true.
 * Returns an error string on failure, null on success.
 */
export function assertFreshSpawnTriggered(): string | null {
  const triggered = fixture.expected.fresh_spawn_triggered;
  if (triggered !== true) {
    return `Expected fresh_spawn_triggered true, got ${JSON.stringify(triggered)}`;
  }
  return null;
}

/**
 * Asserts verbatim_timeout_note matches the FR-MMT16a §3.4 pattern:
 *   "Pool '{name}' did not return a report within {timeout}s; falling back to fresh-spawn review."
 *
 * Validates that the note correctly substitutes pool_name and submission_timeout_seconds.
 * Returns an error string on failure, null on success.
 */
export function assertVerbatimTimeoutNote(): string | null {
  const note = fixture.expected.verbatim_timeout_note;
  const poolName = fixture.setup.pool_name;
  const timeout = fixture.setup.submission_timeout_seconds;

  const expected = `Pool '${poolName}' did not return a report within ${timeout}s; falling back to fresh-spawn review.`;
  if (note !== expected) {
    return `Expected verbatim_timeout_note:\n  "${expected}"\ngot:\n  "${note}"`;
  }
  return null;
}

/**
 * Asserts the fixture is internally consistent: elapsed_seconds > submission_timeout_seconds.
 * Returns an error string on failure, null on success.
 */
export function assertElapsedExceedsTimeout(): string | null {
  const elapsed = fixture.setup.elapsed_seconds;
  const timeout = fixture.setup.submission_timeout_seconds;
  if (elapsed <= timeout) {
    return `Fixture consistency error: elapsed_seconds (${elapsed}) must be > submission_timeout_seconds (${timeout})`;
  }
  return null;
}

/**
 * Asserts pool_response is "none" — the pool never returned a report envelope.
 * Returns an error string on failure, null on success.
 */
export function assertPoolResponseIsNone(): string | null {
  const response = fixture.setup.pool_response;
  if (response !== 'none') {
    return `Expected pool_response "none" (no report returned), got "${response}"`;
  }
  return null;
}

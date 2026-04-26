/**
 * Assertion helpers for scenario (d): roster-mismatch-fallback.
 *
 * Pool exists with roster [performance-engineer], missing required reviewers.
 * Expected: routing_decision = "fell-back-roster-mismatch"; falls back silently.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface RosterMismatchFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: Array<{ name: string; roster: string[]; pool_state: string; multi_model: boolean; last_active_at: string; ttl_minutes: number; metadata_dir: string }> };
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

export const fixture = fixtureData as RosterMismatchFixture;

/** Asserts routing_decision is "fell-back-roster-mismatch". */
export function assertFellBackRosterMismatch(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'fell-back-roster-mismatch') {
    return `Expected routing_decision "fell-back-roster-mismatch", got "${decision}"`;
  }
  return null;
}

/** Asserts audit_decision is "fell-back-roster-mismatch". */
export function assertAuditDecision(): string | null {
  const audit = fixture.expected.audit_decision;
  if (audit !== 'fell-back-roster-mismatch') {
    return `Expected audit_decision "fell-back-roster-mismatch", got "${audit}"`;
  }
  return null;
}

/** Asserts pool_name is null (no matching pool was selected). */
export function assertPoolNameIsNull(): string | null {
  const poolName = fixture.expected.pool_name;
  if (poolName !== null) {
    return `Expected pool_name null, got "${poolName}"`;
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

/** Asserts the mismatched pool has roster [performance-engineer] (verifies the setup condition). */
export function assertMismatchedRoster(): string | null {
  const pools = fixture.setup.index_json.pools;
  if (pools.length !== 1) {
    return `Expected exactly 1 pool in setup, got ${pools.length}`;
  }
  const pool = pools[0];
  if (pool.roster.length !== 1 || pool.roster[0] !== 'performance-engineer') {
    return `Expected roster ["performance-engineer"], got ${JSON.stringify(pool.roster)}`;
  }
  return null;
}

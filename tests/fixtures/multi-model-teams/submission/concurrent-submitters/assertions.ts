/**
 * Assertion helpers for the concurrent-submitters fixture.
 *
 * These are typed assertion helpers — NOT runnable Vitest tests.
 * They are imported and called by tests/schemas/concurrent-submitters-fixture.test.ts.
 *
 * Validates the concurrent-submitter scenario:
 *   - UUID-based report_to paths are distinct between sessions (no collision)
 *   - report_uuids are distinct
 *   - task_uuids from session_a and session_b do not overlap
 *   - expected block flags are all true
 *   - fr_mmt18_documented_behavior is a non-empty string
 */

import type { ValidationResult } from '../../../schemas/standing-pool-cleanup.js';

// ── Fixture shape types ──────────────────────────────────────────

interface SessionFixture {
  report_uuid: string;
  task_uuids: string[];
  report_to: string;
  submitted_at: string;
}

interface ConcurrentSubmittersExpected {
  session_a_report_to_unique: boolean;
  session_b_report_to_unique: boolean;
  report_to_paths_differ: boolean;
  task_uuids_no_overlap: boolean;
  both_sessions_complete: boolean;
  no_report_collision: boolean;
  pool_serializes_work: boolean;
  fr_mmt18_documented_behavior: string;
}

interface ConcurrentSubmittersFixture {
  scenario: string;
  description: string;
  setup: {
    pool_name: string;
    pool_roster: string[];
    pool_state: string;
  };
  session_a: SessionFixture;
  session_b: SessionFixture;
  expected: ConcurrentSubmittersExpected;
}

// ── Type guards ──────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

// ── Top-level fixture structure validator ────────────────────────

/**
 * Validates the top-level structure of the concurrent-submitters fixture.
 * Checks all required top-level keys are present with correct shapes.
 *
 * Returns a ValidationResult compatible with the standing-pool-cleanup schema type.
 */
export function assertConcurrentSubmittersFixture(fixture: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(fixture)) {
    errors.push('Fixture must be a non-null JSON object');
    return { valid: false, errors };
  }

  // Required top-level string fields
  for (const key of ['scenario', 'description'] as const) {
    if (!isNonEmptyString(fixture[key])) {
      errors.push(`Missing or empty required field: "${key}"`);
    }
  }

  // Required top-level object fields
  for (const key of ['setup', 'session_a', 'session_b', 'expected'] as const) {
    if (!isObject(fixture[key])) {
      errors.push(`Missing or non-object required field: "${key}"`);
    }
  }

  // Validate each session block
  for (const sessionKey of ['session_a', 'session_b'] as const) {
    const session = fixture[sessionKey] as Record<string, unknown> | undefined;
    if (isObject(session)) {
      if (!isNonEmptyString(session['report_uuid'])) {
        errors.push(`${sessionKey}.report_uuid must be a non-empty string`);
      }
      if (!isNonEmptyString(session['report_to'])) {
        errors.push(`${sessionKey}.report_to must be a non-empty string`);
      }
      if (!Array.isArray(session['task_uuids']) || (session['task_uuids'] as unknown[]).length === 0) {
        errors.push(`${sessionKey}.task_uuids must be a non-empty array`);
      }
      if (!isNonEmptyString(session['submitted_at'])) {
        errors.push(`${sessionKey}.submitted_at must be a non-empty string`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── report_to isolation assertions ───────────────────────────────

/**
 * Asserts that session_a.report_to and session_b.report_to are different strings.
 * This is the core no-collision guarantee: each session's report is written to a
 * unique path, so the Pool Lead cannot overwrite one session's report with the other's.
 *
 * Returns null on pass, error string on fail.
 */
export function assertReportToPathsDiffer(fixture: ConcurrentSubmittersFixture): string | null {
  const pathA = fixture.session_a.report_to;
  const pathB = fixture.session_b.report_to;
  if (pathA === pathB) {
    return (
      `session_a.report_to and session_b.report_to must be different paths (no-collision guarantee).\n` +
      `  Both are: "${pathA}"`
    );
  }
  return null;
}

/**
 * Asserts that session_a.report_uuid and session_b.report_uuid are different strings.
 * The distinct UUIDs are what make the report_to paths distinct.
 *
 * Returns null on pass, error string on fail.
 */
export function assertReportUuidsDiffer(fixture: ConcurrentSubmittersFixture): string | null {
  const uuidA = fixture.session_a.report_uuid;
  const uuidB = fixture.session_b.report_uuid;
  if (uuidA === uuidB) {
    return (
      `session_a.report_uuid and session_b.report_uuid must be different.\n` +
      `  Both are: "${uuidA}"`
    );
  }
  return null;
}

// ── task_uuids no-overlap assertion ──────────────────────────────

/**
 * Asserts that session_a.task_uuids and session_b.task_uuids share no UUIDs.
 * Each submitter generates fresh task UUIDs per submission (FR-MMT16 §2).
 * An overlap would indicate a UUID collision, which should never occur with UUID v4.
 *
 * Returns null on pass, error string on fail.
 */
export function assertTaskUuidsNoOverlap(fixture: ConcurrentSubmittersFixture): string | null {
  const setA = new Set(fixture.session_a.task_uuids);
  const overlap = fixture.session_b.task_uuids.filter(uuid => setA.has(uuid));
  if (overlap.length > 0) {
    return (
      `session_a.task_uuids and session_b.task_uuids must not overlap.\n` +
      `  Overlapping UUIDs: ${overlap.join(', ')}`
    );
  }
  return null;
}

// ── expected block assertions ────────────────────────────────────

/**
 * Asserts that expected.report_to_paths_differ is true.
 * Returns null on pass, error string on fail.
 */
export function assertExpectedReportToPathsDiffer(fixture: ConcurrentSubmittersFixture): string | null {
  if (fixture.expected.report_to_paths_differ !== true) {
    return `expected.report_to_paths_differ: expected true, got ${fixture.expected.report_to_paths_differ}`;
  }
  return null;
}

/**
 * Asserts that expected.no_report_collision is true.
 * Returns null on pass, error string on fail.
 */
export function assertExpectedNoReportCollision(fixture: ConcurrentSubmittersFixture): string | null {
  if (fixture.expected.no_report_collision !== true) {
    return `expected.no_report_collision: expected true, got ${fixture.expected.no_report_collision}`;
  }
  return null;
}

/**
 * Asserts that expected.pool_serializes_work is true.
 * Returns null on pass, error string on fail.
 */
export function assertExpectedPoolSerializesWork(fixture: ConcurrentSubmittersFixture): string | null {
  if (fixture.expected.pool_serializes_work !== true) {
    return `expected.pool_serializes_work: expected true, got ${fixture.expected.pool_serializes_work}`;
  }
  return null;
}

/**
 * Asserts that expected.fr_mmt18_documented_behavior is a non-empty string.
 * This field documents that non-deterministic completion order is intentional (FR-MMT18).
 *
 * Returns null on pass, error string on fail.
 */
export function assertFrMmt18DocumentedBehavior(fixture: ConcurrentSubmittersFixture): string | null {
  const val = fixture.expected.fr_mmt18_documented_behavior;
  if (typeof val !== 'string' || val.length === 0) {
    return `expected.fr_mmt18_documented_behavior must be a non-empty string (FR-MMT18 is documented behavior)`;
  }
  return null;
}

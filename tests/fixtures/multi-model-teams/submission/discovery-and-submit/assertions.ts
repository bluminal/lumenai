/**
 * Assertion helpers for the discovery-and-submit fixture.
 *
 * These are typed assertion helpers — NOT runnable Vitest tests.
 * They are imported and called by tests/schemas/submission-fixture.test.ts.
 *
 * Validates the full discovery-and-submit flow:
 *   - Routing decision is "routed-to-pool"
 *   - Submitter is invoked with correct inputs
 *   - Tasks written atomically (.tmp + rename documented in submitter)
 *   - Envelope shape is correct (status, report, error, metadata)
 *   - Notification and provenance line verbatim text
 */

import type { ValidationResult } from '../../../schemas/standing-pool-cleanup.js';

// ── Fixture shape types ──────────────────────────────────────────

interface SubmittedTask {
  subject: string;
  description: string;
}

interface SubmitterInputs {
  pool_name: string;
  tasks: SubmittedTask[];
  submission_timeout_seconds: number;
}

interface EnvelopeMetadata {
  pool_name: string;
  multi_model: boolean;
  task_uuids: string[];
  completed_at: string;
}

interface SubmitterOutputs {
  status: 'success' | 'failed';
  report: string | null;
  error: { code: string; message: string } | null;
  metadata: EnvelopeMetadata;
}

interface FixtureExpected {
  routing_decision: string;
  pool_name: string;
  multi_model: boolean;
  submitter_invoked: boolean;
  tasks_submitted_count: number;
  envelope_status: string;
  report_surfaced: boolean;
  notification_contains: string;
  provenance_line: string;
}

interface DiscoveryAndSubmitFixture {
  scenario: string;
  description: string;
  setup: {
    pool_name: string;
    pool_roster: string[];
    pool_state: string;
    multi_model: boolean;
    last_active_at: string;
    ttl_minutes: number;
    routing_mode: string;
    matching_mode: string;
    submission_timeout_seconds: number;
    required_reviewer_set: string[];
    submitted_tasks: SubmittedTask[];
  };
  submitter_inputs: SubmitterInputs;
  submitter_outputs: SubmitterOutputs;
  expected: FixtureExpected;
}

// ── Type guard ───────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

// ── Top-level fixture structure validator ───────────────────────

/**
 * Validates the top-level structure of the discovery-and-submit fixture.
 * Checks all required top-level keys are present with correct shapes.
 *
 * Returns a ValidationResult compatible with the standing-pool-cleanup schema type.
 */
export function assertDiscoveryAndSubmitFixture(fixture: unknown): ValidationResult {
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
  for (const key of ['setup', 'submitter_inputs', 'submitter_outputs', 'expected'] as const) {
    if (!isObject(fixture[key])) {
      errors.push(`Missing or non-object required field: "${key}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── expected block assertions ────────────────────────────────────

/**
 * Asserts that expected.routing_decision is "routed-to-pool".
 * Returns null on pass, error string on fail.
 */
export function assertRoutingDecisionIsRoutedToPool(fixture: DiscoveryAndSubmitFixture): string | null {
  const actual = fixture.expected.routing_decision;
  if (actual !== 'routed-to-pool') {
    return `expected.routing_decision: expected "routed-to-pool", got "${actual}"`;
  }
  return null;
}

/**
 * Asserts that expected.submitter_invoked is true.
 * Returns null on pass, error string on fail.
 */
export function assertSubmitterInvoked(fixture: DiscoveryAndSubmitFixture): string | null {
  if (fixture.expected.submitter_invoked !== true) {
    return `expected.submitter_invoked: expected true, got ${fixture.expected.submitter_invoked}`;
  }
  return null;
}

/**
 * Asserts that expected.tasks_submitted_count is 2.
 * Returns null on pass, error string on fail.
 */
export function assertTasksSubmittedCount(fixture: DiscoveryAndSubmitFixture): string | null {
  const count = fixture.expected.tasks_submitted_count;
  if (count !== 2) {
    return `expected.tasks_submitted_count: expected 2, got ${count}`;
  }
  return null;
}

/**
 * Asserts that expected.envelope_status is "success".
 * Returns null on pass, error string on fail.
 */
export function assertEnvelopeStatus(fixture: DiscoveryAndSubmitFixture): string | null {
  const status = fixture.expected.envelope_status;
  if (status !== 'success') {
    return `expected.envelope_status: expected "success", got "${status}"`;
  }
  return null;
}

/**
 * Asserts that expected.notification_contains matches the verbatim routing
 * notification for this pool: "Routing to standing pool '{pool_name}' (multi-model: no)."
 *
 * The pool_name in the notification must match expected.pool_name.
 * Returns null on pass, error string on fail.
 */
export function assertNotificationText(fixture: DiscoveryAndSubmitFixture): string | null {
  const poolName = fixture.expected.pool_name;
  const expected = `Routing to standing pool '${poolName}' (multi-model: no).`;
  const actual = fixture.expected.notification_contains;
  if (actual !== expected) {
    return (
      `expected.notification_contains verbatim mismatch.\n` +
      `  Expected: "${expected}"\n` +
      `  Got:      "${actual}"`
    );
  }
  return null;
}

/**
 * Asserts that expected.provenance_line matches the verbatim provenance
 * line per NFR-MMT7 Item 4: "Review path: standing pool '{pool_name}' (multi-model: no)."
 *
 * The pool_name in the line must match expected.pool_name.
 * Returns null on pass, error string on fail.
 */
export function assertProvenanceLine(fixture: DiscoveryAndSubmitFixture): string | null {
  const poolName = fixture.expected.pool_name;
  const expected = `Review path: standing pool '${poolName}' (multi-model: no).`;
  const actual = fixture.expected.provenance_line;
  if (actual !== expected) {
    return (
      `expected.provenance_line verbatim mismatch.\n` +
      `  Expected: "${expected}"\n` +
      `  Got:      "${actual}"`
    );
  }
  return null;
}

// ── submitter_inputs assertions ──────────────────────────────────

/**
 * Asserts that submitter_inputs.tasks is a non-empty array.
 * Returns null on pass, error string on fail.
 */
export function assertSubmitterInputTasksNonEmpty(fixture: DiscoveryAndSubmitFixture): string | null {
  const tasks = fixture.submitter_inputs.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return `submitter_inputs.tasks must be a non-empty array`;
  }
  return null;
}

/**
 * Asserts that submitter_inputs.pool_name matches expected.pool_name.
 * Returns null on pass, error string on fail.
 */
export function assertSubmitterInputPoolName(fixture: DiscoveryAndSubmitFixture): string | null {
  const expected = fixture.expected.pool_name;
  const actual = fixture.submitter_inputs.pool_name;
  if (actual !== expected) {
    return `submitter_inputs.pool_name: expected "${expected}", got "${actual}"`;
  }
  return null;
}

// ── submitter_outputs (envelope) assertions ──────────────────────

/**
 * Validates the submitter_outputs envelope shape per FR-MMT16a output contract.
 *
 * Required fields:
 *   - status: "success" | "failed"
 *   - report: string | null
 *   - error: { code: string, message: string } | null
 *   - metadata: { pool_name, multi_model, task_uuids, completed_at }
 *
 * Returns a ValidationResult.
 */
export function assertEnvelopeShape(fixture: DiscoveryAndSubmitFixture): ValidationResult {
  const errors: string[] = [];
  const out = fixture.submitter_outputs;

  // status
  if (out.status !== 'success' && out.status !== 'failed') {
    errors.push(
      `submitter_outputs.status must be "success" or "failed", got: "${out.status}"`
    );
  }

  // report: string or null
  if (out.report !== null && typeof out.report !== 'string') {
    errors.push(
      `submitter_outputs.report must be a string or null, got: ${typeof out.report}`
    );
  }

  // error: object or null
  if (out.error !== null) {
    if (!isObject(out.error)) {
      errors.push('submitter_outputs.error must be null or a { code, message } object');
    } else {
      if (!isNonEmptyString((out.error as Record<string, unknown>)['code'])) {
        errors.push('submitter_outputs.error.code must be a non-empty string');
      }
      if (!isNonEmptyString((out.error as Record<string, unknown>)['message'])) {
        errors.push('submitter_outputs.error.message must be a non-empty string');
      }
    }
  }

  // metadata
  if (!isObject(out.metadata)) {
    errors.push('submitter_outputs.metadata must be a non-null object');
  } else {
    const meta = out.metadata as unknown as Record<string, unknown>;

    if (!isNonEmptyString(meta['pool_name'])) {
      errors.push('submitter_outputs.metadata.pool_name must be a non-empty string');
    }
    if (typeof meta['multi_model'] !== 'boolean') {
      errors.push('submitter_outputs.metadata.multi_model must be a boolean');
    }
    if (!Array.isArray(meta['task_uuids']) || (meta['task_uuids'] as unknown[]).length === 0) {
      errors.push('submitter_outputs.metadata.task_uuids must be a non-empty array');
    }
    if (!isNonEmptyString(meta['completed_at'])) {
      errors.push('submitter_outputs.metadata.completed_at must be a non-empty string');
    }
  }

  return { valid: errors.length === 0, errors };
}

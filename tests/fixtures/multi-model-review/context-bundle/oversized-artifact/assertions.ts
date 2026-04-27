/**
 * Typed assertion helpers for the oversized-artifact context-bundle fixture.
 *
 * These are typed validation functions — NOT runnable Vitest tests.
 * They are imported and called by tests/schemas/context-bundle-fixtures.test.ts.
 *
 * Scenario: artifact (250 KB) alone exceeds max_bundle_bytes (200000).
 * Assembler MUST emit narrow_scope_required immediately — same error path as
 * artifact-as-largest-file, but triggered by the bundle-cap breach rather than
 * the per-file-cap breach.
 */

import type { ValidationResult } from '../../../schemas/context-bundle.js';

// ── Fixture shape types ──────────────────────────────────────────────────────

interface ErrorAssemblerOutput {
  status: 'error';
  error_code: string;
  error_message: string;
  manifest: null;
  files: never[];
}

interface ExpectedBlock {
  status: 'error';
  error_code: 'narrow_scope_required';
  artifact_size_bytes: number;
  max_bundle_bytes: number;
  artifact_NOT_summarized: boolean;
  behavioral_rule_1_enforced: boolean;
}

export interface OversizedArtifactFixture {
  scenario: string;
  description: string;
  input: {
    artifact_path: string;
    touched_files: string[];
    conventions: string[];
    config: {
      max_bundle_bytes: number;
      max_file_bytes: number;
    };
  };
  expected_assembler_output: ErrorAssemblerOutput;
  expected: ExpectedBlock;
}

// ── Type guard helpers ───────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

// ── Fixture structure validator ──────────────────────────────────────────────

/**
 * Validates the top-level structure of the oversized-artifact fixture.
 * Returns a ValidationResult.
 */
export function assertOversizedArtifactFixtureShape(fixture: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(fixture)) {
    errors.push('Fixture must be a non-null JSON object');
    return { valid: false, errors };
  }

  for (const key of ['scenario', 'description'] as const) {
    if (!isNonEmptyString(fixture[key])) {
      errors.push(`Missing or empty required field: "${key}"`);
    }
  }

  for (const key of ['input', 'expected_assembler_output', 'expected'] as const) {
    if (!isObject(fixture[key])) {
      errors.push(`Missing or non-object required field: "${key}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Error-path assertions ────────────────────────────────────────────────────

/**
 * Asserts that expected.status is "error".
 * Returns null on pass, error string on fail.
 */
export function assertStatusIsError(fixture: OversizedArtifactFixture): string | null {
  if (fixture.expected.status !== 'error') {
    return `expected.status: expected "error", got "${fixture.expected.status}"`;
  }
  return null;
}

/**
 * Asserts that expected.error_code is "narrow_scope_required".
 * Returns null on pass, error string on fail.
 */
export function assertErrorCodeIsNarrowScope(fixture: OversizedArtifactFixture): string | null {
  if (fixture.expected.error_code !== 'narrow_scope_required') {
    return `expected.error_code: expected "narrow_scope_required", got "${fixture.expected.error_code}"`;
  }
  return null;
}

/**
 * Asserts that expected.artifact_NOT_summarized is true (Behavioral Rule 1).
 * Returns null on pass, error string on fail.
 */
export function assertArtifactNotSummarized(fixture: OversizedArtifactFixture): string | null {
  if (fixture.expected.artifact_NOT_summarized !== true) {
    return `expected.artifact_NOT_summarized: expected true (Behavioral Rule 1), got ${fixture.expected.artifact_NOT_summarized}`;
  }
  return null;
}

/**
 * Asserts that expected.behavioral_rule_1_enforced is true.
 * Returns null on pass, error string on fail.
 */
export function assertBehavioralRule1Enforced(fixture: OversizedArtifactFixture): string | null {
  if (fixture.expected.behavioral_rule_1_enforced !== true) {
    return `expected.behavioral_rule_1_enforced: expected true, got ${fixture.expected.behavioral_rule_1_enforced}`;
  }
  return null;
}

/**
 * Asserts that the artifact size exceeds max_bundle_bytes (this fixture's trigger condition).
 * Distinguishes this fixture from artifact-as-largest-file, which triggers on max_file_bytes.
 * Returns null on pass, error string on fail.
 */
export function assertArtifactExceedsBundleCap(fixture: OversizedArtifactFixture): string | null {
  const { artifact_size_bytes, max_bundle_bytes } = fixture.expected;
  if (artifact_size_bytes <= max_bundle_bytes) {
    return (
      `expected.artifact_size_bytes (${artifact_size_bytes}) should exceed ` +
      `expected.max_bundle_bytes (${max_bundle_bytes}) to trigger the bundle-cap error path`
    );
  }
  return null;
}

/**
 * Asserts that expected_assembler_output has the correct narrow_scope_required error shape.
 * Returns a ValidationResult.
 */
export function assertErrorOutputShape(fixture: OversizedArtifactFixture): ValidationResult {
  const errors: string[] = [];
  const out = fixture.expected_assembler_output;

  if (out.status !== 'error') {
    errors.push(`expected_assembler_output.status: expected "error", got "${out.status}"`);
  }
  if (out.error_code !== 'narrow_scope_required') {
    errors.push(
      `expected_assembler_output.error_code: expected "narrow_scope_required", got "${out.error_code}"`
    );
  }
  if (typeof out.error_message !== 'string' || out.error_message.length === 0) {
    errors.push('expected_assembler_output.error_message must be a non-empty string');
  }
  if (out.manifest !== null) {
    errors.push('expected_assembler_output.manifest must be null on error path');
  }
  if (!Array.isArray(out.files) || out.files.length !== 0) {
    errors.push('expected_assembler_output.files must be an empty array on error path');
  }

  return { valid: errors.length === 0, errors };
}

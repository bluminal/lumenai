/**
 * Typed assertion helpers for the oversized-bundle context-bundle fixture.
 *
 * These are typed validation functions — NOT runnable Vitest tests.
 * They are imported and called by tests/schemas/context-bundle-fixtures.test.ts.
 *
 * Scenario: many touched files totaling >500 KB; assembler iteratively summarizes the
 * largest non-artifact files to stay within max_bundle_bytes (200000); artifact (5 KB)
 * remains verbatim throughout.
 */

import type { ValidationResult } from '../../../schemas/context-bundle.js';

// ── Fixture shape types ──────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  size_bytes: number;
  summarized: boolean;
}

interface BundleManifest {
  artifact: FileEntry;
  conventions: FileEntry[];
  touched_files: FileEntry[];
  specs: FileEntry[];
  total_bytes: number;
}

interface FilesEntry {
  path: string;
  content: string;
}

interface SuccessAssemblerOutput {
  status: 'success';
  manifest: BundleManifest;
  files: FilesEntry[];
}

interface ExpectedBlock {
  status: 'success';
  total_bytes_within_cap: boolean;
  artifact_summarized: boolean;
  summarized_count: number;
  verbatim_count: number;
  max_bundle_bytes: number;
  actual_total_bytes: number;
}

export interface OversizedBundleFixture {
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
  expected_assembler_output: SuccessAssemblerOutput;
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
 * Validates the top-level structure of the oversized-bundle fixture.
 * Returns a ValidationResult.
 */
export function assertOversizedBundleFixtureShape(fixture: unknown): ValidationResult {
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

// ── Success-path assertions ──────────────────────────────────────────────────

/**
 * Asserts that expected.status is "success".
 * Returns null on pass, error string on fail.
 */
export function assertStatusIsSuccess(fixture: OversizedBundleFixture): string | null {
  if (fixture.expected.status !== 'success') {
    return `expected.status: expected "success", got "${fixture.expected.status}"`;
  }
  return null;
}

/**
 * Asserts that expected.total_bytes_within_cap is true.
 * Returns null on pass, error string on fail.
 */
export function assertTotalBytesWithinCap(fixture: OversizedBundleFixture): string | null {
  if (fixture.expected.total_bytes_within_cap !== true) {
    return `expected.total_bytes_within_cap: expected true, got ${fixture.expected.total_bytes_within_cap}`;
  }
  return null;
}

/**
 * Asserts that expected.artifact_summarized is false (Behavioral Rule 1).
 * Returns null on pass, error string on fail.
 */
export function assertArtifactNotSummarized(fixture: OversizedBundleFixture): string | null {
  if (fixture.expected.artifact_summarized !== false) {
    return `expected.artifact_summarized: expected false (Behavioral Rule 1), got ${fixture.expected.artifact_summarized}`;
  }
  return null;
}

/**
 * Asserts that expected.actual_total_bytes does not exceed expected.max_bundle_bytes.
 * Returns null on pass, error string on fail.
 */
export function assertActualTotalBytesWithinMax(fixture: OversizedBundleFixture): string | null {
  const { actual_total_bytes, max_bundle_bytes } = fixture.expected;
  if (actual_total_bytes > max_bundle_bytes) {
    return (
      `expected.actual_total_bytes (${actual_total_bytes}) exceeds ` +
      `expected.max_bundle_bytes (${max_bundle_bytes})`
    );
  }
  return null;
}

/**
 * Asserts that the manifest's total_bytes matches expected.actual_total_bytes.
 * Returns null on pass, error string on fail.
 */
export function assertManifestTotalBytesMatchesExpected(fixture: OversizedBundleFixture): string | null {
  const manifestTotal = fixture.expected_assembler_output.manifest.total_bytes;
  const expectedTotal = fixture.expected.actual_total_bytes;
  if (manifestTotal !== expectedTotal) {
    return (
      `manifest.total_bytes (${manifestTotal}) does not match ` +
      `expected.actual_total_bytes (${expectedTotal})`
    );
  }
  return null;
}

/**
 * Asserts that manifest.artifact.summarized is false (Behavioral Rule 1).
 * Returns null on pass, error string on fail.
 */
export function assertManifestArtifactNotSummarized(fixture: OversizedBundleFixture): string | null {
  const artifact = fixture.expected_assembler_output.manifest.artifact;
  if (artifact.summarized !== false) {
    return `manifest.artifact.summarized must be false (Behavioral Rule 1), got ${artifact.summarized}`;
  }
  return null;
}

/**
 * Asserts that every touched file above max_file_bytes is marked summarized: true in the manifest.
 * Returns null on pass, error string on fail.
 */
export function assertLargeFilesAreSummarized(fixture: OversizedBundleFixture): string | null {
  const maxFileBytes = fixture.input.config.max_file_bytes;
  const touched = fixture.expected_assembler_output.manifest.touched_files;
  const errors: string[] = [];

  for (const entry of touched) {
    // Artifact is exempt — it is never summarized even if above the per-file cap
    if (entry.path === fixture.input.artifact_path) continue;

    if (entry.size_bytes > maxFileBytes && entry.summarized !== true) {
      errors.push(
        `manifest.touched_files["${entry.path}"] has size_bytes=${entry.size_bytes} ` +
        `> max_file_bytes=${maxFileBytes} but summarized=${entry.summarized} (expected true)`
      );
    }
  }

  return errors.length > 0 ? errors.join('\n') : null;
}

/**
 * Asserts that expected.summarized_count matches the count of touched_files with summarized: true.
 * Returns null on pass, error string on fail.
 */
export function assertSummarizedCount(fixture: OversizedBundleFixture): string | null {
  const actual = fixture.expected_assembler_output.manifest.touched_files.filter(
    (f) => f.summarized === true
  ).length;
  const expected = fixture.expected.summarized_count;
  if (actual !== expected) {
    return `summarized_count mismatch: expected ${expected}, got ${actual} summarized touched_files`;
  }
  return null;
}

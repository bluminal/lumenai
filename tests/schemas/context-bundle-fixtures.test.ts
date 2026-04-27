/**
 * Task 8: Layer 2 fixture validation tests for the context-bundle assembler.
 *
 * Exercises three scenarios:
 *   (a) oversized-bundle      — iterative summarization; artifact stays verbatim; total ≤ cap
 *   (b) artifact-as-largest-file — artifact > max_file_bytes → narrow_scope_required error
 *   (c) oversized-artifact    — artifact > max_bundle_bytes → narrow_scope_required error
 *
 * Cross-file checks:
 *   - plugins/synthex/agents/context-bundle-assembler.md contains "narrow_scope_required"
 *   - plugins/synthex/agents/context-bundle-assembler.md contains the verbatim
 *     "artifact is NEVER summarized" rule
 *
 * Acceptance criteria:
 *   [T] Fixture (a): bundle stays ≤ max_bundle_bytes; manifest correctly identifies
 *       summarized-vs-verbatim files
 *   [H] Fixture (b): artifact-as-largest-file produces "narrow scope" error (not silent summary)
 *   [H] Fixture (c): oversized-artifact produces "narrow scope" error
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { validateContextBundle } from './context-bundle.js';

import {
  assertOversizedBundleFixtureShape,
  assertStatusIsSuccess,
  assertTotalBytesWithinCap,
  assertArtifactNotSummarized as assertArtifactNotSummarizedA,
  assertActualTotalBytesWithinMax,
  assertManifestTotalBytesMatchesExpected,
  assertManifestArtifactNotSummarized,
  assertLargeFilesAreSummarized,
  assertSummarizedCount,
  type OversizedBundleFixture,
} from '../fixtures/multi-model-review/context-bundle/oversized-bundle/assertions.js';

import {
  assertArtifactAsLargestFileFixtureShape,
  assertStatusIsError as assertStatusIsErrorB,
  assertErrorCodeIsNarrowScope as assertErrorCodeIsNarrowScopeB,
  assertArtifactNotSummarized as assertArtifactNotSummarizedB,
  assertBehavioralRule1Enforced as assertBehavioralRule1EnforcedB,
  assertArtifactExceedsPerFileCap,
  assertErrorOutputShape as assertErrorOutputShapeB,
  type ArtifactAsLargestFileFixture,
} from '../fixtures/multi-model-review/context-bundle/artifact-as-largest-file/assertions.js';

import {
  assertOversizedArtifactFixtureShape,
  assertStatusIsError as assertStatusIsErrorC,
  assertErrorCodeIsNarrowScope as assertErrorCodeIsNarrowScopeC,
  assertArtifactNotSummarized as assertArtifactNotSummarizedC,
  assertBehavioralRule1Enforced as assertBehavioralRule1EnforcedC,
  assertArtifactExceedsBundleCap,
  assertErrorOutputShape as assertErrorOutputShapeC,
  type OversizedArtifactFixture,
} from '../fixtures/multi-model-review/context-bundle/oversized-artifact/assertions.js';

// ── Path constants ───────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-review', 'context-bundle'
);

const ASSEMBLER_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'context-bundle-assembler.md'
);

// ── Load fixtures ────────────────────────────────────────────────────────────

const fixtureA = JSON.parse(
  readFileSync(join(FIXTURES_BASE, 'oversized-bundle', 'fixture.json'), 'utf-8')
) as OversizedBundleFixture;

const fixtureB = JSON.parse(
  readFileSync(join(FIXTURES_BASE, 'artifact-as-largest-file', 'fixture.json'), 'utf-8')
) as ArtifactAsLargestFileFixture;

const fixtureC = JSON.parse(
  readFileSync(join(FIXTURES_BASE, 'oversized-artifact', 'fixture.json'), 'utf-8')
) as OversizedArtifactFixture;

// ── Fixture (a): oversized-bundle ────────────────────────────────────────────

describe('Task 8 Fixture (a): oversized-bundle', () => {
  it('[T] fixture has correct top-level structure', () => {
    const result = assertOversizedBundleFixtureShape(fixtureA);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[T] expected_assembler_output validates against validateContextBundle', () => {
    const result = validateContextBundle(
      fixtureA.expected_assembler_output,
      { maxBundleBytes: fixtureA.input.config.max_bundle_bytes }
    );
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[T] expected.status is "success"', () => {
    const err = assertStatusIsSuccess(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] expected.total_bytes_within_cap is true', () => {
    const err = assertTotalBytesWithinCap(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] expected.artifact_summarized is false (Behavioral Rule 1)', () => {
    const err = assertArtifactNotSummarizedA(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] actual_total_bytes does not exceed max_bundle_bytes', () => {
    const err = assertActualTotalBytesWithinMax(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] manifest.total_bytes matches expected.actual_total_bytes', () => {
    const err = assertManifestTotalBytesMatchesExpected(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] manifest.artifact.summarized is false (Behavioral Rule 1 in manifest)', () => {
    const err = assertManifestArtifactNotSummarized(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] all touched files above max_file_bytes (excluding artifact) are summarized: true', () => {
    const err = assertLargeFilesAreSummarized(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] summarized_count matches actual count of summarized touched_files in manifest', () => {
    const err = assertSummarizedCount(fixtureA);
    expect(err, err ?? '').toBeNull();
  });

  it('[T] manifest.total_bytes ≤ max_bundle_bytes (200000)', () => {
    const totalBytes = fixtureA.expected_assembler_output.manifest.total_bytes;
    const cap = fixtureA.input.config.max_bundle_bytes;
    expect(totalBytes).toBeLessThanOrEqual(cap);
  });

  it('[T] artifact entry in manifest has summarized: false', () => {
    expect(fixtureA.expected_assembler_output.manifest.artifact.summarized).toBe(false);
  });

  it('[T] large-file-1.ts (92000 bytes) has summarized: true in manifest', () => {
    const entry = fixtureA.expected_assembler_output.manifest.touched_files.find(
      (f) => f.path === 'src/utils/large-file-1.ts'
    );
    expect(entry).toBeDefined();
    expect(entry!.summarized).toBe(true);
  });

  it('[T] large-file-2.ts (88000 bytes) has summarized: true in manifest', () => {
    const entry = fixtureA.expected_assembler_output.manifest.touched_files.find(
      (f) => f.path === 'src/utils/large-file-2.ts'
    );
    expect(entry).toBeDefined();
    expect(entry!.summarized).toBe(true);
  });

  it('[T] large-file-3.ts (75000 bytes) has summarized: true in manifest', () => {
    const entry = fixtureA.expected_assembler_output.manifest.touched_files.find(
      (f) => f.path === 'src/utils/large-file-3.ts'
    );
    expect(entry).toBeDefined();
    expect(entry!.summarized).toBe(true);
  });

  it('[T] medium-file-1.ts (12000 bytes) has summarized: false in manifest', () => {
    const entry = fixtureA.expected_assembler_output.manifest.touched_files.find(
      (f) => f.path === 'src/utils/medium-file-1.ts'
    );
    expect(entry).toBeDefined();
    expect(entry!.summarized).toBe(false);
  });

  it('[T] expected.summarized_count is 3', () => {
    expect(fixtureA.expected.summarized_count).toBe(3);
  });

  it('[T] expected.verbatim_count is 4', () => {
    expect(fixtureA.expected.verbatim_count).toBe(4);
  });
});

// ── Fixture (b): artifact-as-largest-file ────────────────────────────────────

describe('Task 8 Fixture (b): artifact-as-largest-file [H]', () => {
  it('[H] fixture has correct top-level structure', () => {
    const result = assertArtifactAsLargestFileFixtureShape(fixtureB);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[H] expected_assembler_output validates against validateContextBundle', () => {
    const result = validateContextBundle(fixtureB.expected_assembler_output);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[H] expected.status is "error"', () => {
    const err = assertStatusIsErrorB(fixtureB);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected.error_code is "narrow_scope_required"', () => {
    const err = assertErrorCodeIsNarrowScopeB(fixtureB);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected.artifact_NOT_summarized is true (Behavioral Rule 1)', () => {
    const err = assertArtifactNotSummarizedB(fixtureB);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected.behavioral_rule_1_enforced is true', () => {
    const err = assertBehavioralRule1EnforcedB(fixtureB);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] artifact_size_bytes exceeds max_file_bytes (per-file-cap trigger)', () => {
    const err = assertArtifactExceedsPerFileCap(fixtureB);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected_assembler_output has correct narrow_scope_required error shape', () => {
    const result = assertErrorOutputShapeB(fixtureB);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[H] expected.artifact_size_bytes is 80000', () => {
    expect(fixtureB.expected.artifact_size_bytes).toBe(80000);
  });

  it('[H] expected.max_file_bytes is 50000', () => {
    expect(fixtureB.expected.max_file_bytes).toBe(50000);
  });

  it('[H] expected_assembler_output.manifest is null', () => {
    expect(fixtureB.expected_assembler_output.manifest).toBeNull();
  });

  it('[H] expected_assembler_output.files is empty array', () => {
    expect(fixtureB.expected_assembler_output.files).toHaveLength(0);
  });

  it('[H] error_code is distinct signal: artifact > per-file cap (not bundle cap)', () => {
    // Confirm this fixture's artifact fits in bundle but not per-file
    const { artifact_size_bytes, max_file_bytes } = fixtureB.expected;
    const bundleCap = fixtureB.input.config.max_bundle_bytes;
    expect(artifact_size_bytes).toBeGreaterThan(max_file_bytes);
    expect(artifact_size_bytes).toBeLessThan(bundleCap);
  });
});

// ── Fixture (c): oversized-artifact ─────────────────────────────────────────

describe('Task 8 Fixture (c): oversized-artifact [H]', () => {
  it('[H] fixture has correct top-level structure', () => {
    const result = assertOversizedArtifactFixtureShape(fixtureC);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[H] expected_assembler_output validates against validateContextBundle', () => {
    const result = validateContextBundle(fixtureC.expected_assembler_output);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[H] expected.status is "error"', () => {
    const err = assertStatusIsErrorC(fixtureC);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected.error_code is "narrow_scope_required"', () => {
    const err = assertErrorCodeIsNarrowScopeC(fixtureC);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected.artifact_NOT_summarized is true (Behavioral Rule 1)', () => {
    const err = assertArtifactNotSummarizedC(fixtureC);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected.behavioral_rule_1_enforced is true', () => {
    const err = assertBehavioralRule1EnforcedC(fixtureC);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] artifact_size_bytes exceeds max_bundle_bytes (bundle-cap trigger)', () => {
    const err = assertArtifactExceedsBundleCap(fixtureC);
    expect(err, err ?? '').toBeNull();
  });

  it('[H] expected_assembler_output has correct narrow_scope_required error shape', () => {
    const result = assertErrorOutputShapeC(fixtureC);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('[H] expected.artifact_size_bytes is 250000', () => {
    expect(fixtureC.expected.artifact_size_bytes).toBe(250000);
  });

  it('[H] expected.max_bundle_bytes is 200000', () => {
    expect(fixtureC.expected.max_bundle_bytes).toBe(200000);
  });

  it('[H] expected_assembler_output.manifest is null', () => {
    expect(fixtureC.expected_assembler_output.manifest).toBeNull();
  });

  it('[H] expected_assembler_output.files is empty array', () => {
    expect(fixtureC.expected_assembler_output.files).toHaveLength(0);
  });

  it('[H] error_code is distinct signal: artifact > bundle cap (not just per-file cap)', () => {
    // Confirm this fixture's artifact exceeds both the per-file cap AND the bundle cap
    const { artifact_size_bytes, max_bundle_bytes } = fixtureC.expected;
    const maxFileBytes = fixtureC.input.config.max_file_bytes;
    expect(artifact_size_bytes).toBeGreaterThan(max_bundle_bytes);
    expect(artifact_size_bytes).toBeGreaterThan(maxFileBytes);
  });
});

// ── Cross-file checks: context-bundle-assembler.md ──────────────────────────

describe('Task 8 cross-file checks: context-bundle-assembler.md', () => {
  const assemblerContent = readFileSync(ASSEMBLER_MD_PATH, 'utf-8');

  it('contains "narrow_scope_required" error code string', () => {
    expect(assemblerContent).toContain('narrow_scope_required');
  });

  it('contains verbatim "artifact is NEVER summarized" rule (Behavioral Rule 1)', () => {
    expect(assemblerContent).toMatch(/artifact is NEVER summarized/);
  });

  it('contains the narrow-scope error path section (Step 6)', () => {
    expect(assemblerContent).toMatch(/Narrow.Scope Error|narrow.scope/i);
  });

  it('documents that artifact is never summarized in Step 1', () => {
    // Verify the behavioral statement appears in context of Step 1
    const step1Section = assemblerContent.split('Step 2')[0];
    expect(step1Section).toMatch(/NEVER summarized/);
  });
});

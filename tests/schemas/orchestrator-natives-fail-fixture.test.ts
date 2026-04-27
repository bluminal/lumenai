/**
 * Task 23b: Layer 2 fixture validation — all-natives-fail (CRITICAL warning, distinct copy).
 *
 * Validates:
 * 1. expected_envelope passes validateOrchestratorOutput schema
 * 2. continuation_event.type === "all-natives-failed"
 * 3. Critical warning verbatim check: orchestrator .md contains exact warning string
 * 4. Warning distinctness: all-natives-failed warning is NOT a substring of all-externals-failed
 *    warning and vice versa — both exist independently
 * 5. findings.length === 0 (critical stop, no consolidation)
 * 6. All 2 native entries have status: failed with correct error_codes
 * 7. continuation_event.details distinguishes native-failure (names native reviewer IDs + codes)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateOrchestratorOutput } from './orchestrator-output.js';

// ── File paths ─────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'multi-model-review',
  'orchestrator',
  'all-natives-fail'
);

const ORCHESTRATOR_MD = join(
  import.meta.dirname,
  '..', '..',
  'plugins', 'synthex', 'agents', 'multi-model-review-orchestrator.md'
);

// ── Load fixtures ──────────────────────────────────────────────────────────

const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf-8'));
const expectedEnvelope = JSON.parse(readFileSync(join(FIXTURE_DIR, 'expected_envelope.json'), 'utf-8'));
const orchestratorMd = readFileSync(ORCHESTRATOR_MD, 'utf-8');

// ── Verbatim warning strings (sourced from fixture and orchestrator spec) ──

const ALL_NATIVES_FAILED_WARNING =
  'All native Synthex reviewers failed. Cannot continue — multi-model review has no findings to consolidate. Check sub-agent error logs.';

const ALL_EXTERNALS_FAILED_WARNING =
  'All external reviewers failed; continuing with natives only';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Task 23b: all-natives-fail fixture — Layer 2 validation', () => {

  // ── 1. Schema validation ─────────────────────────────────────────────────

  describe('1. expected_envelope passes validateOrchestratorOutput', () => {
    it('validateOrchestratorOutput returns valid: true for expected_envelope', () => {
      const result = validateOrchestratorOutput(expectedEnvelope);
      expect(result.valid, `Schema errors: ${result.errors.join('; ')}`).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── 2. continuation_event.type ───────────────────────────────────────────

  describe('2. continuation_event.type === "all-natives-failed"', () => {
    it('continuation_event is present (not null)', () => {
      expect(expectedEnvelope.continuation_event).not.toBeNull();
      expect(expectedEnvelope.continuation_event).toBeDefined();
    });

    it('continuation_event.type is "all-natives-failed"', () => {
      expect(expectedEnvelope.continuation_event.type).toBe('all-natives-failed');
    });

    it('fixture.expected_continuation_type is "all-natives-failed"', () => {
      expect(fixture.expected_continuation_type).toBe('all-natives-failed');
    });

    it('fixture expected_continuation_type matches envelope continuation_event.type', () => {
      expect(expectedEnvelope.continuation_event.type).toBe(fixture.expected_continuation_type);
    });
  });

  // ── 3. Critical warning verbatim check ──────────────────────────────────

  describe('3. Critical warning verbatim check in orchestrator.md', () => {
    it('orchestrator.md contains the exact all-natives-failed critical warning string', () => {
      expect(orchestratorMd).toContain(ALL_NATIVES_FAILED_WARNING);
    });

    it('fixture.expected_critical_warning_verbatim matches the canonical warning string', () => {
      expect(fixture.expected_critical_warning_verbatim).toBe(ALL_NATIVES_FAILED_WARNING);
    });

    it('orchestrator.md contains the fixture expected_critical_warning_verbatim verbatim', () => {
      expect(orchestratorMd).toContain(fixture.expected_critical_warning_verbatim);
    });
  });

  // ── 4. Warning distinctness ──────────────────────────────────────────────

  describe('4. all-natives-failed warning is DISTINCT from all-externals-failed warning', () => {
    it('orchestrator.md contains the all-externals-failed warning', () => {
      expect(orchestratorMd).toContain(ALL_EXTERNALS_FAILED_WARNING);
    });

    it('fixture.distinct_from_externals_failed_warning matches canonical externals-failed string', () => {
      expect(fixture.distinct_from_externals_failed_warning).toBe(ALL_EXTERNALS_FAILED_WARNING);
    });

    it('all-natives-failed warning is NOT a substring of all-externals-failed warning', () => {
      expect(ALL_EXTERNALS_FAILED_WARNING).not.toContain(ALL_NATIVES_FAILED_WARNING);
    });

    it('all-externals-failed warning is NOT a substring of all-natives-failed warning', () => {
      expect(ALL_NATIVES_FAILED_WARNING).not.toContain(ALL_EXTERNALS_FAILED_WARNING);
    });

    it('warning strings are not equal to each other', () => {
      expect(ALL_NATIVES_FAILED_WARNING).not.toBe(ALL_EXTERNALS_FAILED_WARNING);
    });
  });

  // ── 5. findings.length === 0 (critical stop, no consolidation) ──────────

  describe('5. findings === [] (critical stop — no consolidation)', () => {
    it('findings is an empty array', () => {
      expect(Array.isArray(expectedEnvelope.findings)).toBe(true);
      expect(expectedEnvelope.findings).toHaveLength(0);
    });
  });

  // ── 6. Native entries have status: failed with correct error_codes ───────

  describe('6. All native entries have status: failed with their error_codes', () => {
    const nativeEntries = (expectedEnvelope.per_reviewer_results as Array<{
      reviewer_id: string;
      source_type: string;
      status: string;
      error_code: string | null;
    }>).filter(e => e.source_type === 'native-team');

    it('exactly 2 native-team entries are present', () => {
      expect(nativeEntries).toHaveLength(2);
    });

    it('all native entries have status: failed', () => {
      for (const entry of nativeEntries) {
        expect(entry.status).toBe('failed');
      }
    });

    it('code-reviewer entry has error_code: "timeout"', () => {
      const codeReviewer = nativeEntries.find(e => e.reviewer_id === 'code-reviewer');
      expect(codeReviewer).toBeDefined();
      expect(codeReviewer?.error_code).toBe('timeout');
    });

    it('security-reviewer entry has error_code: "sub_agent_failure"', () => {
      const securityReviewer = nativeEntries.find(e => e.reviewer_id === 'security-reviewer');
      expect(securityReviewer).toBeDefined();
      expect(securityReviewer?.error_code).toBe('sub_agent_failure');
    });

    it('native failure error_codes match fixture native_failures', () => {
      for (const failure of fixture.native_failures as Array<{ reviewer_id: string; error_code: string }>) {
        const entry = nativeEntries.find(e => e.reviewer_id === failure.reviewer_id);
        expect(entry, `entry for ${failure.reviewer_id} missing`).toBeDefined();
        expect(entry?.error_code).toBe(failure.error_code);
      }
    });
  });

  // ── 7. continuation_event.details distinguishes native-failure ───────────

  describe('7. continuation_event.details distinguishes native-failure from external-failure', () => {
    it('continuation_event.details is a non-empty string', () => {
      expect(typeof expectedEnvelope.continuation_event.details).toBe('string');
      expect(expectedEnvelope.continuation_event.details.length).toBeGreaterThan(0);
    });

    it('continuation_event.details mentions native reviewer "code-reviewer"', () => {
      expect(expectedEnvelope.continuation_event.details).toContain('code-reviewer');
    });

    it('continuation_event.details mentions native reviewer "security-reviewer"', () => {
      expect(expectedEnvelope.continuation_event.details).toContain('security-reviewer');
    });

    it('continuation_event.details mentions error code "timeout"', () => {
      expect(expectedEnvelope.continuation_event.details).toContain('timeout');
    });

    it('continuation_event.details mentions error code "sub_agent_failure"', () => {
      expect(expectedEnvelope.continuation_event.details).toContain('sub_agent_failure');
    });

    it('continuation_event.details does NOT mention external adapter names (this is a native-failure event)', () => {
      expect(expectedEnvelope.continuation_event.details).not.toContain('codex-review-prompter');
      expect(expectedEnvelope.continuation_event.details).not.toContain('gemini-review-prompter');
    });
  });

  // ── 8. External entries succeeded (externals ran in same batch) ──────────

  describe('8. External entries completed successfully (same-batch concurrency)', () => {
    const externalEntries = (expectedEnvelope.per_reviewer_results as Array<{
      reviewer_id: string;
      source_type: string;
      status: string;
    }>).filter(e => e.source_type === 'external');

    it('exactly 2 external entries are present', () => {
      expect(externalEntries).toHaveLength(2);
    });

    it('all external entries have status: success', () => {
      for (const entry of externalEntries) {
        expect(entry.status).toBe('success');
      }
    });
  });

  // ── 9. path_and_reason_header matches D21 native-only-failed form ────────

  describe('9. path_and_reason_header uses native-only-failed form (D21 compliant)', () => {
    it('path_and_reason_header contains "native-only-failed"', () => {
      expect(expectedEnvelope.path_and_reason_header).toContain('native-only-failed');
    });

    it('path_and_reason_header uses "2 native" reviewer count form', () => {
      expect(expectedEnvelope.path_and_reason_header).toContain('2 native');
    });
  });

});

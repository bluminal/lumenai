/**
 * Tests for the orchestrator unified-output validator (Task 22).
 * Layer 1 schema validation — static shape only, no LLM inference.
 */

import { describe, it, expect } from 'vitest';
import { validateOrchestratorOutput, PATH_AND_REASON_HEADER_REGEX } from './orchestrator-output';

// ---------------------------------------------------------------------------
// Shared valid sample (2 native + 2 external, all success)
// ---------------------------------------------------------------------------
const validFinding = {
  finding_id: 'security.handleLogin.missing-csrf-check',
  severity: 'high',
  category: 'security',
  title: 'Missing CSRF check',
  description: 'The handleLogin function does not validate CSRF tokens.',
  file: 'src/auth/handleLogin.ts',
  source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
};

const validOutput = {
  per_reviewer_results: [
    { reviewer_id: 'code-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 3, error_code: null, usage: null },
    { reviewer_id: 'security-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 1, error_code: null, usage: null },
    { reviewer_id: 'codex-review-prompter', source_type: 'external', family: 'openai', status: 'success', findings_count: 2, error_code: null, usage: { input_tokens: 4521, output_tokens: 312, model: 'gpt-5' } },
    { reviewer_id: 'gemini-review-prompter', source_type: 'external', family: 'google', status: 'success', findings_count: 4, error_code: null, usage: { input_tokens: 5234, output_tokens: 412, model: 'gemini-2.5-pro' } },
  ],
  findings: [validFinding],
  path_and_reason_header: 'Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)',
  aggregator_resolution: { name: 'codex-review-prompter', source: 'tier-table' },
  continuation_event: null,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function withOverride(overrides: Record<string, unknown>) {
  return { ...validOutput, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Valid sample passes
// ---------------------------------------------------------------------------
describe('orchestrator-output validator', () => {
  it('1. valid sample with 2 native + 2 external success passes', () => {
    const result = validateOrchestratorOutput(validOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // path_and_reason_header (D21 regex)
  // -------------------------------------------------------------------------
  it('2. missing path_and_reason_header fails with explicit error', () => {
    const { path_and_reason_header: _, ...noHeader } = validOutput;
    const result = validateOrchestratorOutput(noHeader);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('path_and_reason_header') && e.includes('D21'))).toBe(true);
  });

  it('3. header failing D21 regex fails (missing parenthetical reason)', () => {
    const result = validateOrchestratorOutput(
      withOverride({ path_and_reason_header: 'Review path: multi-model' })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('path_and_reason_header') && e.includes('D21'))).toBe(true);
  });

  it('4. header with "2 native + 2 external" form passes D21 regex', () => {
    const result = validateOrchestratorOutput(
      withOverride({ path_and_reason_header: 'Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)' })
    );
    expect(result.valid).toBe(true);
  });

  it('5. header with native-only form "2 native" passes D21 regex', () => {
    const result = validateOrchestratorOutput(
      withOverride({ path_and_reason_header: 'Review path: native-only (below-threshold; reviewers: 2 native)' })
    );
    expect(result.valid).toBe(true);
  });

  it('6. header with "2 native, 0 external succeeded" form passes D21 regex', () => {
    const result = validateOrchestratorOutput(
      withOverride({ path_and_reason_header: 'Review path: native-only (all externals failed; reviewers: 2 native, 0 external failed)' })
    );
    expect(result.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // per_reviewer_results
  // -------------------------------------------------------------------------
  it('7. missing per_reviewer_results fails', () => {
    const { per_reviewer_results: _, ...noPRR } = validOutput;
    const result = validateOrchestratorOutput(noPRR);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('per_reviewer_results'))).toBe(true);
  });

  it('8. per_reviewer_results entry missing source_type fails', () => {
    const entry = { reviewer_id: 'code-reviewer', family: 'anthropic', status: 'success', findings_count: 0 };
    const result = validateOrchestratorOutput(
      withOverride({ per_reviewer_results: [entry] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('source_type'))).toBe(true);
  });

  it('9. per_reviewer_results entry with unknown source_type "unknown" fails', () => {
    const entry = { reviewer_id: 'code-reviewer', source_type: 'unknown', family: 'anthropic', status: 'success', findings_count: 0 };
    const result = validateOrchestratorOutput(
      withOverride({ per_reviewer_results: [entry] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('source_type') && e.includes('unknown'))).toBe(true);
  });

  it('10. per_reviewer_results entry with source_type "native-team" passes', () => {
    const entry = { reviewer_id: 'code-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 0, error_code: null };
    const result = validateOrchestratorOutput(
      withOverride({ per_reviewer_results: [entry] })
    );
    expect(result.valid).toBe(true);
  });

  it('11. per_reviewer_results entry with source_type "external" passes', () => {
    const entry = { reviewer_id: 'codex-review-prompter', source_type: 'external', family: 'openai', status: 'success', findings_count: 0, error_code: null };
    const result = validateOrchestratorOutput(
      withOverride({ per_reviewer_results: [entry] })
    );
    expect(result.valid).toBe(true);
  });

  it('12. per_reviewer_results entry with source_type "native-recovery" passes', () => {
    const entry = { reviewer_id: 'code-reviewer-recovery', source_type: 'native-recovery', family: 'anthropic', status: 'success', findings_count: 0, error_code: null };
    const result = validateOrchestratorOutput(
      withOverride({ per_reviewer_results: [entry] })
    );
    expect(result.valid).toBe(true);
  });

  it('13. native + external entries in the SAME array passes (uniform table, no separation)', () => {
    const mixedResults = [
      { reviewer_id: 'code-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 1, error_code: null },
      { reviewer_id: 'security-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 0, error_code: null },
      { reviewer_id: 'codex-review-prompter', source_type: 'external', family: 'openai', status: 'success', findings_count: 2, error_code: null },
      { reviewer_id: 'gemini-review-prompter', source_type: 'external', family: 'google', status: 'success', findings_count: 3, error_code: null },
    ];
    const result = validateOrchestratorOutput(withOverride({ per_reviewer_results: mixedResults }));
    expect(result.valid).toBe(true);
    // Confirm all source_type values are present in the single array
    const sourceTypes = mixedResults.map(e => e.source_type);
    expect(sourceTypes).toContain('native-team');
    expect(sourceTypes).toContain('external');
  });

  it('14. per_reviewer_results entry with status "failed" but missing error_code fails', () => {
    const entry = { reviewer_id: 'codex-review-prompter', source_type: 'external', family: 'openai', status: 'failed', findings_count: 0, error_code: null };
    const result = validateOrchestratorOutput(
      withOverride({ per_reviewer_results: [entry] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('error_code') && e.includes('failed'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // findings (canonical-finding validation + attribution)
  // -------------------------------------------------------------------------
  it('15. findings entry with line number in finding_id fails with "findings[INDEX]:" prefix', () => {
    const badFinding = { ...validFinding, finding_id: 'security.handleLogin:42' };
    const result = validateOrchestratorOutput(withOverride({ findings: [badFinding] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('findings[0]:'))).toBe(true);
  });

  it('16. findings entry without source field fails (attribution required)', () => {
    const { source: _, ...noSource } = validFinding;
    const result = validateOrchestratorOutput(withOverride({ findings: [noSource] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('findings[0]:') && e.includes('source'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // aggregator_resolution
  // -------------------------------------------------------------------------
  it('17. missing aggregator_resolution fails', () => {
    const { aggregator_resolution: _, ...noAR } = validOutput;
    const result = validateOrchestratorOutput(noAR);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('aggregator_resolution'))).toBe(true);
  });

  it('18. aggregator_resolution with unknown source value fails', () => {
    const result = validateOrchestratorOutput(
      withOverride({ aggregator_resolution: { name: 'codex-review-prompter', source: 'manual' } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('aggregator_resolution.source'))).toBe(true);
  });

  it('19a. aggregator_resolution with source "configured" passes', () => {
    const result = validateOrchestratorOutput(
      withOverride({ aggregator_resolution: { name: 'codex-review-prompter', source: 'configured' } })
    );
    expect(result.valid).toBe(true);
  });

  it('19b. aggregator_resolution with source "tier-table" passes', () => {
    const result = validateOrchestratorOutput(
      withOverride({ aggregator_resolution: { name: 'codex-review-prompter', source: 'tier-table' } })
    );
    expect(result.valid).toBe(true);
  });

  it('19c. aggregator_resolution with source "host-fallback" passes', () => {
    const result = validateOrchestratorOutput(
      withOverride({ aggregator_resolution: { name: 'host-session', source: 'host-fallback' } })
    );
    expect(result.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // continuation_event
  // -------------------------------------------------------------------------
  it('20. continuation_event === null passes', () => {
    const result = validateOrchestratorOutput(withOverride({ continuation_event: null }));
    expect(result.valid).toBe(true);
  });

  it('21. continuation_event with type "all-externals-failed" passes', () => {
    const result = validateOrchestratorOutput(
      withOverride({ continuation_event: { type: 'all-externals-failed', details: 'All external reviewers timed out; continuing with native-only findings.' } })
    );
    expect(result.valid).toBe(true);
  });

  it('22. continuation_event with type "all-natives-failed" passes', () => {
    const result = validateOrchestratorOutput(
      withOverride({ continuation_event: { type: 'all-natives-failed', details: 'All native reviewers failed; no consolidation possible.' } })
    );
    expect(result.valid).toBe(true);
  });

  it('23. continuation_event with type "cloud-surface-no-clis" passes', () => {
    const result = validateOrchestratorOutput(
      withOverride({ continuation_event: { type: 'cloud-surface-no-clis', details: 'Cloud surface detected; no CLIs available. Falling back to native-only.' } })
    );
    expect(result.valid).toBe(true);
  });

  it('24. continuation_event with unknown type fails', () => {
    const result = validateOrchestratorOutput(
      withOverride({ continuation_event: { type: 'some-unknown-event', details: 'Something happened.' } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('continuation_event.type'))).toBe(true);
  });

  it('25. continuation_event present but missing details fails', () => {
    const result = validateOrchestratorOutput(
      withOverride({ continuation_event: { type: 'all-externals-failed' } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('continuation_event.details'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PATH_AND_REASON_HEADER_REGEX direct smoke tests (export verification)
// ---------------------------------------------------------------------------
describe('PATH_AND_REASON_HEADER_REGEX export', () => {
  it('accepts well-formed multi-model header with external count', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test('Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)')).toBe(true);
  });

  it('accepts native-only header without external clause', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test('Review path: native-only (below-threshold; reviewers: 3 native)')).toBe(true);
  });

  it('rejects header that is just a bare path label with no parenthetical', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test('Review path: multi-model')).toBe(false);
  });

  it('rejects header missing "reviewers:" suffix', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test('Review path: multi-model (above-threshold diff)')).toBe(false);
  });
});

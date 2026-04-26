/**
 * Assertion helpers for the recovery-multi-model fixture (FR-MMT24).
 *
 * Exports typed assertion functions used by the Vitest suite in
 * tests/schemas/recovery-multi-model.test.ts.
 */

import fixtureFrames from './fixture.json' assert { type: 'json' };

// ── Frame types ──────────────────────────────────────────────────

export interface FixtureFrame {
  frame: string;
  description: string;
  data: Record<string, unknown>;
  assertion: string;
}

export const frames = fixtureFrames as FixtureFrame[];

// ── Frame lookup ──────────────────────────────────────────────────

export function getFrame(name: string): FixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Fixture frame "${name}" not found`);
  return f;
}

export const FRAME_NAMES = [
  'pool_active',
  'three_reviewers_completed',
  'code_reviewer_crashed',
  'submitter_returns_failed',
  'recovery_invoked',
  'fresh_reviewer_completed',
  'partial_dedup_run',
  'lightweight_merge',
  'unified_report_emitted',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

// ── [T1] D19 partial dedup runs Stages 1+2 only ──────────────────

/**
 * Asserts that stages_run is exactly [1, 2] and stages_not_run includes 3,4,5,6.
 * Returns null on pass, error string on fail.
 */
export function assertPartialDedupStages(): string | null {
  const frame = getFrame('partial_dedup_run');
  const stagesRun = frame.data['stages_run'];
  const stagesNotRun = frame.data['stages_not_run'];

  if (!Array.isArray(stagesRun)) {
    return `partial_dedup_run.data.stages_run is not an array: ${JSON.stringify(stagesRun)}`;
  }
  if (!Array.isArray(stagesNotRun)) {
    return `partial_dedup_run.data.stages_not_run is not an array: ${JSON.stringify(stagesNotRun)}`;
  }
  if (stagesRun.length !== 2 || stagesRun[0] !== 1 || stagesRun[1] !== 2) {
    return `stages_run should be [1,2]; got ${JSON.stringify(stagesRun)}`;
  }
  const missing = [3, 4, 5, 6].filter((s) => !(stagesNotRun as number[]).includes(s));
  if (missing.length > 0) {
    return `stages_not_run is missing stages ${missing.join(',')}; got ${JSON.stringify(stagesNotRun)}`;
  }
  return null;
}

// ── [T2] CoVe LLM calls = 0 ──────────────────────────────────────

/**
 * Asserts that cove_llm_calls is 0 in partial_dedup_run frame.
 * Returns null on pass, error string on fail.
 */
export function assertZeroCoVeLlmCalls(): string | null {
  const frame = getFrame('partial_dedup_run');
  const calls = frame.data['cove_llm_calls'];
  if (calls !== 0) {
    return `Expected cove_llm_calls to be 0; got ${JSON.stringify(calls)}`;
  }
  return null;
}

// ── [T3] Recovery attribution is native-recovery ─────────────────

/**
 * Asserts that fresh_reviewer_completed.data.source_type is "native-recovery".
 * Returns null on pass, error string on fail.
 */
export function assertNativeRecoveryAttribution(): string | null {
  const frame = getFrame('fresh_reviewer_completed');
  const sourceType = frame.data['source_type'];
  if (sourceType !== 'native-recovery') {
    return `Expected source_type "native-recovery"; got "${sourceType}"`;
  }
  return null;
}

// ── [T4] Full re-consolidation NOT run ───────────────────────────

/**
 * Asserts that lightweight_merge.data.full_reconsolidation_run is false.
 * Returns null on pass, error string on fail.
 */
export function assertNoFullReconsolidation(): string | null {
  const frame = getFrame('lightweight_merge');
  const ran = frame.data['full_reconsolidation_run'];
  if (ran !== false) {
    return `Expected full_reconsolidation_run to be false; got ${JSON.stringify(ran)}`;
  }
  return null;
}

// ── [T5] Report header contains recovery notice ──────────────────

/**
 * Asserts that unified_report_emitted.data.report_header_contains includes
 * the phrase "was recovered from a pool failure".
 * Returns null on pass, error string on fail.
 */
export function assertRecoveryNoticeInHeader(): string | null {
  const frame = getFrame('unified_report_emitted');
  const header = frame.data['report_header_contains'];
  if (typeof header !== 'string') {
    return `report_header_contains is not a string: ${JSON.stringify(header)}`;
  }
  if (!header.includes('was recovered from a pool failure')) {
    return `report_header_contains does not include "was recovered from a pool failure"; got: "${header}"`;
  }
  return null;
}

// ── [T6] Fresh reviewer produces both output formats ─────────────

/**
 * Asserts that fresh_reviewer_completed.data.has_findings_json is true
 * and findings_format_expected in recovery_invoked includes both formats.
 * Returns null on pass, error string on fail.
 */
export function assertDualOutputFormats(): string | null {
  const completedFrame = getFrame('fresh_reviewer_completed');
  if (completedFrame.data['has_findings_json'] !== true) {
    return `Expected has_findings_json to be true; got ${JSON.stringify(completedFrame.data['has_findings_json'])}`;
  }

  const invokedFrame = getFrame('recovery_invoked');
  const formats = invokedFrame.data['findings_format_expected'];
  if (!Array.isArray(formats)) {
    return `findings_format_expected is not an array: ${JSON.stringify(formats)}`;
  }
  const expected = ['markdown', 'findings_json'];
  for (const fmt of expected) {
    if (!(formats as string[]).includes(fmt)) {
      return `findings_format_expected is missing "${fmt}"; got ${JSON.stringify(formats)}`;
    }
  }
  return null;
}

// ── [T7] Cost evidence: partial pipeline < full ───────────────────

/**
 * Asserts that stages_run.length (2) < total pipeline stages (6),
 * providing structural evidence that partial dedup costs less than full.
 * Returns null on pass, error string on fail.
 */
export function assertPartialPipelineCostEvidence(): string | null {
  const frame = getFrame('partial_dedup_run');
  const stagesRun = frame.data['stages_run'];
  const stagesNotRun = frame.data['stages_not_run'];

  if (!Array.isArray(stagesRun) || !Array.isArray(stagesNotRun)) {
    return `stages_run or stages_not_run is not an array`;
  }
  const totalStages = (stagesRun as number[]).length + (stagesNotRun as number[]).length;
  const runCount = (stagesRun as number[]).length;

  if (runCount >= totalStages) {
    return `stages_run.length (${runCount}) should be less than total stages (${totalStages})`;
  }
  return null;
}

/**
 * Layer 1: Recovery in a multi-model pool fixture tests (FR-MMT24).
 *
 * Validates the synthetic scenario in
 * tests/fixtures/multi-model-teams/failure-handling/recovery-multi-model/fixture.json
 * against the normative behavior defined in FR-MMT24.
 *
 * Acceptance criteria coverage:
 *   [T1] D19 partial dedup runs Stages 1+2 only (stages_run=[1,2]; stages_not_run includes 3,4,5,6)
 *   [T2] CoVe LLM calls = 0 during partial dedup
 *   [T3] Recovery findings merged with source_type: "native-recovery"
 *   [T4] Full re-consolidation NOT run (full_reconsolidation_run: false)
 *   [T5] Report header contains "was recovered from a pool failure"
 *   [T6] Fresh reviewer produces both markdown and findings_json
 *   [T7] Cost evidence: stages_run.length < full pipeline stages (2 < 6)
 */

import { describe, it, expect } from 'vitest';
import {
  frames,
  getFrame,
  FRAME_NAMES,
  assertPartialDedupStages,
  assertZeroCoVeLlmCalls,
  assertNativeRecoveryAttribution,
  assertNoFullReconsolidation,
  assertRecoveryNoticeInHeader,
  assertDualOutputFormats,
  assertPartialPipelineCostEvidence,
} from '../fixtures/multi-model-teams/failure-handling/recovery-multi-model/assertions.js';

// ── Fixture sanity ────────────────────────────────────────────────

describe('recovery-multi-model fixture — structure', () => {
  it('has exactly 9 frames in the expected order', () => {
    expect(frames).toHaveLength(FRAME_NAMES.length);
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      expect(frames[i].frame).toBe(FRAME_NAMES[i]);
    }
  });

  it('every frame has required fixture fields', () => {
    for (const frame of frames) {
      expect(frame).toHaveProperty('frame');
      expect(frame).toHaveProperty('description');
      expect(frame).toHaveProperty('data');
      expect(frame).toHaveProperty('assertion');
      expect(typeof frame.frame).toBe('string');
      expect(typeof frame.description).toBe('string');
      expect(typeof frame.data).toBe('object');
      expect(frame.data).not.toBeNull();
    }
  });

  it('getFrame returns correct frame for each FRAME_NAME', () => {
    for (const name of FRAME_NAMES) {
      const frame = getFrame(name);
      expect(frame.frame).toBe(name);
    }
  });
});

// ── [T1] D19 partial dedup: Stages 1+2 only ─────────────────────

describe('[T1] D19 partial dedup runs Stages 1 and 2 only', () => {
  it('assertPartialDedupStages passes', () => {
    expect(assertPartialDedupStages()).toBeNull();
  });

  it('stages_run is exactly [1, 2]', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesRun = frame.data['stages_run'] as number[];
    expect(stagesRun).toEqual([1, 2]);
  });

  it('stages_not_run contains stage 3', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesNotRun = frame.data['stages_not_run'] as number[];
    expect(stagesNotRun).toContain(3);
  });

  it('stages_not_run contains stage 4', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesNotRun = frame.data['stages_not_run'] as number[];
    expect(stagesNotRun).toContain(4);
  });

  it('stages_not_run contains stage 5', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesNotRun = frame.data['stages_not_run'] as number[];
    expect(stagesNotRun).toContain(5);
  });

  it('stages_not_run contains stage 6', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesNotRun = frame.data['stages_not_run'] as number[];
    expect(stagesNotRun).toContain(6);
  });

  it('dedup_mode is "partial"', () => {
    const frame = getFrame('partial_dedup_run');
    expect(frame.data['dedup_mode']).toBe('partial');
  });
});

// ── [T2] CoVe LLM calls = 0 ─────────────────────────────────────

describe('[T2] CoVe LLM calls = 0 during partial dedup', () => {
  it('assertZeroCoVeLlmCalls passes', () => {
    expect(assertZeroCoVeLlmCalls()).toBeNull();
  });

  it('cove_llm_calls is exactly 0', () => {
    const frame = getFrame('partial_dedup_run');
    expect(frame.data['cove_llm_calls']).toBe(0);
  });
});

// ── [T3] Recovery attribution is "native-recovery" ───────────────

describe('[T3] recovered findings carry "native-recovery" source attribution', () => {
  it('assertNativeRecoveryAttribution passes', () => {
    expect(assertNativeRecoveryAttribution()).toBeNull();
  });

  it('fresh_reviewer_completed.data.source_type is "native-recovery"', () => {
    const frame = getFrame('fresh_reviewer_completed');
    expect(frame.data['source_type']).toBe('native-recovery');
  });

  it('unified_report_emitted.data.recovered_findings_attribution is "native-recovery"', () => {
    const frame = getFrame('unified_report_emitted');
    expect(frame.data['recovered_findings_attribution']).toBe('native-recovery');
  });
});

// ── [T4] Full re-consolidation NOT run ───────────────────────────

describe('[T4] full re-consolidation is NOT run during recovery merge', () => {
  it('assertNoFullReconsolidation passes', () => {
    expect(assertNoFullReconsolidation()).toBeNull();
  });

  it('lightweight_merge.data.full_reconsolidation_run is false', () => {
    const frame = getFrame('lightweight_merge');
    expect(frame.data['full_reconsolidation_run']).toBe(false);
  });

  it('surviving_findings + recovered_findings_after_dedup = total_findings', () => {
    const frame = getFrame('lightweight_merge');
    const surviving = frame.data['surviving_findings'] as number;
    const recovered = frame.data['recovered_findings_after_dedup'] as number;
    const total = frame.data['total_findings'] as number;
    expect(surviving + recovered).toBe(total);
  });

  it('surviving_findings is 9 (sum of 3 completing reviewers)', () => {
    const frame = getFrame('lightweight_merge');
    expect(frame.data['surviving_findings']).toBe(9);
  });
});

// ── [T5] Report header contains recovery notice ──────────────────

describe('[T5] unified report header contains recovery notice', () => {
  it('assertRecoveryNoticeInHeader passes', () => {
    expect(assertRecoveryNoticeInHeader()).toBeNull();
  });

  it('report_header_contains includes "was recovered from a pool failure"', () => {
    const frame = getFrame('unified_report_emitted');
    const header = frame.data['report_header_contains'] as string;
    expect(header).toContain('was recovered from a pool failure');
  });

  it('report_header_contains references the crashed reviewer "code-reviewer"', () => {
    const frame = getFrame('unified_report_emitted');
    const header = frame.data['report_header_contains'] as string;
    expect(header).toContain('code-reviewer');
  });
});

// ── [T6] Fresh reviewer produces both output formats ─────────────

describe('[T6] fresh reviewer produces markdown and findings_json', () => {
  it('assertDualOutputFormats passes', () => {
    expect(assertDualOutputFormats()).toBeNull();
  });

  it('fresh_reviewer_completed.data.has_findings_json is true', () => {
    const frame = getFrame('fresh_reviewer_completed');
    expect(frame.data['has_findings_json']).toBe(true);
  });

  it('recovery_invoked expects "markdown" in findings_format_expected', () => {
    const frame = getFrame('recovery_invoked');
    const formats = frame.data['findings_format_expected'] as string[];
    expect(formats).toContain('markdown');
  });

  it('recovery_invoked expects "findings_json" in findings_format_expected', () => {
    const frame = getFrame('recovery_invoked');
    const formats = frame.data['findings_format_expected'] as string[];
    expect(formats).toContain('findings_json');
  });
});

// ── [T7] Cost evidence: partial pipeline < full ───────────────────

describe('[T7] partial dedup pipeline cost evidence: stages_run.length < total stages', () => {
  it('assertPartialPipelineCostEvidence passes', () => {
    expect(assertPartialPipelineCostEvidence()).toBeNull();
  });

  it('stages_run.length (2) is less than total stages (6)', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesRun = frame.data['stages_run'] as number[];
    const stagesNotRun = frame.data['stages_not_run'] as number[];
    const totalStages = stagesRun.length + stagesNotRun.length;
    expect(stagesRun.length).toBeLessThan(totalStages);
  });

  it('stages_run.length is 2', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesRun = frame.data['stages_run'] as number[];
    expect(stagesRun.length).toBe(2);
  });

  it('total stages count (stages_run + stages_not_run) is 6', () => {
    const frame = getFrame('partial_dedup_run');
    const stagesRun = frame.data['stages_run'] as number[];
    const stagesNotRun = frame.data['stages_not_run'] as number[];
    expect(stagesRun.length + stagesNotRun.length).toBe(6);
  });
});

// ── Multi-model pool configuration ───────────────────────────────

describe('pool_active frame — multi-model configuration', () => {
  it('pool_active.data.multi_model is true', () => {
    const frame = getFrame('pool_active');
    expect(frame.data['multi_model']).toBe(true);
  });

  it('pool_active.data.reviewers has 4 entries', () => {
    const frame = getFrame('pool_active');
    const reviewers = frame.data['reviewers'] as string[];
    expect(reviewers).toHaveLength(4);
  });

  it('pool_active.data.reviewers contains native code-reviewer', () => {
    const frame = getFrame('pool_active');
    const reviewers = frame.data['reviewers'] as string[];
    expect(reviewers).toContain('code-reviewer');
  });

  it('pool_active.data.reviewers contains native security-reviewer', () => {
    const frame = getFrame('pool_active');
    const reviewers = frame.data['reviewers'] as string[];
    expect(reviewers).toContain('security-reviewer');
  });

  it('pool_active.data.reviewers contains external codex', () => {
    const frame = getFrame('pool_active');
    const reviewers = frame.data['reviewers'] as string[];
    expect(reviewers).toContain('codex');
  });

  it('pool_active.data.reviewers contains external gemini', () => {
    const frame = getFrame('pool_active');
    const reviewers = frame.data['reviewers'] as string[];
    expect(reviewers).toContain('gemini');
  });
});

// ── Crash detection ───────────────────────────────────────────────

describe('code_reviewer crash and submitter failure envelope', () => {
  it('code_reviewer_crashed.data.reviewer is "code-reviewer"', () => {
    const frame = getFrame('code_reviewer_crashed');
    expect(frame.data['reviewer']).toBe('code-reviewer');
  });

  it('code_reviewer_crashed.data.status is "failed"', () => {
    const frame = getFrame('code_reviewer_crashed');
    expect(frame.data['status']).toBe('failed');
  });

  it('submitter_returns_failed envelope.status is "failed"', () => {
    const frame = getFrame('submitter_returns_failed');
    const envelope = frame.data['envelope'] as Record<string, unknown>;
    expect(envelope['status']).toBe('failed');
  });

  it('submitter_returns_failed error.code is "reviewer_crashed"', () => {
    const frame = getFrame('submitter_returns_failed');
    const envelope = frame.data['envelope'] as Record<string, unknown>;
    const error = envelope['error'] as Record<string, unknown>;
    expect(error['code']).toBe('reviewer_crashed');
  });

  it('three_reviewers_completed does not include code-reviewer', () => {
    const frame = getFrame('three_reviewers_completed');
    const completed = frame.data['completed'] as string[];
    expect(completed).not.toContain('code-reviewer');
  });

  it('three_reviewers_completed has findings_count summing to 9', () => {
    const frame = getFrame('three_reviewers_completed');
    const counts = frame.data['findings_count'] as Record<string, number>;
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(9);
  });
});

// ── Recovery invocation ───────────────────────────────────────────

describe('recovery invocation via host session', () => {
  it('recovery_invoked.data.invoked_by is "submitting_command_host_session"', () => {
    const frame = getFrame('recovery_invoked');
    expect(frame.data['invoked_by']).toBe('submitting_command_host_session');
  });

  it('recovery_invoked.data.spawn_method is "Task tool"', () => {
    const frame = getFrame('recovery_invoked');
    expect(frame.data['spawn_method']).toBe('Task tool');
  });

  it('recovery_invoked.data.reviewer_name_extracted is "code-reviewer"', () => {
    const frame = getFrame('recovery_invoked');
    expect(frame.data['reviewer_name_extracted']).toBe('code-reviewer');
  });
});

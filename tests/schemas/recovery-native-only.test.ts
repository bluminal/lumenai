/**
 * Layer 1: FR-MMT24 recovery in a native-only pool fixture tests.
 *
 * Validates the synthetic event trace in
 * tests/fixtures/multi-model-teams/failure-handling/recovery-native-only/fixture.json
 * against the FR-MMT24 recovery protocol from
 * docs/specs/multi-model-teams/recovery.md.
 *
 * Acceptance criteria coverage:
 *   [T1] Surviving security-reviewer findings preserved (3 findings)
 *   [T2] Recovered findings carry source_type: "native-recovery"
 *   [T3] Report header verbatim per FR-MMT24 step 5: "Note: reviewer code-reviewer was recovered from a pool failure."
 *   [T4] Recovery invoked by submitting command's host session using Task tool
 *   [T4b] Submitter does NOT own recovery
 *   [T5] Stages 3–6 NOT run; no full reconsolidation
 *   [T6] total_findings === surviving_findings + recovered_findings
 */

import { describe, it, expect } from 'vitest';
import {
  frames,
  FRAME_NAMES,
  getFrame,
  getPoolActiveFrame,
  getSecurityReviewerCompletedFrame,
  getCodeReviewerCrashedFrame,
  getSubmitterReturnsFailedFrame,
  getRecoveryInvokedFrame,
  getFreshReviewerCompletedFrame,
  getLightweightMergeFrame,
  getUnifiedReportEmittedFrame,
  assertSurvivingFindingsPreserved,
  assertRecoveredFindingsAttribution,
  assertReportHeaderVerbatim,
  assertRecoveryInvokedByHostSession,
  assertSubmitterDoesNotOwnRecovery,
  assertStages3To6NotRun,
  assertTotalFindingsCorrect,
} from '../fixtures/multi-model-teams/failure-handling/recovery-native-only/assertions.js';

// ── Fixture sanity ────────────────────────────────────────────────────

describe('recovery-native-only fixture — structure', () => {
  it('has exactly 8 frames in the expected order', () => {
    expect(frames).toHaveLength(FRAME_NAMES.length);
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      expect(frames[i].frame).toBe(FRAME_NAMES[i]);
    }
  });

  it('every frame has required fields: frame, description, assertion', () => {
    for (const frame of frames) {
      expect(frame).toHaveProperty('frame');
      expect(frame).toHaveProperty('description');
      expect(frame).toHaveProperty('assertion');
      expect(typeof frame.frame).toBe('string');
      expect(typeof frame.description).toBe('string');
      expect(typeof frame.assertion).toBe('string');
    }
  });

  it('pool is native-only (multi_model: false)', () => {
    const frame = getPoolActiveFrame();
    expect(frame.multi_model).toBe(false);
  });

  it('pool has exactly two reviewers: code-reviewer and security-reviewer', () => {
    const frame = getPoolActiveFrame();
    expect(frame.reviewers).toContain('code-reviewer');
    expect(frame.reviewers).toContain('security-reviewer');
    expect(frame.reviewers).toHaveLength(2);
  });
});

// ── [T1] Surviving findings preserved ────────────────────────────────

describe('[T1] surviving findings preserved', () => {
  it('lightweight_merge frame has surviving_findings: 3', () => {
    const error = assertSurvivingFindingsPreserved();
    expect(error).toBeNull();
  });

  it('security-reviewer completed with exactly 3 findings', () => {
    const frame = getSecurityReviewerCompletedFrame();
    expect(frame.findings_count).toBe(3);
    expect(frame.status).toBe('completed');
  });

  it('surviving_findings in lightweight_merge matches security-reviewer findings_count', () => {
    const completed = getSecurityReviewerCompletedFrame();
    const merge = getLightweightMergeFrame();
    expect(merge.surviving_findings).toBe(completed.findings_count);
  });
});

// ── [T2] Recovered findings carry source_type: "native-recovery" ─────

describe('[T2] recovered findings carry source_type: "native-recovery"', () => {
  it('fresh_reviewer_completed has source_type: "native-recovery"', () => {
    const error = assertRecoveredFindingsAttribution();
    expect(error).toBeNull();
  });

  it('fresh_reviewer_completed source_type is exactly "native-recovery"', () => {
    const frame = getFreshReviewerCompletedFrame();
    expect(frame.source_type).toBe('native-recovery');
  });

  it('unified_report_emitted recovered_findings_attribution is "native-recovery"', () => {
    const frame = getUnifiedReportEmittedFrame();
    expect(frame.recovered_findings_attribution).toBe('native-recovery');
  });
});

// ── [T3] FR-MMT24 step-5 report header ───────────────────────────────

describe('[T3] report header verbatim per FR-MMT24 step 5', () => {
  it('report header contains verbatim FR-MMT24 step-5 text', () => {
    const error = assertReportHeaderVerbatim();
    expect(error).toBeNull();
  });

  it('report_header_contains includes "Note: reviewer code-reviewer was recovered from a pool failure."', () => {
    const frame = getUnifiedReportEmittedFrame();
    expect(frame.report_header_contains).toContain(
      'Note: reviewer code-reviewer was recovered from a pool failure.'
    );
  });

  it('report header names the correct reviewer (code-reviewer)', () => {
    const frame = getUnifiedReportEmittedFrame();
    expect(frame.report_header_contains).toContain('code-reviewer');
  });

  it('report header contains "recovered from a pool failure"', () => {
    const frame = getUnifiedReportEmittedFrame();
    expect(frame.report_header_contains).toContain('recovered from a pool failure');
  });
});

// ── [T4] Recovery invoked by submitting command's host session ────────

describe('[T4] recovery invoked by submitting command host session', () => {
  it('invoked_by is "submitting_command_host_session"', () => {
    const error = assertRecoveryInvokedByHostSession();
    expect(error).toBeNull();
  });

  it('spawn_method is "Task tool"', () => {
    const frame = getRecoveryInvokedFrame();
    expect(frame.spawn_method).toBe('Task tool');
  });

  it('reviewer_name_extracted is "code-reviewer" (from error.message)', () => {
    const frame = getRecoveryInvokedFrame();
    expect(frame.reviewer_name_extracted).toBe('code-reviewer');
  });

  it('reviewer_name_extracted matches the crashed reviewer from code_reviewer_crashed frame', () => {
    const crashed = getCodeReviewerCrashedFrame();
    const recovery = getRecoveryInvokedFrame();
    expect(recovery.reviewer_name_extracted).toBe(crashed.reviewer);
  });
});

// ── [T4b] Submitter does NOT own recovery ────────────────────────────

describe('[T4b] submitter does NOT own recovery', () => {
  it('submitter_owns_recovery is false', () => {
    const error = assertSubmitterDoesNotOwnRecovery();
    expect(error).toBeNull();
  });

  it('submitter_owns_recovery is exactly false (not truthy)', () => {
    const frame = getRecoveryInvokedFrame();
    expect(frame.submitter_owns_recovery).toBe(false);
  });

  it('submitter envelope status is "failed" (submitter returns, not recovers)', () => {
    const frame = getSubmitterReturnsFailedFrame();
    expect(frame.envelope.status).toBe('failed');
  });

  it('submitter envelope error.code is "reviewer_crashed"', () => {
    const frame = getSubmitterReturnsFailedFrame();
    expect(frame.envelope.error.code).toBe('reviewer_crashed');
  });
});

// ── [T5] Stages 3–6 NOT run ──────────────────────────────────────────

describe('[T5] Stages 3–6 NOT run; lightweight merge only', () => {
  it('stages_3_to_6_run is false', () => {
    const error = assertStages3To6NotRun();
    expect(error).toBeNull();
  });

  it('lightweight_merge stages_3_to_6_run is exactly false', () => {
    const frame = getLightweightMergeFrame();
    expect(frame.stages_3_to_6_run).toBe(false);
  });

  it('lightweight_merge full_reconsolidation_run is exactly false', () => {
    const frame = getLightweightMergeFrame();
    expect(frame.full_reconsolidation_run).toBe(false);
  });
});

// ── [T6] Total findings = surviving + recovered ───────────────────────

describe('[T6] total_findings === surviving_findings + recovered_findings', () => {
  it('total_findings equals sum of surviving and recovered', () => {
    const error = assertTotalFindingsCorrect();
    expect(error).toBeNull();
  });

  it('total_findings is 5 (3 surviving + 2 recovered)', () => {
    const frame = getLightweightMergeFrame();
    expect(frame.total_findings).toBe(5);
  });

  it('surviving_findings (3) + recovered_findings (2) = total_findings (5)', () => {
    const frame = getLightweightMergeFrame();
    expect(frame.surviving_findings + frame.recovered_findings).toBe(frame.total_findings);
  });

  it('report total_findings matches lightweight_merge total_findings', () => {
    const merge = getLightweightMergeFrame();
    const report = getUnifiedReportEmittedFrame();
    expect(report.report_total_findings).toBe(merge.total_findings);
  });
});

// ── Error message extraction integrity ────────────────────────────────

describe('error message extraction — reviewer name extraction from envelope', () => {
  it('error.message in submitter envelope contains the crashed reviewer name', () => {
    const frame = getSubmitterReturnsFailedFrame();
    expect(frame.envelope.error.message).toContain('code-reviewer');
  });

  it('error.message contains "process terminated" (crash signal)', () => {
    const frame = getSubmitterReturnsFailedFrame();
    expect(frame.envelope.error.message).toContain('process terminated');
  });

  it('envelope metadata pool_name matches the scenario pool', () => {
    const pool = getPoolActiveFrame();
    const submitter = getSubmitterReturnsFailedFrame();
    expect(submitter.envelope.metadata.pool_name).toBe(pool.pool_name);
  });

  it('envelope metadata multi_model is false (native-only pool)', () => {
    const frame = getSubmitterReturnsFailedFrame();
    expect(frame.envelope.metadata.multi_model).toBe(false);
  });
});

// ── Causal chain coherence ─────────────────────────────────────────────

describe('causal chain — frame-to-frame coherence', () => {
  it('crashed reviewer in code_reviewer_crashed matches reviewer_name_extracted in recovery_invoked', () => {
    const crashed = getCodeReviewerCrashedFrame();
    const recovery = getRecoveryInvokedFrame();
    expect(recovery.reviewer_name_extracted).toBe(crashed.reviewer);
  });

  it('fresh_reviewer_completed reviewer matches the crashed reviewer', () => {
    const crashed = getCodeReviewerCrashedFrame();
    const fresh = getFreshReviewerCompletedFrame();
    expect(fresh.reviewer).toBe(crashed.reviewer);
  });

  it('recovered_findings in lightweight_merge matches fresh_reviewer findings_count', () => {
    const fresh = getFreshReviewerCompletedFrame();
    const merge = getLightweightMergeFrame();
    expect(merge.recovered_findings).toBe(fresh.findings_count);
  });

  it('code_reviewer_crashed has status: "failed"', () => {
    const frame = getCodeReviewerCrashedFrame();
    expect(frame.status).toBe('failed');
  });

  it('fresh_reviewer_completed has status: "completed"', () => {
    const frame = getFreshReviewerCompletedFrame();
    expect(frame.status).toBe('completed');
  });
});

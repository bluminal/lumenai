/**
 * Assertion helpers for the recovery-native-only failure-handling fixture.
 *
 * Exports typed frame interfaces and assertion functions used by the Vitest
 * suite in tests/schemas/recovery-native-only.test.ts.
 */

import fixtureFrames from './fixture.json' assert { type: 'json' };

// ── Frame types ──────────────────────────────────────────────────────

export interface PoolActiveFrame {
  frame: 'pool_active';
  description: string;
  pool_name: string;
  multi_model: boolean;
  reviewers: string[];
  tasks_submitted: number;
  assertion: string;
}

export interface SecurityReviewerCompletedFrame {
  frame: 'security_reviewer_completed';
  description: string;
  reviewer: string;
  status: string;
  findings_count: number;
  assertion: string;
}

export interface CodeReviewerCrashedFrame {
  frame: 'code_reviewer_crashed';
  description: string;
  reviewer: string;
  status: string;
  error: string;
  assertion: string;
}

export interface SubmitterEnvelope {
  status: string;
  report: null;
  error: {
    code: string;
    message: string;
  };
  metadata: {
    pool_name: string;
    multi_model: boolean;
    task_uuids: string[];
    completed_at: string;
  };
}

export interface SubmitterReturnsFailedFrame {
  frame: 'submitter_returns_failed';
  description: string;
  envelope: SubmitterEnvelope;
  assertion: string;
}

export interface RecoveryInvokedFrame {
  frame: 'recovery_invoked';
  description: string;
  invoked_by: string;
  reviewer_name_extracted: string;
  spawn_method: string;
  submitter_owns_recovery: boolean;
  assertion: string;
}

export interface FreshReviewerCompletedFrame {
  frame: 'fresh_reviewer_completed';
  description: string;
  reviewer: string;
  status: string;
  findings_count: number;
  source_type: string;
  assertion: string;
}

export interface LightweightMergeFrame {
  frame: 'lightweight_merge';
  description: string;
  surviving_findings: number;
  recovered_findings: number;
  total_findings: number;
  stages_3_to_6_run: boolean;
  full_reconsolidation_run: boolean;
  assertion: string;
}

export interface UnifiedReportEmittedFrame {
  frame: 'unified_report_emitted';
  description: string;
  report_header_contains: string;
  recovered_findings_attribution: string;
  report_total_findings: number;
  assertion: string;
}

export type FixtureFrame =
  | PoolActiveFrame
  | SecurityReviewerCompletedFrame
  | CodeReviewerCrashedFrame
  | SubmitterReturnsFailedFrame
  | RecoveryInvokedFrame
  | FreshReviewerCompletedFrame
  | LightweightMergeFrame
  | UnifiedReportEmittedFrame;

export const frames = fixtureFrames as FixtureFrame[];

// ── Frame name registry ──────────────────────────────────────────────

export const FRAME_NAMES = [
  'pool_active',
  'security_reviewer_completed',
  'code_reviewer_crashed',
  'submitter_returns_failed',
  'recovery_invoked',
  'fresh_reviewer_completed',
  'lightweight_merge',
  'unified_report_emitted',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

// ── Frame lookup helpers ─────────────────────────────────────────────

export function getFrame(name: FrameName): FixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Fixture frame "${name}" not found`);
  return f;
}

export function getPoolActiveFrame(): PoolActiveFrame {
  return getFrame('pool_active') as PoolActiveFrame;
}

export function getSecurityReviewerCompletedFrame(): SecurityReviewerCompletedFrame {
  return getFrame('security_reviewer_completed') as SecurityReviewerCompletedFrame;
}

export function getCodeReviewerCrashedFrame(): CodeReviewerCrashedFrame {
  return getFrame('code_reviewer_crashed') as CodeReviewerCrashedFrame;
}

export function getSubmitterReturnsFailedFrame(): SubmitterReturnsFailedFrame {
  return getFrame('submitter_returns_failed') as SubmitterReturnsFailedFrame;
}

export function getRecoveryInvokedFrame(): RecoveryInvokedFrame {
  return getFrame('recovery_invoked') as RecoveryInvokedFrame;
}

export function getFreshReviewerCompletedFrame(): FreshReviewerCompletedFrame {
  return getFrame('fresh_reviewer_completed') as FreshReviewerCompletedFrame;
}

export function getLightweightMergeFrame(): LightweightMergeFrame {
  return getFrame('lightweight_merge') as LightweightMergeFrame;
}

export function getUnifiedReportEmittedFrame(): UnifiedReportEmittedFrame {
  return getFrame('unified_report_emitted') as UnifiedReportEmittedFrame;
}

// ── [T1] Surviving findings preserved ───────────────────────────────

export function assertSurvivingFindingsPreserved(): string | null {
  const frame = getLightweightMergeFrame();
  if (frame.surviving_findings !== 3) {
    return `Expected surviving_findings: 3, got: ${frame.surviving_findings}`;
  }
  return null;
}

// ── [T2] Recovered findings source_type ─────────────────────────────

export function assertRecoveredFindingsAttribution(): string | null {
  const fresh = getFreshReviewerCompletedFrame();
  if (fresh.source_type !== 'native-recovery') {
    return `Expected source_type: "native-recovery", got: "${fresh.source_type}"`;
  }
  const report = getUnifiedReportEmittedFrame();
  if (report.recovered_findings_attribution !== 'native-recovery') {
    return (
      `Expected recovered_findings_attribution: "native-recovery", ` +
      `got: "${report.recovered_findings_attribution}"`
    );
  }
  return null;
}

// ── [T3] FR-MMT24 step-5 report header ──────────────────────────────

export function assertReportHeaderVerbatim(): string | null {
  const frame = getUnifiedReportEmittedFrame();
  const expected = 'Note: reviewer code-reviewer was recovered from a pool failure.';
  if (!frame.report_header_contains.includes(expected)) {
    return (
      `Report header does not contain expected FR-MMT24 step-5 text.\n` +
      `Expected to include: "${expected}"\n` +
      `Got: "${frame.report_header_contains}"`
    );
  }
  return null;
}

// ── [T4] Recovery invoked by host session ────────────────────────────

export function assertRecoveryInvokedByHostSession(): string | null {
  const frame = getRecoveryInvokedFrame();
  const violations: string[] = [];
  if (frame.invoked_by !== 'submitting_command_host_session') {
    violations.push(
      `Expected invoked_by: "submitting_command_host_session", got: "${frame.invoked_by}"`
    );
  }
  if (frame.spawn_method !== 'Task tool') {
    violations.push(`Expected spawn_method: "Task tool", got: "${frame.spawn_method}"`);
  }
  return violations.length > 0 ? violations.join('; ') : null;
}

// ── [T4b] Submitter does NOT own recovery ───────────────────────────

export function assertSubmitterDoesNotOwnRecovery(): string | null {
  const frame = getRecoveryInvokedFrame();
  if (frame.submitter_owns_recovery !== false) {
    return `Expected submitter_owns_recovery: false, got: ${frame.submitter_owns_recovery}`;
  }
  return null;
}

// ── [T5] Stages 3–6 NOT run ─────────────────────────────────────────

export function assertStages3To6NotRun(): string | null {
  const frame = getLightweightMergeFrame();
  const violations: string[] = [];
  if (frame.stages_3_to_6_run !== false) {
    violations.push(`Expected stages_3_to_6_run: false, got: ${frame.stages_3_to_6_run}`);
  }
  if (frame.full_reconsolidation_run !== false) {
    violations.push(
      `Expected full_reconsolidation_run: false, got: ${frame.full_reconsolidation_run}`
    );
  }
  return violations.length > 0 ? violations.join('; ') : null;
}

// ── [T6] Total findings = surviving + recovered ──────────────────────

export function assertTotalFindingsCorrect(): string | null {
  const frame = getLightweightMergeFrame();
  const expected = frame.surviving_findings + frame.recovered_findings;
  if (frame.total_findings !== expected) {
    return (
      `Expected total_findings: ${expected} (${frame.surviving_findings} surviving + ` +
      `${frame.recovered_findings} recovered), got: ${frame.total_findings}`
    );
  }
  return null;
}

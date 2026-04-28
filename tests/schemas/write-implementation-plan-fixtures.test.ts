/**
 * Tasks 45/46: Layer 2 fixtures for /write-implementation-plan multi-model integration.
 *
 * Two fixture scenarios:
 *   (a) multi-model-enabled  — orchestrator invoked with 3 native + 2 external reviewers;
 *                              PM receives unified envelope with mixed attribution.
 *   (b) multi-model-disabled — native-only path; byte-identical to Task 0 baseline (FR-MR23).
 *
 * Task 46 (audit-artifact reuse) is handled in a separate top-level describe block,
 * asserting that the audit sample for (a) passes validateAuditArtifact, lists the
 * correct native reviewers (architect, design-system-agent, tech-lead — NOT
 * code-reviewer or security-reviewer), and satisfies the FR-MR24 filename pattern.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  validateOrchestratorOutput,
  PATH_AND_REASON_HEADER_REGEX,
} from './orchestrator-output.js';
import {
  validateAuditArtifact,
  validateFilename,
} from './audit-artifact.js';

// ── Paths ──────────────────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'multi-model-review',
  'write-implementation-plan'
);

const BASELINE_SNAPSHOT_PATH = join(
  import.meta.dirname,
  '..',
  '__snapshots__',
  'multi-model-review',
  'baseline',
  'write-implementation-plan-baseline.snapshot.md'
);

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadFixture(scenarioDir: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenarioDir, 'fixture.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function loadExpectedEnvelope(scenarioDir: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenarioDir, 'expected_envelope.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface PerReviewerEntry {
  reviewer_id: string;
  source_type: string;
  family: string;
  status: string;
  findings_count: number;
  error_code: string | null;
  usage: unknown;
}

interface FindingSource {
  reviewer_id: string;
  family: string;
  source_type: string;
}

interface RaisedByEntry {
  reviewer_id: string;
  family: string;
  source_type: string;
}

interface Finding {
  finding_id: string;
  source: FindingSource;
  raised_by?: RaisedByEntry[];
}

interface OrchestratorEnvelope {
  per_reviewer_results: PerReviewerEntry[];
  findings: Finding[];
  path_and_reason_header: string;
  aggregator_resolution: { name: string; source: string };
  continuation_event: unknown;
}

// ── (a) multi-model-enabled ────────────────────────────────────────────────────

describe('Task 45(a): write-implementation-plan multi-model-enabled', () => {
  const SCENARIO = 'multi-model-enabled';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedEnvelope(SCENARIO) as unknown as OrchestratorEnvelope;
  const expected = fixture.expected as Record<string, unknown>;

  it('(a.1) expected_envelope passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(a.2) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(a.3) path_and_reason_header matches expected verbatim text', () => {
    expect(envelope.path_and_reason_header).toBe(
      'Review path: multi-model (plan review; reviewers: 3 native + 2 external)'
    );
  });

  it('(a.4) orchestrator_invoked is true in fixture.expected', () => {
    expect(expected.orchestrator_invoked).toBe(true);
  });

  it('(a.5) all 3 native reviewers present in per_reviewer_results', () => {
    const nativeIds = envelope.per_reviewer_results
      .filter((r) => r.source_type === 'native-team')
      .map((r) => r.reviewer_id);
    const expectedNatives = expected.native_reviewers_passed as string[];
    for (const id of expectedNatives) {
      expect(nativeIds).toContain(id);
    }
  });

  it('(a.6) per_reviewer_results contains exactly 3 native entries', () => {
    const natives = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'native-team'
    );
    expect(natives).toHaveLength(3);
  });

  it('(a.7) both external adapters present in per_reviewer_results', () => {
    const externalIds = envelope.per_reviewer_results
      .filter((r) => r.source_type === 'external')
      .map((r) => r.reviewer_id);
    const expectedAdapters = expected.external_adapters as string[];
    for (const id of expectedAdapters) {
      expect(externalIds).toContain(id);
    }
  });

  it('(a.8) per_reviewer_results contains exactly 2 external entries', () => {
    const externals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external'
    );
    expect(externals).toHaveLength(2);
  });

  it('(a.9) per_reviewer_results total is 5 (3 native + 2 external)', () => {
    expect(envelope.per_reviewer_results).toHaveLength(5);
  });

  it('(a.10) consolidated findings count matches expected', () => {
    expect(envelope.findings).toHaveLength(expected.consolidated_findings_count as number);
  });

  it('(a.11) attribution_includes_native: findings from anthropic family present', () => {
    const hasNative = envelope.findings.some((f) => f.source.family === 'anthropic');
    expect(hasNative).toBe(true);
    expect(expected.attribution_includes_native).toBe(true);
  });

  it('(a.12) attribution_includes_external: findings from openai or google family present', () => {
    const hasExternal = envelope.findings.some(
      (f) => f.source.family === 'openai' || f.source.family === 'google'
    );
    expect(hasExternal).toBe(true);
    expect(expected.attribution_includes_external).toBe(true);
  });

  it('(a.13) at least one finding has raised_by carrying both native AND external entries (mixed attribution)', () => {
    const hasMixed = envelope.findings.some((f) => {
      if (!f.raised_by || f.raised_by.length < 2) return false;
      const hasNativeEntry = f.raised_by.some((r) => r.source_type === 'native-team');
      const hasExternalEntry = f.raised_by.some((r) => r.source_type === 'external');
      return hasNativeEntry && hasExternalEntry;
    });
    expect(hasMixed).toBe(true);
  });

  it('(a.14) all per_reviewer_results have status: success', () => {
    for (const entry of envelope.per_reviewer_results) {
      expect(entry.status).toBe('success');
    }
  });

  it('(a.15) external entries carry usage objects with input_tokens and output_tokens', () => {
    const externals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external'
    );
    for (const entry of externals) {
      const usage = entry.usage as Record<string, unknown> | null;
      expect(usage).not.toBeNull();
      expect(typeof (usage as Record<string, unknown>).input_tokens).toBe('number');
      expect(typeof (usage as Record<string, unknown>).output_tokens).toBe('number');
    }
  });

  it('(a.16) native entries have null usage (not_reported for native-team)', () => {
    const natives = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'native-team'
    );
    for (const entry of natives) {
      expect(entry.usage).toBeNull();
    }
  });

  it('(a.17) continuation_event is null (no failure scenario)', () => {
    expect(envelope.continuation_event).toBeNull();
  });

  it('(a.18) audit_file_written flag is true in fixture.expected', () => {
    expect(expected.audit_file_written).toBe(true);
  });
});

// ── (b) multi-model-disabled ───────────────────────────────────────────────────

describe('Task 45(b): write-implementation-plan multi-model-disabled (FR-MR23 regression)', () => {
  const SCENARIO = 'multi-model-disabled';
  const fixture = loadFixture(SCENARIO);
  const expected = fixture.expected as Record<string, unknown>;

  it('(b.1) orchestrator_invoked is false in fixture.expected', () => {
    expect(expected.orchestrator_invoked).toBe(false);
  });

  it('(b.2) native_only_path is true in fixture.expected', () => {
    expect(expected.native_only_path).toBe(true);
  });

  it('(b.3) byte_identical_to_baseline is true (FR-MR23 regression intent declared)', () => {
    expect(expected.byte_identical_to_baseline).toBe(true);
  });

  it('(b.4) baseline_snapshot_path references the correct Task 0 snapshot filename', () => {
    const snapshotRef = expected.baseline_snapshot_path as string;
    expect(snapshotRef).toBeTruthy();
    expect(snapshotRef).toContain('write-implementation-plan-baseline.snapshot.md');
  });

  it('(b.5) Task 0 baseline snapshot file exists on disk', () => {
    expect(existsSync(BASELINE_SNAPSHOT_PATH)).toBe(true);
  });

  it('(b.6) Task 0 baseline snapshot contains redacted placeholders (FR-MR23)', () => {
    const content = readFileSync(BASELINE_SNAPSHOT_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('<<finding-body>>');
  });

  it('(b.7) config has multi_model_review.enabled: false', () => {
    const config = fixture.config as Record<string, unknown>;
    const mmr = config.multi_model_review as Record<string, unknown>;
    expect(mmr.enabled).toBe(false);
  });

  it('(b.8) no expected_envelope.json for disabled scenario (native-only, no orchestrator output)', () => {
    const envPath = join(FIXTURES_BASE, SCENARIO, 'expected_envelope.json');
    // No envelope should exist — native-only path does not produce an orchestrator envelope
    expect(existsSync(envPath)).toBe(false);
  });
});

// ── Task 46: Audit-artifact reuse for write-implementation-plan ────────────────

describe('Task 46: Audit-artifact reuse for write-implementation-plan', () => {
  const SCENARIO = 'multi-model-enabled';
  const fixture = loadFixture(SCENARIO);
  const expected = fixture.expected as Record<string, unknown>;

  const AUDIT_SAMPLE_FILENAME = '2026-04-26-write-implementation-plan-a3f9e12b.md';
  const AUDIT_SAMPLE_PATH = join(FIXTURES_BASE, SCENARIO, 'audit-file-sample.md');

  const auditContent = readFileSync(AUDIT_SAMPLE_PATH, 'utf-8');

  it('(46.1) audit_file_written is true in fixture.expected for the plan invocation', () => {
    expect(expected.audit_file_written).toBe(true);
  });

  it('(46.2) audit-file-sample.md exists at expected path', () => {
    expect(existsSync(AUDIT_SAMPLE_PATH)).toBe(true);
  });

  it('(46.3) audit sample filename matches FR-MR24 write-implementation-plan pattern (D20)', () => {
    const result = validateFilename(AUDIT_SAMPLE_FILENAME);
    if (!result.valid) {
      throw new Error(`Filename validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(46.4) audit sample filename contains "write-implementation-plan" (command-agnostic D20)', () => {
    expect(AUDIT_SAMPLE_FILENAME).toContain('write-implementation-plan');
  });

  it('(46.5) audit sample passes validateAuditArtifact (all 7 FR-MR24 sections)', () => {
    const result = validateAuditArtifact(auditContent);
    if (!result.valid) {
      throw new Error(`Audit artifact validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(46.6) native reviewers section contains "architect"', () => {
    // Extract native reviewers section (between ### Native reviewers and ### External reviewers)
    const nativeSection = auditContent.split('### External reviewers')[0]
      .split('### Native reviewers')[1] ?? '';
    expect(nativeSection.toLowerCase()).toContain('architect');
  });

  it('(46.7) native reviewers section contains "design-system-agent"', () => {
    const nativeSection = auditContent.split('### External reviewers')[0]
      .split('### Native reviewers')[1] ?? '';
    expect(nativeSection.toLowerCase()).toContain('design-system-agent');
  });

  it('(46.8) native reviewers section contains "tech-lead"', () => {
    const nativeSection = auditContent.split('### External reviewers')[0]
      .split('### Native reviewers')[1] ?? '';
    expect(nativeSection.toLowerCase()).toContain('tech-lead');
  });

  it('(46.9) native reviewers section does NOT contain "code-reviewer" (wrong reviewer set)', () => {
    const nativeSection = auditContent.split('### External reviewers')[0]
      .split('### Native reviewers')[1] ?? '';
    expect(nativeSection.toLowerCase()).not.toContain('code-reviewer');
  });

  it('(46.10) native reviewers section does NOT contain "security-reviewer" (wrong reviewer set)', () => {
    const nativeSection = auditContent.split('### External reviewers')[0]
      .split('### Native reviewers')[1] ?? '';
    expect(nativeSection.toLowerCase()).not.toContain('security-reviewer');
  });

  it('(46.11) external reviewers section contains codex-review-prompter', () => {
    const externalSection = auditContent.split('### External reviewers')[1] ?? '';
    expect(externalSection.toLowerCase()).toContain('codex-review-prompter');
  });

  it('(46.12) external reviewers section contains gemini-review-prompter', () => {
    const externalSection = auditContent.split('### External reviewers')[1] ?? '';
    expect(externalSection.toLowerCase()).toContain('gemini-review-prompter');
  });
});

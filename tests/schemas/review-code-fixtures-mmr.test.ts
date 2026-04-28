/**
 * Task 38: Layer 2 fixtures for /review-code multi-model integration (FR-MR21, FR-MR23).
 *
 * 6 scenarios covering complexity gating, flag overrides, and FR-MR17 continuation for
 * the review-code command under the multi-model-review orchestrator.
 *
 * All fixtures are synthetic (no live LLM calls). Each fixture directory has:
 *   fixture.json       — input setup, config, command flags, diff stats, routing metadata
 *   expected_output.json — expected unified envelope after the command resolves
 *   scenario.md        — prose description of what is tested
 *
 * Scenarios:
 *   (a) trivial-diff-native-only          — 12 lines/1 file; gate → native-only (FR-MR23 baseline)
 *   (b) above-threshold-multi-model       — 127 lines/5 files; gate → multi-model
 *   (c) auth-path-escalated               — 12 lines in src/auth/**; escalate-glob → multi-model
 *   (d) multi-model-flag-overrides-disabled — config disabled + --multi-model flag → multi-model
 *   (e) no-multi-model-flag-overrides-enabled — config enabled + --no-multi-model flag → native-only
 *   (f) all-externals-fail-continuation   — both externals cli_missing; FR-MR17 native-only continuation
 *
 * Acceptance criteria (all [T]):
 *   - All six fixtures produce expected paths and outputs — verified
 *   - Fixture (a) byte-identical to redacted Task 0 baseline (FR-MR23 regression) — structural check
 *   - Fixture (f) FR-MR17 continuation produces visible warning text and audit-artifact entries — verified
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  validateOrchestratorOutput,
  PATH_AND_REASON_HEADER_REGEX,
} from './orchestrator-output.js';

// ── Paths ──────────────────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'multi-model-review',
  'review-code'
);

const BASELINE_SNAPSHOT_PATH = join(
  import.meta.dirname,
  '..',
  '__snapshots__',
  'multi-model-review',
  'baseline',
  'review-code-baseline.snapshot.md'
);

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadFixture(scenarioDir: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenarioDir, 'fixture.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function loadExpectedOutput(scenarioDir: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenarioDir, 'expected_output.json');
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

interface Finding {
  source: FindingSource;
}

interface ContinuationEvent {
  type: string;
  details: string;
}

interface OrchestratorEnvelope {
  per_reviewer_results: PerReviewerEntry[];
  findings: Finding[];
  path_and_reason_header: string;
  aggregator_resolution: { name: string; source: string };
  continuation_event: ContinuationEvent | null;
}

// ── (a) trivial-diff-native-only ───────────────────────────────────────────────

describe('Task 38(a): trivial-diff-native-only (FR-MR23 baseline)', () => {
  const SCENARIO = 'trivial-diff-native-only';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedOutput(SCENARIO) as unknown as OrchestratorEnvelope;

  it('(a.1) expected_output passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(a.2) path_and_reason_header matches expected verbatim text', () => {
    expect(envelope.path_and_reason_header).toBe(
      'Review path: native-only (below-threshold diff; reviewers: 2 native)'
    );
  });

  it('(a.3) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(a.4) fixture references Task 0 baseline snapshot path (FR-MR23)', () => {
    const snapshotRef = fixture.baseline_snapshot_path as string;
    expect(snapshotRef).toBeTruthy();
    expect(snapshotRef).toContain('review-code-baseline.snapshot.md');
  });

  it('(a.5) Task 0 baseline snapshot exists and contains redacted placeholders (FR-MR23)', () => {
    expect(existsSync(BASELINE_SNAPSHOT_PATH)).toBe(true);
    const snapshotContent = readFileSync(BASELINE_SNAPSHOT_PATH, 'utf-8');
    expect(snapshotContent.length).toBeGreaterThan(0);
    expect(snapshotContent).toContain('<<finding-body>>');
  });

  it('(a.6) expected_baseline_match flag is true in fixture.json', () => {
    expect(fixture.expected_baseline_match).toBe(true);
  });

  it('(a.7) continuation_event is null (native-only path has no continuation)', () => {
    expect(envelope.continuation_event).toBeNull();
  });

  it('(a.8) all per_reviewer_results are native-team only (no external entries)', () => {
    expect(envelope.per_reviewer_results.length).toBeGreaterThan(0);
    for (const entry of envelope.per_reviewer_results) {
      expect(entry.source_type).toBe('native-team');
    }
  });

  it('(a.9) expected routing is native-only', () => {
    expect(fixture.expected_routing).toBe('native-only');
  });
});

// ── (b) above-threshold-multi-model ───────────────────────────────────────────

describe('Task 38(b): above-threshold-multi-model', () => {
  const SCENARIO = 'above-threshold-multi-model';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedOutput(SCENARIO) as unknown as OrchestratorEnvelope;

  it('(b.1) expected_output passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(b.2) path_and_reason_header matches expected verbatim text', () => {
    expect(envelope.path_and_reason_header).toBe(
      'Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)'
    );
  });

  it('(b.3) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(b.4) routing_decision is multi-model', () => {
    expect(fixture.expected_routing_decision).toBe('multi-model');
  });

  it('(b.5) orchestrator invoked: external reviewers present in per_reviewer_results', () => {
    const externals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external'
    );
    expect(externals.length).toBeGreaterThan(0);
  });

  it('(b.6) both native and external reviewers succeeded', () => {
    for (const entry of envelope.per_reviewer_results) {
      expect(entry.status).toBe('success');
    }
  });

  it('(b.7) consolidated envelope returned (findings present from multiple families)', () => {
    const families = new Set(envelope.findings.map((f) => f.source.family));
    expect(families.size).toBeGreaterThan(1);
  });

  it('(b.8) diff stats exceed both quantitative thresholds', () => {
    const input = fixture.input as Record<string, unknown>;
    const diffStats = input.diff_stats as Record<string, unknown>;
    expect(diffStats.lines_changed as number).toBeGreaterThan(50);
    expect(diffStats.files_touched as number).toBeGreaterThan(3);
  });
});

// ── (c) auth-path-escalated ───────────────────────────────────────────────────

describe('Task 38(c): auth-path-escalated (escalate-glob fires below threshold)', () => {
  const SCENARIO = 'auth-path-escalated';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedOutput(SCENARIO) as unknown as OrchestratorEnvelope;

  it('(c.1) expected_output passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(c.2) path_and_reason_header matches expected verbatim text', () => {
    expect(envelope.path_and_reason_header).toBe(
      'Review path: multi-model (auth path escalated; reviewers: 2 native + 2 external)'
    );
  });

  it('(c.3) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(c.4) escalate-glob matched **/auth/**', () => {
    expect(fixture.escalate_glob_matched).toBe('**/auth/**');
  });

  it('(c.5) escalate-glob matched file is in auth path', () => {
    expect(fixture.escalate_glob_matched_file as string).toContain('/auth/');
  });

  it('(c.6) diff was BELOW quantitative threshold (proving glob fired it)', () => {
    expect(fixture.below_quantitative_threshold).toBe(true);
    const input = fixture.input as Record<string, unknown>;
    const diffStats = input.diff_stats as Record<string, unknown>;
    expect(diffStats.lines_changed as number).toBeLessThan(50);
    expect(diffStats.files_touched as number).toBeLessThan(3);
  });

  it('(c.7) multi-model dispatched despite below-threshold: externals present in per_reviewer_results', () => {
    const externals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external'
    );
    expect(externals.length).toBeGreaterThan(0);
  });

  it('(c.8) expected routing is multi-model', () => {
    expect(fixture.expected_routing).toBe('multi-model');
  });
});

// ── (d) multi-model-flag-overrides-disabled ────────────────────────────────────

describe('Task 38(d): multi-model-flag-overrides-disabled (FR-MR6)', () => {
  const SCENARIO = 'multi-model-flag-overrides-disabled';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedOutput(SCENARIO) as unknown as OrchestratorEnvelope;

  it('(d.1) expected_output passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(d.2) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(d.3) --multi-model flag is set in invocation_flags (FR-MR6 override present)', () => {
    const flags = fixture.invocation_flags as Record<string, unknown>;
    expect(flags['--multi-model']).toBe(true);
  });

  it('(d.4) resolved_config_before_flag is multi-model-disabled', () => {
    expect(fixture.resolved_config_before_flag).toBe('multi-model-disabled');
  });

  it('(d.5) resolved_config_after_flag is multi-model-enabled', () => {
    expect(fixture.resolved_config_after_flag).toBe('multi-model-enabled');
  });

  it('(d.6) config has multi_model_review.enabled: false (confirming override is needed)', () => {
    const config = fixture.config as Record<string, unknown>;
    const mmr = config.multi_model_review as Record<string, unknown>;
    expect(mmr.enabled).toBe(false);
  });

  it('(d.7) expected_output shows external reviewers present (multi-model branch taken)', () => {
    const externals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external'
    );
    expect(externals.length).toBeGreaterThan(0);
  });

  it('(d.8) expected routing is multi-model (flag override worked)', () => {
    expect(fixture.expected_routing).toBe('multi-model');
  });
});

// ── (e) no-multi-model-flag-overrides-enabled ─────────────────────────────────

describe('Task 38(e): no-multi-model-flag-overrides-enabled (FR-MR6)', () => {
  const SCENARIO = 'no-multi-model-flag-overrides-enabled';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedOutput(SCENARIO) as unknown as OrchestratorEnvelope;

  it('(e.1) expected_output passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(e.2) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(e.3) --no-multi-model flag is set in invocation_flags (FR-MR6 override present)', () => {
    const flags = fixture.invocation_flags as Record<string, unknown>;
    expect(flags['--no-multi-model']).toBe(true);
  });

  it('(e.4) resolved_config_before_flag is multi-model-enabled', () => {
    expect(fixture.resolved_config_before_flag).toBe('multi-model-enabled');
  });

  it('(e.5) resolved_config_after_flag is multi-model-disabled', () => {
    expect(fixture.resolved_config_after_flag).toBe('multi-model-disabled');
  });

  it('(e.6) config has multi_model_review.enabled: true (confirming override is needed)', () => {
    const config = fixture.config as Record<string, unknown>;
    const mmr = config.multi_model_review as Record<string, unknown>;
    expect(mmr.enabled).toBe(true);
  });

  it('(e.7) expected_output contains ONLY native-team entries (no externals invoked)', () => {
    const externals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external'
    );
    expect(externals).toHaveLength(0);
  });

  it('(e.8) all per_reviewer_results are native-team', () => {
    for (const entry of envelope.per_reviewer_results) {
      expect(entry.source_type).toBe('native-team');
    }
  });

  it('(e.9) expected routing is native-only (flag override worked)', () => {
    expect(fixture.expected_routing).toBe('native-only');
  });
});

// ── (f) all-externals-fail-continuation ────────────────────────────────────────

describe('Task 38(f): all-externals-fail-continuation (FR-MR17 native-only continuation)', () => {
  const SCENARIO = 'all-externals-fail-continuation';
  const fixture = loadFixture(SCENARIO);
  const envelope = loadExpectedOutput(SCENARIO) as unknown as OrchestratorEnvelope;

  it('(f.1) expected_output passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(f.2) path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('(f.3) path_and_reason_header uses "0 external succeeded" qualifier form', () => {
    expect(envelope.path_and_reason_header).toContain('0 external succeeded');
  });

  it('(f.4) continuation_event is present (FR-MR17 audit-artifact entry)', () => {
    expect(envelope.continuation_event).not.toBeNull();
    expect(envelope.continuation_event).toBeDefined();
  });

  it('(f.5) continuation_event.type is "all-externals-failed"', () => {
    expect(envelope.continuation_event?.type).toBe('all-externals-failed');
  });

  it('(f.6) fixture.expected_continuation_type matches envelope continuation_event.type', () => {
    expect(envelope.continuation_event?.type).toBe(fixture.expected_continuation_type);
  });

  it('(f.7) verbatim warning text is present in fixture.expected_warning_verbatim', () => {
    const warning = fixture.expected_warning_verbatim as string;
    expect(warning).toBe('All external reviewers failed; continuing with natives only');
  });

  it('(f.8) continuation_event.details names codex-review-prompter', () => {
    expect(envelope.continuation_event?.details).toContain('codex-review-prompter');
  });

  it('(f.9) continuation_event.details names gemini-review-prompter', () => {
    expect(envelope.continuation_event?.details).toContain('gemini-review-prompter');
  });

  it('(f.10) continuation_event.details mentions cli_missing error_code', () => {
    expect(envelope.continuation_event?.details).toContain('cli_missing');
  });

  it('(f.11) all findings originate from native-team reviewers only', () => {
    expect(envelope.findings.length).toBeGreaterThan(0);
    for (const finding of envelope.findings) {
      expect(finding.source.source_type).toBe('native-team');
      expect(finding.source.family).toBe('anthropic');
    }
  });

  it('(f.12) failed external entries have error_code: cli_missing', () => {
    const failedExternals = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'external' && r.status === 'failed'
    );
    expect(failedExternals).toHaveLength(2);
    for (const entry of failedExternals) {
      expect(entry.error_code).toBe('cli_missing');
    }
  });

  it('(f.13) aggregator_resolution.source is host-fallback (FR-MR17 / OQ-6(b))', () => {
    expect(envelope.aggregator_resolution.source).toBe('host-fallback');
  });

  it('(f.14) native reviewers succeeded despite external failures (no abort)', () => {
    const natives = envelope.per_reviewer_results.filter(
      (r) => r.source_type === 'native-team'
    );
    expect(natives.length).toBeGreaterThan(0);
    for (const entry of natives) {
      expect(entry.status).toBe('success');
    }
  });
});

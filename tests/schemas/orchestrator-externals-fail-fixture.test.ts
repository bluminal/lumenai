/**
 * Task 23a: Layer 2 fixture — all-externals-fail (FR-MR17 native-only continuation).
 *
 * Asserts:
 *   1. expected_envelope passes validateOrchestratorOutput schema validation.
 *   2. External entries (status=failed) carry the correct error_codes (cli_missing, cli_failed).
 *   3. ALL findings originate from native reviewers only (source_type=native-team, family=anthropic).
 *   4. continuation_event.type === "all-externals-failed".
 *   5. Verbatim warning string exists in the orchestrator agent definition (FR-MR17 raw-string match).
 *   6. continuation_event.details mentions both failed externals with their error_codes.
 *   7. path_and_reason_header passes D21 regex AND uses the "0 external succeeded" qualifier form.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  validateOrchestratorOutput,
  PATH_AND_REASON_HEADER_REGEX,
} from './orchestrator-output';

// ── Paths ─────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'multi-model-review',
  'orchestrator',
  'all-externals-fail'
);

const ORCHESTRATOR_AGENT_MD = join(
  import.meta.dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'agents',
  'multi-model-review-orchestrator.md'
);

// ── Loaders ───────────────────────────────────────────────────────────────────

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf-8')) as Record<string, unknown>;
}

function loadExpectedEnvelope(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'expected_envelope.json'), 'utf-8')) as Record<string, unknown>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
  finding_id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  file: string;
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Task 23a: all-externals-fail fixture (FR-MR17 native-only continuation)', () => {
  const fixture = loadFixture();
  const envelope = loadExpectedEnvelope() as unknown as OrchestratorEnvelope;

  // ---------------------------------------------------------------------------
  // 1. Schema validation — expected_envelope must pass validateOrchestratorOutput
  // ---------------------------------------------------------------------------
  it('1. expected_envelope passes validateOrchestratorOutput schema validation', () => {
    const result = validateOrchestratorOutput(envelope);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 2. External entries carry correct error_codes
  // ---------------------------------------------------------------------------
  it('2. codex-review-prompter (status=failed) has error_code "cli_missing"', () => {
    const entry = envelope.per_reviewer_results.find(
      (r) => r.reviewer_id === 'codex-review-prompter'
    );
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('failed');
    expect(entry?.error_code).toBe('cli_missing');
  });

  it('2b. gemini-review-prompter (status=failed) has error_code "cli_failed"', () => {
    const entry = envelope.per_reviewer_results.find(
      (r) => r.reviewer_id === 'gemini-review-prompter'
    );
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('failed');
    expect(entry?.error_code).toBe('cli_failed');
  });

  // ---------------------------------------------------------------------------
  // 3. ALL findings come from natives only
  // ---------------------------------------------------------------------------
  it('3. all findings have source_type="native-team" and family="anthropic" (no external findings)', () => {
    expect(envelope.findings.length).toBeGreaterThan(0);
    for (const finding of envelope.findings) {
      expect(finding.source.source_type).toBe('native-team');
      expect(finding.source.family).toBe('anthropic');
    }
  });

  it('3b. no finding has a source.reviewer_id matching a failed external adapter', () => {
    const failedExternalIds = ['codex-review-prompter', 'gemini-review-prompter'];
    for (const finding of envelope.findings) {
      expect(failedExternalIds).not.toContain(finding.source.reviewer_id);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. continuation_event.type === "all-externals-failed"
  // ---------------------------------------------------------------------------
  it('4. continuation_event.type is "all-externals-failed"', () => {
    expect(envelope.continuation_event).not.toBeNull();
    expect(envelope.continuation_event?.type).toBe('all-externals-failed');
  });

  it('4b. fixture.expected_continuation_type matches envelope continuation_event.type', () => {
    expect(envelope.continuation_event?.type).toBe(fixture.expected_continuation_type);
  });

  // ---------------------------------------------------------------------------
  // 5. Verbatim warning check — orchestrator agent MD must contain the exact string
  // ---------------------------------------------------------------------------
  it('5. orchestrator agent MD contains verbatim warning: "All external reviewers failed; continuing with natives only"', () => {
    const agentMd = readFileSync(ORCHESTRATOR_AGENT_MD, 'utf-8');
    const verbatimWarning = fixture.expected_warning_verbatim as string;
    expect(agentMd).toContain(verbatimWarning);
  });

  // ---------------------------------------------------------------------------
  // 6. continuation_event.details mentions both failed externals with error_codes
  // ---------------------------------------------------------------------------
  it('6. continuation_event.details mentions codex-review-prompter', () => {
    expect(envelope.continuation_event?.details).toContain('codex-review-prompter');
  });

  it('6b. continuation_event.details mentions gemini-review-prompter', () => {
    expect(envelope.continuation_event?.details).toContain('gemini-review-prompter');
  });

  it('6c. continuation_event.details mentions cli_missing error_code', () => {
    expect(envelope.continuation_event?.details).toContain('cli_missing');
  });

  it('6d. continuation_event.details mentions cli_failed error_code', () => {
    expect(envelope.continuation_event?.details).toContain('cli_failed');
  });

  // ---------------------------------------------------------------------------
  // 7. path_and_reason_header: passes D21 regex AND uses "0 external succeeded"
  // ---------------------------------------------------------------------------
  it('7. path_and_reason_header passes D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header)).toBe(true);
  });

  it('7b. path_and_reason_header uses "0 external succeeded" qualifier form', () => {
    expect(envelope.path_and_reason_header).toContain('0 external succeeded');
  });
});

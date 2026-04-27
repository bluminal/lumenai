/**
 * Task 15a: Gemini Layer 2 success-path fixture tests.
 *
 * Validates the successful Gemini adapter fixture, exercising:
 *   - Markdown-fence stripping quirk (gotcha #1): raw_cli_response_with_quirks contains
 *     ```json fences; expected_envelope.findings must NOT contain fences (adapter stripped them).
 *   - NDJSON streaming quirk (gotcha #2): documented; not present in this success fixture
 *     (single-envelope response), but the recorded invocation confirms standard flag set.
 *   - findings:null normalization (gotcha #3): positive case — findings array is non-null.
 *   - FR-MR26 sandbox-flag parity: --readonly is a substring of recorded-cli-invocation.txt.
 *   - NFR-MR4 usage object: input_tokens, output_tokens, model all present.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateFullAdapterEnvelope } from './adapter-envelope';

// ── Paths ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-review', 'adapters', 'gemini', 'successful'
);

const GEMINI_AGENT_MD = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'gemini-review-prompter.md'
);

// ── Fixture loaders ───────────────────────────────────────────────────────────

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf-8')) as Record<string, unknown>;
}

function loadExpectedEnvelope(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'expected_envelope.json'), 'utf-8')) as Record<string, unknown>;
}

function loadRecordedInvocation(): string {
  return readFileSync(join(FIXTURE_DIR, 'recorded-cli-invocation.txt'), 'utf-8');
}

function loadAgentMd(): string {
  return readFileSync(GEMINI_AGENT_MD, 'utf-8');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Gemini Layer 2 — successful fixture', () => {
  const fixture = loadFixture();
  const envelope = loadExpectedEnvelope();
  const invocation = loadRecordedInvocation();
  const agentMd = loadAgentMd();

  // 1. Schema validation
  it('expected_envelope passes validateFullAdapterEnvelope', () => {
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('status is "success"', () => {
    expect(envelope.status).toBe('success');
  });

  it('error_code is null on success', () => {
    expect(envelope.error_code).toBeNull();
  });

  it('error_message is null on success', () => {
    expect(envelope.error_message).toBeNull();
  });

  // 2. Source attribution on findings[0]
  it('findings[0].source.reviewer_id is "gemini-review-prompter"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(src.reviewer_id).toBe('gemini-review-prompter');
  });

  it('findings[0].source.family is "google"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(src.family).toBe('google');
  });

  it('findings[0].source.source_type is "external"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(src.source_type).toBe('external');
  });

  // 3. FR-MR26 sandbox-flag parity
  describe('FR-MR26 sandbox-flag parity', () => {
    it('recorded-cli-invocation.txt contains --readonly (documented sandbox flag)', () => {
      expect(invocation).toContain('--readonly');
    });

    it('gemini-review-prompter.md documents --readonly as the sandbox flag', () => {
      expect(agentMd).toContain('--readonly');
    });
  });

  // 4. Gotcha #1 — markdown-fence stripping
  describe('Gotcha #1 — markdown-fence stripping', () => {
    it('raw_cli_response_with_quirks contains markdown fences (```json)', () => {
      const raw = fixture.raw_cli_response_with_quirks as string;
      expect(raw).toContain('```json');
    });

    it('expected_envelope findings do NOT contain markdown fences (adapter stripped them)', () => {
      const findingsStr = JSON.stringify(envelope.findings);
      expect(findingsStr).not.toContain('```');
    });
  });

  // 5. NFR-MR4 usage object
  describe('NFR-MR4 usage object', () => {
    it('usage object is present', () => {
      expect(envelope.usage).not.toBeNull();
      expect(envelope.usage).not.toBeUndefined();
    });

    it('usage.input_tokens is a number', () => {
      const usage = envelope.usage as Record<string, unknown>;
      expect(typeof usage.input_tokens).toBe('number');
    });

    it('usage.output_tokens is a number', () => {
      const usage = envelope.usage as Record<string, unknown>;
      expect(typeof usage.output_tokens).toBe('number');
    });

    it('usage.model is a non-empty string', () => {
      const usage = envelope.usage as Record<string, unknown>;
      expect(typeof usage.model).toBe('string');
      expect((usage.model as string).length).toBeGreaterThan(0);
    });
  });

  // 6. raw_output_path present
  it('raw_output_path is a non-empty string', () => {
    expect(typeof envelope.raw_output_path).toBe('string');
    expect((envelope.raw_output_path as string).length).toBeGreaterThan(0);
  });
});

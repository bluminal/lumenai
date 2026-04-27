/**
 * Task 18a: Ollama Layer 2 success-path fixture tests.
 *
 * Validates the success-path fixture for the ollama-review-prompter adapter:
 *   - Text-only tier: bundle is the only context Ollama sees
 *   - Family is `local-<configured-model>` dynamic pattern
 *   - Usage mapping: Ollama's `prompt_eval_count` → `input_tokens`; `eval_count` → `output_tokens`
 *   - Sandbox flags N/A (local execution)
 *   - FR-MR26 parity: HTTP API endpoint substring match (substitutes for sandbox flag parity)
 *
 * Each assertion:
 *   1. Reads fixture.json, recorded-cli-invocation.txt, expected_envelope.json
 *   2. Validates expected_envelope against validateFullAdapterEnvelope
 *   3. Asserts source.reviewer_id, source.family (local- prefix), source.source_type
 *   4. Verifies usage mapping from Ollama raw response fields
 *   5. FR-MR26 parity: HTTP API endpoint present in recorded invocation AND in adapter .md
 *   6. Asserts no --sandbox flags (N/A for Ollama)
 *   7. Asserts usage.model matches configured model
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateFullAdapterEnvelope } from './adapter-envelope';

// ── Paths ────────────────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-review', 'adapters', 'ollama'
);

const OLLAMA_AGENT_MD = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'ollama-review-prompter.md'
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadExpectedEnvelope(scenario: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenario, 'expected_envelope.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function loadFixture(scenario: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenario, 'fixture.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function loadRecordedInvocation(scenario: string): string {
  const path = join(FIXTURES_BASE, scenario, 'recorded-cli-invocation.txt');
  return readFileSync(path, 'utf-8');
}

// ── Ollama Successful ─────────────────────────────────────────────────────────

describe('ollama-successful — happy path, text-only tier, 1 finding', () => {
  const envelope = loadExpectedEnvelope('successful');
  const fixture = loadFixture('successful');
  const invocation = loadRecordedInvocation('successful');
  const agentMd = readFileSync(OLLAMA_AGENT_MD, 'utf-8');

  // 1. Envelope shape validation
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

  it('has exactly 1 finding', () => {
    expect(Array.isArray(envelope.findings)).toBe(true);
    expect((envelope.findings as unknown[]).length).toBe(1);
  });

  // 3. Source field assertions
  it('findings[0].source.reviewer_id === "ollama-review-prompter"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(src.reviewer_id).toBe('ollama-review-prompter');
  });

  it('findings[0].source.family starts with "local-" (dynamic local model pattern)', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(typeof src.family).toBe('string');
    expect((src.family as string).startsWith('local-')).toBe(true);
  });

  it('findings[0].source.family matches "local-qwen2.5-coder" (resolved from qwen2.5-coder:32b)', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(src.family).toBe('local-qwen2.5-coder');
  });

  it('findings[0].source.source_type === "external"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const src = findings[0].source as Record<string, unknown>;
    expect(src.source_type).toBe('external');
  });

  // 4. Usage mapping verification (NFR-MR4)
  it('usage object is present (NFR-MR4)', () => {
    expect(envelope.usage).not.toBeNull();
    expect(envelope.usage).not.toBeUndefined();
  });

  it('usage.input_tokens === ollama_raw_response.prompt_eval_count (usage mapping)', () => {
    const usage = envelope.usage as Record<string, unknown>;
    const rawResponse = fixture.ollama_raw_response as Record<string, unknown>;
    expect(usage.input_tokens).toBe(rawResponse.prompt_eval_count);
  });

  it('usage.output_tokens === ollama_raw_response.eval_count (usage mapping)', () => {
    const usage = envelope.usage as Record<string, unknown>;
    const rawResponse = fixture.ollama_raw_response as Record<string, unknown>;
    expect(usage.output_tokens).toBe(rawResponse.eval_count);
  });

  // 7. usage.model matches configured model
  it('usage.model === "qwen2.5-coder:32b" (configured model surfaced in usage)', () => {
    const usage = envelope.usage as Record<string, unknown>;
    expect(usage.model).toBe('qwen2.5-coder:32b');
  });

  // 5. FR-MR26 parity: HTTP API invocation string match (substitutes sandbox flag parity)
  describe('FR-MR26 parity (HTTP API form): documented endpoint matches recorded invocation', () => {
    it('recorded-cli-invocation.txt contains HTTP API endpoint http://localhost:11434/api/generate', () => {
      expect(invocation).toContain('http://localhost:11434/api/generate');
    });

    it('ollama-review-prompter.md documents http://localhost:11434/api/generate (source authority)', () => {
      expect(agentMd).toContain('http://localhost:11434/api/generate');
    });
  });

  // 6. Sandbox flags N/A: recorded invocation must NOT contain --sandbox
  it('recorded-cli-invocation.txt does NOT contain --sandbox (sandbox N/A for Ollama)', () => {
    expect(invocation).not.toContain('--sandbox');
  });

  it('recorded-cli-invocation.txt does NOT contain --approval-mode (sandbox N/A for Ollama)', () => {
    expect(invocation).not.toContain('--approval-mode');
  });

  // raw_output_path present and non-empty
  it('raw_output_path is a non-empty string', () => {
    expect(typeof envelope.raw_output_path).toBe('string');
    expect((envelope.raw_output_path as string).length).toBeGreaterThan(0);
  });
});

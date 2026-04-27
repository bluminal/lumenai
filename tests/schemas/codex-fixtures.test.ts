/**
 * Task 12: Codex Layer 2 behavioral fixture tests.
 *
 * Validates 4 fixture scenarios for the codex-review-prompter adapter:
 *   (a) successful      — happy path, 2 findings, usage, sandbox flags FR-MR26
 *   (b) malformed-output-retry — first and retry calls both fail to parse → parse_failed
 *   (c) auth-failure    — codex auth status exits non-zero → cli_auth_failed
 *   (d) cli-missing     — which codex returns nothing → cli_missing
 *
 * Each scenario:
 *   1. Reads fixture.json + expected_envelope.json
 *   2. Validates expected_envelope against validateFullAdapterEnvelope
 *   3. Asserts error_code values per scenario
 *   4. For success: asserts source.source_type + source.reviewer_id on all findings
 *   5. FR-MR26 parity: asserts documented sandbox-flag set is substring of recorded invocation
 *   6. For error cases: asserts error_message is non-empty and references appropriate remediation
 *   7. For parse_failed: asserts error_message contains "retry"
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateFullAdapterEnvelope } from './adapter-envelope';

// ── Paths ────────────────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-review', 'adapters', 'codex'
);

const CODEX_AGENT_MD = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'codex-review-prompter.md'
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

// ── (a) Successful ────────────────────────────────────────────────────────────

describe('(a) successful — happy path, 2 findings', () => {
  const envelope = loadExpectedEnvelope('successful');
  const fixture = loadFixture('successful');

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

  it('has exactly 2 findings', () => {
    expect(Array.isArray(envelope.findings)).toBe(true);
    expect((envelope.findings as unknown[]).length).toBe(2);
  });

  it('all findings have source.source_type: "external"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    for (const f of findings) {
      const src = f.source as Record<string, unknown>;
      expect(src.source_type).toBe('external');
    }
  });

  it('all findings have source.reviewer_id: "codex-review-prompter"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    for (const f of findings) {
      const src = f.source as Record<string, unknown>;
      expect(src.reviewer_id).toBe('codex-review-prompter');
    }
  });

  it('all findings have source.family: "openai"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    for (const f of findings) {
      const src = f.source as Record<string, unknown>;
      expect(src.family).toBe('openai');
    }
  });

  it('usage object is present with input_tokens, output_tokens, model (NFR-MR4)', () => {
    expect(envelope.usage).not.toBeNull();
    const usage = envelope.usage as Record<string, unknown>;
    expect(typeof usage.input_tokens).toBe('number');
    expect(typeof usage.output_tokens).toBe('number');
    expect(typeof usage.model).toBe('string');
  });

  it('raw_output_path is echoed from fixture input', () => {
    expect(typeof envelope.raw_output_path).toBe('string');
    expect((envelope.raw_output_path as string).length).toBeGreaterThan(0);
    expect(envelope.raw_output_path).toBe(fixture.raw_output_path);
  });

  describe('FR-MR26 sandbox-flag parity: documented flags are substrings of recorded invocation', () => {
    let invocation: string;
    let agentMd: string;

    invocation = loadRecordedInvocation('successful');
    agentMd = readFileSync(CODEX_AGENT_MD, 'utf-8');

    it('recorded-cli-invocation.txt contains --sandbox read-only', () => {
      expect(invocation).toContain('--sandbox read-only');
    });

    it('recorded-cli-invocation.txt contains --approval-mode never', () => {
      expect(invocation).toContain('--approval-mode never');
    });

    it('recorded-cli-invocation.txt contains --json', () => {
      expect(invocation).toContain('--json');
    });

    it('codex-review-prompter.md documents --sandbox read-only (source authority)', () => {
      expect(agentMd).toContain('--sandbox read-only');
    });

    it('codex-review-prompter.md documents --approval-mode never (source authority)', () => {
      expect(agentMd).toContain('--approval-mode never');
    });

    it('codex-review-prompter.md documents --json (source authority)', () => {
      expect(agentMd).toContain('--json');
    });
  });
});

// ── (b) Malformed Output — Retry Then Fail ────────────────────────────────────

describe('(b) malformed-output-retry — retry-then-fail → parse_failed', () => {
  const envelope = loadExpectedEnvelope('malformed-output-retry');

  it('expected_envelope passes validateFullAdapterEnvelope', () => {
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('status is "failed"', () => {
    expect(envelope.status).toBe('failed');
  });

  it('error_code is "parse_failed"', () => {
    expect(envelope.error_code).toBe('parse_failed');
  });

  it('findings is empty array', () => {
    expect(envelope.findings).toEqual([]);
  });

  it('error_message is non-empty', () => {
    expect(typeof envelope.error_message).toBe('string');
    expect((envelope.error_message as string).length).toBeGreaterThan(0);
  });

  it('error_message contains "retry" (verifies retry-then-fail path, FR-MR8 step 6)', () => {
    expect((envelope.error_message as string).toLowerCase()).toContain('retry');
  });

  it('error_message references raw_output_path (raw output preserved)', () => {
    expect(envelope.error_message as string).toContain('raw_output_path');
  });
});

// ── (c) Auth Failure ──────────────────────────────────────────────────────────

describe('(c) auth-failure — codex auth status non-zero → cli_auth_failed', () => {
  const envelope = loadExpectedEnvelope('auth-failure');
  const fixture = loadFixture('auth-failure');

  it('expected_envelope passes validateFullAdapterEnvelope', () => {
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('status is "failed"', () => {
    expect(envelope.status).toBe('failed');
  });

  it('error_code is "cli_auth_failed"', () => {
    expect(envelope.error_code).toBe('cli_auth_failed');
  });

  it('findings is empty array', () => {
    expect(envelope.findings).toEqual([]);
  });

  it('usage is null (no CLI invocation reached)', () => {
    expect(envelope.usage).toBeNull();
  });

  it('error_message is non-empty', () => {
    expect(typeof envelope.error_message).toBe('string');
    expect((envelope.error_message as string).length).toBeGreaterThan(0);
  });

  it('error_message references "codex login" as remediation', () => {
    expect(envelope.error_message as string).toContain('codex login');
  });

  it('fixture records auth check exit_status as non-zero', () => {
    const authCheck = fixture.auth_check as Record<string, unknown>;
    expect(authCheck.exit_status).not.toBe(0);
  });

  it('raw_output_path is echoed from fixture input', () => {
    expect(envelope.raw_output_path).toBe(fixture.raw_output_path);
  });
});

// ── (d) CLI Missing ───────────────────────────────────────────────────────────

describe('(d) cli-missing — which codex returns nothing → cli_missing', () => {
  const envelope = loadExpectedEnvelope('cli-missing');
  const fixture = loadFixture('cli-missing');

  it('expected_envelope passes validateFullAdapterEnvelope', () => {
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('status is "failed"', () => {
    expect(envelope.status).toBe('failed');
  });

  it('error_code is "cli_missing"', () => {
    expect(envelope.error_code).toBe('cli_missing');
  });

  it('findings is empty array', () => {
    expect(envelope.findings).toEqual([]);
  });

  it('usage is null (no CLI invocation reached)', () => {
    expect(envelope.usage).toBeNull();
  });

  it('error_message is non-empty', () => {
    expect(typeof envelope.error_message).toBe('string');
    expect((envelope.error_message as string).length).toBeGreaterThan(0);
  });

  it('error_message references install instructions (npm install -g @openai/codex)', () => {
    expect(envelope.error_message as string).toContain('npm install -g @openai/codex');
  });

  it('error_message references adapter-recipes.md', () => {
    expect(envelope.error_message as string).toContain('adapter-recipes.md');
  });

  it('fixture records which-codex exit_status as non-zero', () => {
    const presenceCheck = fixture.cli_presence_check as Record<string, unknown>;
    expect(presenceCheck.exit_status).not.toBe(0);
  });

  it('fixture records which-codex stdout as empty string', () => {
    const presenceCheck = fixture.cli_presence_check as Record<string, unknown>;
    expect(presenceCheck.stdout).toBe('');
  });

  it('raw_output_path is echoed from fixture input', () => {
    expect(envelope.raw_output_path).toBe(fixture.raw_output_path);
  });
});

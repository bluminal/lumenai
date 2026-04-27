import { describe, it, expect } from 'vitest';
import { validateFullAdapterEnvelope, STATUS_VALUES, ERROR_CODE_VALUES } from './adapter-envelope';

const validFinding = {
  finding_id: 'security.handleLogin.missing-csrf-check',
  severity: 'high',
  category: 'security',
  title: 'Missing CSRF check',
  description: 'No CSRF validation in handleLogin',
  file: 'src/auth/handleLogin.ts',
  symbol: 'handleLogin',
  source: { reviewer_id: 'codex-review-prompter', family: 'openai', source_type: 'external' },
};

const validSuccessEnvelope = {
  status: 'success',
  error_code: null,
  error_message: null,
  findings: [validFinding],
  usage: { input_tokens: 4521, output_tokens: 312, model: 'gpt-5' },
  raw_output_path: 'docs/reviews/raw/codex-abc.json',
};

describe('Task 11: validateFullAdapterEnvelope', () => {
  // Test 1: Valid envelope (success with valid finding) passes
  it('passes for a valid success envelope with a valid finding', () => {
    const result = validateFullAdapterEnvelope(validSuccessEnvelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 2: Valid envelope (success, empty findings) passes
  it('passes for a valid success envelope with empty findings array', () => {
    const envelope = {
      status: 'success',
      error_code: null,
      error_message: null,
      findings: [],
      usage: { input_tokens: 4521, output_tokens: 89, model: 'gpt-5' },
      raw_output_path: 'docs/reviews/raw/codex-abc124.json',
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 3: Valid envelope (failed with cli_missing) passes
  it('passes for a valid failed envelope with cli_missing error_code', () => {
    const envelope = {
      status: 'failed',
      error_code: 'cli_missing',
      error_message: "The 'gemini' CLI is not installed.",
      findings: [],
      usage: null,
      raw_output_path: 'docs/reviews/raw/gemini-abc125.json',
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 4: Valid envelope (failed with parse_failed + usage object) passes
  it('passes for a failed envelope with parse_failed error_code and usage object', () => {
    const envelope = {
      status: 'failed',
      error_code: 'parse_failed',
      error_message: 'Adapter could not parse codex output as canonical envelope after retry.',
      findings: [],
      usage: { input_tokens: 4521, output_tokens: 156, model: 'gpt-5' },
      raw_output_path: 'docs/reviews/raw/codex-abc126.json',
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 5: Envelope missing status fails
  it('fails when envelope is missing status field', () => {
    const { status: _s, ...envelope } = validSuccessEnvelope;
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  // Test 6: Envelope with unknown error_code fails
  it('fails when error_code is an unknown value', () => {
    const envelope = {
      ...validSuccessEnvelope,
      status: 'failed',
      error_code: 'network_error',
      error_message: 'Something went wrong',
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('error_code'))).toBe(true);
  });

  // Test 7: Envelope with success and non-null error_code fails
  it('fails when status is success but error_code is non-null', () => {
    const envelope = {
      ...validSuccessEnvelope,
      error_code: 'cli_missing',
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('error_code'))).toBe(true);
  });

  // Test 8: Envelope with failed and missing error_code fails
  it('fails when status is failed but error_code is missing', () => {
    const envelope = {
      status: 'failed',
      error_code: null,
      error_message: 'Something failed',
      findings: [],
      usage: null,
      raw_output_path: 'docs/reviews/raw/codex-abc.json',
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('error_code'))).toBe(true);
  });

  // Test 9: Envelope with finding containing line number in finding_id (security.x:42) fails
  it('fails when finding_id contains a colon-prefixed line number (security.x:42)', () => {
    const badFinding = { ...validFinding, finding_id: 'security.handleLogin:42' };
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('findings[0]:'))).toBe(true);
    expect(result.errors.some((e) => e.includes('finding_id'))).toBe(true);
  });

  // Test 10: Envelope with finding containing L42 in finding_id fails
  it('fails when finding_id contains L<number> pattern', () => {
    const badFinding = { ...validFinding, finding_id: 'security.handleLoginL42' };
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('findings[0]:'))).toBe(true);
  });

  // Test 11: Envelope with finding containing line_42 in finding_id fails
  it('fails when finding_id contains line_<number> pattern', () => {
    const badFinding = { ...validFinding, finding_id: 'security.handleLogin.line_42' };
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('findings[0]:'))).toBe(true);
  });

  // Test 12: Envelope with finding missing required source field fails
  it('fails when finding is missing the required source field', () => {
    const { source: _src, ...badFinding } = validFinding;
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('findings[0]:') && e.includes('source'))).toBe(true);
  });

  // Test 13: Envelope with finding missing required severity field fails
  it('fails when finding is missing the required severity field', () => {
    const { severity: _sev, ...badFinding } = validFinding;
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('findings[0]:') && e.includes('severity'))).toBe(true);
  });

  // Test 14: Envelope with two valid findings — both pass
  it('passes when envelope has two valid findings', () => {
    const anotherFinding = {
      ...validFinding,
      finding_id: 'performance.queryUser.missing-index',
      severity: 'medium',
      category: 'performance',
      title: 'Missing database index on user query',
      description: 'The queryUser function lacks a database index.',
      file: 'src/db/queryUser.ts',
      symbol: 'queryUser',
    };
    const envelope = { ...validSuccessEnvelope, findings: [validFinding, anotherFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 15: Envelope with one valid + one invalid finding — failure with the invalid finding's index
  it('fails with correct index prefix when one of two findings is invalid', () => {
    const badFinding = { ...validFinding, severity: 'ultra-critical' };
    const envelope = { ...validSuccessEnvelope, findings: [validFinding, badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    // First finding is valid, so no findings[0]: errors
    expect(result.errors.some((e) => e.startsWith('findings[0]:'))).toBe(false);
    // Second finding is invalid, error must be prefixed with findings[1]:
    expect(result.errors.some((e) => e.startsWith('findings[1]:'))).toBe(true);
  });

  // Test 16: Envelope with unknown severity value in finding fails
  it('fails when finding has an unknown severity value', () => {
    const badFinding = { ...validFinding, severity: 'urgent' };
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('severity'))).toBe(true);
  });

  // Test 17: Envelope with unknown source.source_type value in finding fails
  it('fails when finding has an unknown source.source_type value', () => {
    const badFinding = {
      ...validFinding,
      source: { ...validFinding.source, source_type: 'third-party' },
    };
    const envelope = { ...validSuccessEnvelope, findings: [badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('source_type'))).toBe(true);
  });

  // Test 18: Envelope with valid source.source_type "external" passes
  it('passes when finding has source_type "external"', () => {
    const finding = {
      ...validFinding,
      source: { ...validFinding.source, source_type: 'external' },
    };
    const envelope = { ...validSuccessEnvelope, findings: [finding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
  });

  // Test 19: Envelope with valid source.source_type "native-team" passes
  it('passes when finding has source_type "native-team"', () => {
    const finding = {
      ...validFinding,
      source: { ...validFinding.source, source_type: 'native-team' },
    };
    const envelope = { ...validSuccessEnvelope, findings: [finding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
  });

  // Test 20: Envelope with valid source.source_type "native-recovery" passes
  it('passes when finding has source_type "native-recovery"', () => {
    const finding = {
      ...validFinding,
      source: { ...validFinding.source, source_type: 'native-recovery' },
    };
    const envelope = { ...validSuccessEnvelope, findings: [finding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
  });

  // Test 21: Per-finding error messages include findings[INDEX]: prefix
  it('prefixes per-finding errors with findings[INDEX]: to identify which finding failed', () => {
    const badFinding = { ...validFinding, finding_id: 'security.auth:100', severity: 'invalid' };
    const envelope = { ...validSuccessEnvelope, findings: [validFinding, validFinding, badFinding] };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    // All errors from the third finding must be prefixed with findings[2]:
    const findingErrors = result.errors.filter((e) => e.includes('findings['));
    expect(findingErrors.every((e) => e.startsWith('findings[2]:'))).toBe(true);
  });

  // Test 22: Envelope missing raw_output_path fails
  it('fails when envelope is missing raw_output_path', () => {
    const { raw_output_path: _rop, ...envelope } = validSuccessEnvelope;
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('raw_output_path'))).toBe(true);
  });

  // Test 23: Envelope with non-array findings fails
  it('fails when findings is not an array', () => {
    const envelope = { ...validSuccessEnvelope, findings: 'not-an-array' };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('findings'))).toBe(true);
  });

  // Test 24: Envelope with usage: null passes (per NFR-MR4 "when CLI does not report usage")
  it('passes when usage is null (CLI does not report usage, per NFR-MR4)', () => {
    const envelope = { ...validSuccessEnvelope, usage: null };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 25: Envelope with usage object missing required keys fails
  it('fails when usage object is missing required keys', () => {
    const envelope = {
      ...validSuccessEnvelope,
      usage: { input_tokens: 100 }, // missing output_tokens and model
    };
    const result = validateFullAdapterEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('output_tokens'))).toBe(true);
    expect(result.errors.some((e) => e.includes('model'))).toBe(true);
  });

  // Bonus: re-exported constants are accessible and correct
  it('re-exports STATUS_VALUES and ERROR_CODE_VALUES from adapter-contract', () => {
    expect(STATUS_VALUES).toContain('success');
    expect(STATUS_VALUES).toContain('failed');
    expect(ERROR_CODE_VALUES).toContain('cli_missing');
    expect(ERROR_CODE_VALUES).toContain('parse_failed');
    expect(ERROR_CODE_VALUES).toContain('timeout');
  });
});

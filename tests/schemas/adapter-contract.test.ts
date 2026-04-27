/**
 * Tests for the adapter contract envelope validator.
 *
 * Source of truth: docs/specs/multi-model-review/adapter-contract.md
 * Validates per FR-MR9 (input/output envelope) and FR-MR16 (error_code enum).
 *
 * Covers:
 * 1.  Document file exists
 * 2.  Document references FR-MR9
 * 3.  Document references FR-MR16
 * 4.  Document references NFR-MR4
 * 5.  Document contains all 7 error_code enum values
 * 6.  Example 1 (success with findings) passes validator
 * 7.  Example 2 (clean review, empty findings) passes validator
 * 8.  Example 3 (cli_missing) passes validator
 * 9.  Example 4 (parse_failed terminal) passes validator
 * 10. Rejects envelope missing status
 * 11. Rejects envelope with unknown error_code
 * 12. Rejects success with non-null error_code
 * 13. Rejects failed without error_code
 * 14. Rejects non-array findings
 * 15. Rejects missing raw_output_path
 * 16. All 7 error_code enum values accepted when status=failed
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateAdapterEnvelope, ERROR_CODE_VALUES } from './adapter-contract.js';

const CONTRACT_PATH = resolve(
  __dirname,
  '../../docs/specs/multi-model-review/adapter-contract.md',
);

describe('Task 4: adapter-contract.md and validator', () => {
  // ── Document presence and content ────────────────────────────────

  describe('Document', () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(CONTRACT_PATH, 'utf8');
    });

    // 1
    it('file exists', () => {
      expect(existsSync(CONTRACT_PATH)).toBe(true);
    });

    // 2
    it('references FR-MR9', () => {
      expect(content).toContain('FR-MR9');
    });

    // 3
    it('references FR-MR16', () => {
      expect(content).toContain('FR-MR16');
    });

    // 4
    it('references NFR-MR4', () => {
      expect(content).toContain('NFR-MR4');
    });

    // 5
    it('lists all 7 error_code enum values', () => {
      for (const v of ERROR_CODE_VALUES) {
        expect(content, `document should contain error_code value: ${v}`).toContain(v);
      }
    });
  });

  // ── Validator — example envelopes from the doc ────────────────────

  describe('Validator — example envelopes from the doc', () => {
    // 6
    it('Example 1 (success with findings) passes', () => {
      const env = {
        status: 'success',
        error_code: null,
        error_message: null,
        findings: [
          {
            finding_id: 'security.handleLogin.missing-csrf-check',
            severity: 'high',
            category: 'security',
            title: 'Missing CSRF check in handleLogin',
            description: 'The handleLogin function does not validate CSRF tokens.',
            file: 'src/auth/handleLogin.ts',
            symbol: 'handleLogin',
            source: {
              reviewer_id: 'codex-review-prompter',
              family: 'openai',
              source_type: 'external',
            },
          },
        ],
        usage: { input_tokens: 4521, output_tokens: 312, model: 'gpt-5' },
        raw_output_path: 'docs/reviews/raw/codex-abc123.json',
      };
      const r = validateAdapterEnvelope(env);
      expect(r.valid).toBe(true);
    });

    // 7
    it('Example 2 (clean review, empty findings) passes', () => {
      const env = {
        status: 'success',
        error_code: null,
        error_message: null,
        findings: [],
        usage: { input_tokens: 4521, output_tokens: 89, model: 'gpt-5' },
        raw_output_path: 'docs/reviews/raw/codex-abc124.json',
      };
      expect(validateAdapterEnvelope(env).valid).toBe(true);
    });

    // 8
    it('Example 3 (cli_missing) passes', () => {
      const env = {
        status: 'failed',
        error_code: 'cli_missing',
        error_message: "The 'gemini' CLI is not installed. See adapter-recipes.md for installation.",
        findings: [],
        usage: null,
        raw_output_path: 'docs/reviews/raw/gemini-abc125.json',
      };
      expect(validateAdapterEnvelope(env).valid).toBe(true);
    });

    // 9
    it('Example 4 (parse_failed terminal after retry) passes', () => {
      const env = {
        status: 'failed',
        error_code: 'parse_failed',
        error_message:
          'Adapter could not parse codex output as canonical envelope after retry. Raw output preserved at raw_output_path.',
        findings: [],
        usage: { input_tokens: 4521, output_tokens: 156, model: 'gpt-5' },
        raw_output_path: 'docs/reviews/raw/codex-abc126.json',
      };
      expect(validateAdapterEnvelope(env).valid).toBe(true);
    });
  });

  // ── Validator — rejection cases ───────────────────────────────────

  describe('Validator — rejection cases', () => {
    // 10
    it('rejects envelope missing status', () => {
      const r = validateAdapterEnvelope({ findings: [], raw_output_path: 'x' });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('status'))).toBe(true);
    });

    // 11
    it('rejects envelope with unknown error_code', () => {
      const r = validateAdapterEnvelope({
        status: 'failed',
        error_code: 'bogus_code',
        findings: [],
        raw_output_path: 'x',
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('error_code'))).toBe(true);
    });

    // 12
    it('rejects success with non-null error_code', () => {
      const r = validateAdapterEnvelope({
        status: 'success',
        error_code: 'cli_missing',
        findings: [],
        raw_output_path: 'x',
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('error_code'))).toBe(true);
    });

    // 13
    it('rejects failed without error_code', () => {
      const r = validateAdapterEnvelope({
        status: 'failed',
        findings: [],
        raw_output_path: 'x',
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('error_code'))).toBe(true);
    });

    // 14
    it('rejects non-array findings', () => {
      const r = validateAdapterEnvelope({
        status: 'success',
        error_code: null,
        findings: 'not an array',
        raw_output_path: 'x',
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('findings'))).toBe(true);
    });

    // 15
    it('rejects missing raw_output_path', () => {
      const r = validateAdapterEnvelope({
        status: 'success',
        error_code: null,
        findings: [],
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('raw_output_path'))).toBe(true);
    });

    // 16
    it('all 7 error_code enum values accepted when status=failed', () => {
      for (const code of ERROR_CODE_VALUES) {
        const r = validateAdapterEnvelope({
          status: 'failed',
          error_code: code,
          error_message: 'test',
          findings: [],
          usage: null,
          raw_output_path: 'x',
        });
        expect(r.valid, `error_code="${code}" should be valid`).toBe(true);
      }
    });
  });
});

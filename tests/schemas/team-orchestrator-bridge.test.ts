/**
 * Layer 1: Schema validation tests for team-orchestrator-bridge input/output shapes.
 *
 * Validates (a) bridge input shape and (b) bridge output — array of canonical findings
 * each carrying source.source_type: "native-team" (FR-MMT20 Bridge Rule 4).
 *
 * Per the normative contracts in:
 *   plugins/synthex-plus/agents/team-orchestrator-bridge.md (FR-MMT20)
 *   plugins/synthex/agents/_shared/canonical-finding-schema.md (FR-MR13)
 *
 * Covers:
 * - FR-MMT20 mailbox envelope sample (well-formed output passes)
 * - Rejection: findings missing source.source_type
 * - Rejection: findings with wrong source_type ("external", "native-recovery")
 * - Rejection: per_reviewer_results entry missing reviewer_id
 * - Acceptance: per_reviewer_results with status "failed" and error_code "parse_failed"
 * - Bridge input validation (required fields, non-empty reviewer_names)
 */

import { describe, it, expect } from 'vitest';
import {
  validateBridgeInput,
  validateBridgeOutput,
} from './team-orchestrator-bridge.js';

// ── FR-MMT20 mailbox shape sample (normative) ────────────────────

const VALID_INPUT = {
  team_name: 'review-a3f7b2c1',
  reviewer_names: ['code-reviewer', 'security-reviewer'],
  mailbox_base_path: '~/.claude/teams',
};

const VALID_FINDING = {
  finding_id: 'security.handleLogin.missing-csrf',
  severity: 'high',
  category: 'security',
  title: 'Missing CSRF check in handleLogin',
  description: 'The handleLogin function does not validate CSRF tokens.',
  file: 'src/auth/handleLogin.ts',
  source: {
    reviewer_id: 'code-reviewer',
    family: 'anthropic',
    source_type: 'native-team',
  },
};

const VALID_OUTPUT = {
  per_reviewer_results: [
    {
      reviewer_id: 'code-reviewer',
      source_type: 'native-team',
      family: 'anthropic',
      status: 'success',
      findings_count: 2,
      error_code: null,
      report_markdown: '## Code Review Report\n\nFound 2 issues.',
    },
  ],
  findings: [VALID_FINDING],
};

// ── Tests ─────────────────────────────────────────────────────────

describe('Team Orchestrator Bridge — Schema Validator', () => {

  // ── Bridge output: well-formed envelope ────────────────────────

  describe('Bridge output: well-formed FR-MMT20 envelope', () => {
    it('accepts well-formed output with source.source_type "native-team"', () => {
      const result = validateBridgeOutput(VALID_OUTPUT);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts output finding with source.source_type "native-team"', () => {
      const output = {
        ...VALID_OUTPUT,
        findings: [
          {
            ...VALID_FINDING,
            source: { ...VALID_FINDING.source, source_type: 'native-team' },
          },
        ],
      };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(true);
    });

    it('accepts output with empty findings array (parse_failed scenario)', () => {
      const output = {
        per_reviewer_results: [
          {
            reviewer_id: 'security-reviewer',
            source_type: 'native-team',
            family: 'anthropic',
            status: 'failed',
            findings_count: 0,
            error_code: 'parse_failed',
            report_markdown: '',
          },
        ],
        findings: [],
      };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(true);
    });
  });

  // ── Bridge output: source_type enforcement ──────────────────────

  describe('Bridge output: source_type invariant (FR-MMT20 Rule 4)', () => {
    it('rejects output finding with missing source.source_type', () => {
      const badFinding = {
        ...VALID_FINDING,
        source: {
          reviewer_id: 'code-reviewer',
          family: 'anthropic',
          // source_type intentionally omitted
        },
      };
      const output = { ...VALID_OUTPUT, findings: [badFinding] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source_type'))).toBe(true);
    });

    it('rejects output finding with wrong source_type "external"', () => {
      const badFinding = {
        ...VALID_FINDING,
        source: { ...VALID_FINDING.source, source_type: 'external' },
      };
      const output = { ...VALID_OUTPUT, findings: [badFinding] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source_type'))).toBe(true);
    });

    it('rejects output finding with wrong source_type "native-recovery"', () => {
      const badFinding = {
        ...VALID_FINDING,
        source: { ...VALID_FINDING.source, source_type: 'native-recovery' },
      };
      const output = { ...VALID_OUTPUT, findings: [badFinding] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source_type'))).toBe(true);
    });

    it('rejects output finding with missing source object entirely', () => {
      const { source: _omitted, ...findingWithoutSource } = VALID_FINDING;
      const output = { ...VALID_OUTPUT, findings: [findingWithoutSource] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source'))).toBe(true);
    });
  });

  // ── Bridge output: per_reviewer_results validation ──────────────

  describe('Bridge output: per_reviewer_results validation', () => {
    it('rejects output with per_reviewer_results entry missing reviewer_id', () => {
      const badEntry = {
        // reviewer_id intentionally omitted
        source_type: 'native-team',
        family: 'anthropic',
        status: 'success',
        findings_count: 1,
        error_code: null,
        report_markdown: 'Report.',
      };
      const output = { ...VALID_OUTPUT, per_reviewer_results: [badEntry] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('reviewer_id'))).toBe(true);
    });

    it('accepts per_reviewer_results with status "failed" and error_code "parse_failed"', () => {
      const failedEntry = {
        reviewer_id: 'security-reviewer',
        source_type: 'native-team',
        family: 'anthropic',
        status: 'failed',
        findings_count: 0,
        error_code: 'parse_failed',
        report_markdown: '',
      };
      const output = {
        per_reviewer_results: [failedEntry],
        findings: [],
      };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(true);
    });

    it('rejects per_reviewer_results entry with invalid source_type', () => {
      const badEntry = {
        reviewer_id: 'code-reviewer',
        source_type: 'external', // wrong — bridge always emits native-team
        family: 'anthropic',
        status: 'success',
        findings_count: 1,
        error_code: null,
        report_markdown: 'Report.',
      };
      const output = { ...VALID_OUTPUT, per_reviewer_results: [badEntry] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
    });

    it('rejects output with empty per_reviewer_results array', () => {
      const output = { ...VALID_OUTPUT, per_reviewer_results: [] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
    });

    it('rejects output missing per_reviewer_results field', () => {
      const { per_reviewer_results: _omitted, ...outputWithout } = VALID_OUTPUT;
      const result = validateBridgeOutput(outputWithout);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('per_reviewer_results'))).toBe(true);
    });

    it('rejects output missing findings field', () => {
      const { findings: _omitted, ...outputWithout } = VALID_OUTPUT;
      const result = validateBridgeOutput(outputWithout);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('findings'))).toBe(true);
    });
  });

  // ── Bridge output: multi-reviewer envelope ──────────────────────

  describe('Bridge output: multi-reviewer envelope', () => {
    it('accepts output with multiple reviewers and multiple findings', () => {
      const secondFinding = {
        ...VALID_FINDING,
        finding_id: 'correctness.fetchUser.missing-null-check',
        severity: 'medium',
        category: 'correctness',
        title: 'Missing null check in fetchUser',
        description: 'fetchUser may return null without a guard.',
        file: 'src/data/fetchUser.ts',
        source: {
          reviewer_id: 'security-reviewer',
          family: 'anthropic',
          source_type: 'native-team',
        },
      };
      const output = {
        per_reviewer_results: [
          VALID_OUTPUT.per_reviewer_results[0],
          {
            reviewer_id: 'security-reviewer',
            source_type: 'native-team',
            family: 'anthropic',
            status: 'success',
            findings_count: 1,
            error_code: null,
            report_markdown: '## Security Review\n\nFound 1 issue.',
          },
        ],
        findings: [VALID_FINDING, secondFinding],
      };
      const result = validateBridgeOutput(output);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // ── Bridge input validation ──────────────────────────────────────

  describe('Bridge input validation', () => {
    it('accepts valid bridge input', () => {
      const result = validateBridgeInput(VALID_INPUT);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('rejects bridge input missing team_name', () => {
      const { team_name: _omitted, ...inputWithout } = VALID_INPUT;
      const result = validateBridgeInput(inputWithout);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_name'))).toBe(true);
    });

    it('rejects bridge input missing reviewer_names', () => {
      const { reviewer_names: _omitted, ...inputWithout } = VALID_INPUT;
      const result = validateBridgeInput(inputWithout);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('reviewer_names'))).toBe(true);
    });

    it('rejects bridge input missing mailbox_base_path', () => {
      const { mailbox_base_path: _omitted, ...inputWithout } = VALID_INPUT;
      const result = validateBridgeInput(inputWithout);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('mailbox_base_path'))).toBe(true);
    });

    it('rejects bridge input with empty reviewer_names array', () => {
      const input = { ...VALID_INPUT, reviewer_names: [] };
      const result = validateBridgeInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('reviewer_names'))).toBe(true);
    });

    it('rejects bridge input with non-string in reviewer_names', () => {
      const input = { ...VALID_INPUT, reviewer_names: ['code-reviewer', 42] };
      const result = validateBridgeInput(input);
      expect(result.valid).toBe(false);
    });

    it('rejects null input', () => {
      const result = validateBridgeInput(null);
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateBridgeInput([]);
      expect(result.valid).toBe(false);
    });

    it('accepts input with multiple reviewers', () => {
      const input = {
        ...VALID_INPUT,
        reviewer_names: ['code-reviewer', 'security-reviewer', 'terraform-reviewer'],
      };
      const result = validateBridgeInput(input);
      expect(result.valid).toBe(true);
    });
  });

  // ── Bridge output: structural edge cases ────────────────────────

  describe('Bridge output: structural edge cases', () => {
    it('rejects null output', () => {
      const result = validateBridgeOutput(null);
      expect(result.valid).toBe(false);
    });

    it('rejects array output', () => {
      const result = validateBridgeOutput([]);
      expect(result.valid).toBe(false);
    });

    it('rejects finding missing severity', () => {
      const { severity: _omitted, ...findingWithout } = VALID_FINDING;
      const output = { ...VALID_OUTPUT, findings: [findingWithout] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
    });

    it('rejects finding with invalid severity value', () => {
      const badFinding = { ...VALID_FINDING, severity: 'blocker' };
      const output = { ...VALID_OUTPUT, findings: [badFinding] };
      const result = validateBridgeOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('severity'))).toBe(true);
    });
  });
});

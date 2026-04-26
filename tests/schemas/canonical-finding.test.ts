/**
 * Tests for Canonical Finding Schema validator.
 *
 * Validates per FR-MR13 (multi-model-review.md).
 * Schema source of truth: plugins/synthex/agents/_shared/canonical-finding-schema.md
 *
 * Covers:
 * 1.  Valid sample finding passes
 * 2.  finding_id with colon+digits (:42) fails
 * 3.  finding_id with L-prefix digits (L42) fails
 * 4.  finding_id with line_42 pattern fails
 * 5.  Missing finding_id fails
 * 6.  Missing source fails
 * 7.  Invalid severity value fails
 * 8.  Invalid source_type value fails
 * 9.  Title > 200 chars fails
 * 10. source_type "native-team" passes
 * 11. source_type "external" passes
 * 12. source_type "native-recovery" passes
 * 13. Optional raised_by array with multiple entries validates correctly
 * 14. The .md schema file exists and is non-empty
 * 15. The .md file contains the FR-MR13 reference
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateCanonicalFinding,
  SEVERITY_VALUES,
  SOURCE_TYPE_VALUES,
  CONFIDENCE_VALUES,
} from './canonical-finding.js';

// ── Fixtures ──────────────────────────────────────────────────────

const VALID_FINDING = {
  finding_id: 'security.handleLogin.missing-csrf-check',
  severity: 'high',
  category: 'security',
  title: 'Missing CSRF check in handleLogin',
  description: 'The handleLogin function does not validate CSRF tokens, allowing cross-site request forgery.',
  file: 'src/auth/handleLogin.ts',
  symbol: 'handleLogin',
  source: {
    reviewer_id: 'security-reviewer',
    family: 'anthropic',
    source_type: 'native-team',
  },
};

const SCHEMA_MD_PATH = resolve(
  __dirname,
  '../../plugins/synthex/agents/_shared/canonical-finding-schema.md',
);

// ── Helper ────────────────────────────────────────────────────────

function withOverride(overrides: Record<string, unknown>) {
  return { ...VALID_FINDING, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Canonical Finding Schema — Validator (FR-MR13)', () => {

  // 1. Valid sample finding passes
  it('accepts a valid sample finding', () => {
    const result = validateCanonicalFinding(VALID_FINDING);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 2. finding_id with colon+digits fails
  it('rejects finding_id containing colon+line-number (:42)', () => {
    const result = validateCanonicalFinding(
      withOverride({ finding_id: 'security.handleLogin:42' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('finding_id'))).toBe(true);
  });

  // 3. finding_id with L-prefix digits fails
  it('rejects finding_id containing L-prefix line number (L42)', () => {
    const result = validateCanonicalFinding(
      withOverride({ finding_id: 'security.handleLoginL42.csrf' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('finding_id'))).toBe(true);
  });

  // 4. finding_id with line_42 pattern fails
  it('rejects finding_id containing line_N pattern (line_42)', () => {
    const result = validateCanonicalFinding(
      withOverride({ finding_id: 'security.handleLogin.line_42' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('finding_id'))).toBe(true);
  });

  // 5. Missing finding_id fails
  it('rejects finding missing finding_id', () => {
    const { finding_id: _omit, ...noId } = VALID_FINDING;
    const result = validateCanonicalFinding(noId);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('finding_id'))).toBe(true);
  });

  // 6. Missing source fails
  it('rejects finding missing source', () => {
    const { source: _omit, ...noSource } = VALID_FINDING;
    const result = validateCanonicalFinding(noSource);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"source"'))).toBe(true);
  });

  // 7. Invalid severity value fails
  it('rejects an invalid severity value', () => {
    const result = validateCanonicalFinding(withOverride({ severity: 'blocker' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"severity"'))).toBe(true);
  });

  // 8. Invalid source_type value fails
  it('rejects an invalid source_type value', () => {
    const result = validateCanonicalFinding(
      withOverride({ source: { ...VALID_FINDING.source, source_type: 'legacy' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('source_type'))).toBe(true);
  });

  // 9. Title > 200 chars fails
  it('rejects a title longer than 200 characters', () => {
    const longTitle = 'A'.repeat(201);
    const result = validateCanonicalFinding(withOverride({ title: longTitle }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"title"'))).toBe(true);
  });

  // 10. source_type "native-team" passes
  it('accepts source_type "native-team"', () => {
    const result = validateCanonicalFinding(
      withOverride({ source: { ...VALID_FINDING.source, source_type: 'native-team' } }),
    );
    expect(result.valid).toBe(true);
  });

  // 11. source_type "external" passes
  it('accepts source_type "external"', () => {
    const result = validateCanonicalFinding(
      withOverride({ source: { ...VALID_FINDING.source, source_type: 'external' } }),
    );
    expect(result.valid).toBe(true);
  });

  // 12. source_type "native-recovery" passes
  it('accepts source_type "native-recovery"', () => {
    const result = validateCanonicalFinding(
      withOverride({ source: { ...VALID_FINDING.source, source_type: 'native-recovery' } }),
    );
    expect(result.valid).toBe(true);
  });

  // 13. Optional raised_by array with multiple entries validates correctly
  it('accepts a valid raised_by array with multiple entries', () => {
    const result = validateCanonicalFinding(
      withOverride({
        raised_by: [
          { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
          { reviewer_id: 'codex-review-prompter', family: 'openai', source_type: 'external' },
          { reviewer_id: 'gemini-review-prompter', family: 'google', source_type: 'external' },
        ],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a raised_by entry with an invalid source_type', () => {
    const result = validateCanonicalFinding(
      withOverride({
        raised_by: [
          { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'bad-type' },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('raised_by[0].source_type'))).toBe(true);
  });

  // 14. The .md schema file exists and is non-empty
  it('schema .md file exists and is non-empty', () => {
    let content: string;
    expect(() => {
      content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    }).not.toThrow();
    expect(content!.length).toBeGreaterThan(0);
  });

  // 15. The .md file contains the FR-MR13 reference
  it('schema .md file references FR-MR13', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    expect(content).toContain('FR-MR13');
  });

  // ── Additional edge-case coverage ────────────────────────────────

  it('rejects a non-object input (array)', () => {
    const result = validateCanonicalFinding([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('non-null object');
  });

  it('rejects a non-object input (string)', () => {
    const result = validateCanonicalFinding('not an object');
    expect(result.valid).toBe(false);
  });

  it('accepts optional confidence field with valid value', () => {
    const result = validateCanonicalFinding(withOverride({ confidence: 'high' }));
    expect(result.valid).toBe(true);
  });

  it('rejects an invalid confidence value', () => {
    const result = validateCanonicalFinding(withOverride({ confidence: 'certain' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"confidence"'))).toBe(true);
  });

  it('accepts a null line_range', () => {
    const result = validateCanonicalFinding(withOverride({ line_range: null }));
    expect(result.valid).toBe(true);
  });

  it('accepts a valid line_range object', () => {
    const result = validateCanonicalFinding(
      withOverride({ line_range: { start: 10, end: 25 } }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a line_range with non-positive start', () => {
    const result = validateCanonicalFinding(
      withOverride({ line_range: { start: 0, end: 10 } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('line_range.start'))).toBe(true);
  });

  it('rejects missing category', () => {
    const { ...noCategory } = VALID_FINDING;
    delete (noCategory as any).category;
    const result = validateCanonicalFinding(noCategory);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"category"'))).toBe(true);
  });

  it('SEVERITY_VALUES export contains all four levels', () => {
    expect(SEVERITY_VALUES).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('SOURCE_TYPE_VALUES export contains all three types', () => {
    expect(SOURCE_TYPE_VALUES).toEqual(['native-team', 'external', 'native-recovery']);
  });

  it('CONFIDENCE_VALUES export contains all three levels', () => {
    expect(CONFIDENCE_VALUES).toEqual(['low', 'medium', 'high']);
  });
});

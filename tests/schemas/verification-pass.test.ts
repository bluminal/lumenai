/**
 * Task 29 (FR-HM17, D18): "Verification pass (CRITICAL/HIGH only, top 5)".
 *
 * Covers the [T] acceptance criteria:
 *   1. helpers.ts and the code-reviewer/security-reviewer/performance-engineer
 *      validators accept the optional "- **Verification:**" line, with and
 *      without it present.
 *   2. security-reviewer rule 8 ("never approve code with CRITICAL findings")
 *      and the D21 header regex are unchanged.
 *   3. The shared section text is byte-identical across code-reviewer.md,
 *      security-reviewer.md, and performance-engineer.md.
 *
 * RESOLVED (Task 29 follow-up, A.J. Brown decision): the section text is the
 * single source of truth at tests/fixtures/verification-pass/section.md,
 * consumed both here (to enforce cross-agent byte-identity) and by
 * agent-boilerplate.test.ts (to exclude the section's bytes from the Task 16
 * shrink-floor comparison — see that file's VERIFICATION_SECTION_* comment).
 * The section text is byte-identical to what was injected into the system
 * prompt during the Task 29 Layer 2 `prose`-config runs recorded in
 * docs/testing.md (the Layer 2 harness wrapped it with blank-line splice
 * separators that are not part of the canonical section itself).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseMarkdownOutput,
  parseVerificationField,
  isVerdictConsistent,
} from './helpers.js';
import { validateCodeReviewerOutput, validatePathAndReasonHeader } from './code-reviewer.js';
import { validateSecurityReviewerOutput } from './security-reviewer.js';
import { validatePerformanceEngineerOutput } from './performance-engineer.js';

const AGENTS_DIR = join(import.meta.dirname, '..', '..', 'plugins', 'synthex', 'agents');
const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures', 'verification-pass');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

const CANONICAL_SECTION_TEXT = readFileSync(join(FIXTURES_DIR, 'section.md'), 'utf8');

// ── 1. helpers.ts: parseVerificationField ─────────────────────────

describe('Task 29 (FR-HM17): parseVerificationField', () => {
  it('parses "CONFIRMED (lsp)"', () => {
    expect(parseVerificationField('CONFIRMED (lsp)')).toEqual({ status: 'CONFIRMED', method: 'lsp' });
  });

  it('parses "CONFIRMED (grep)"', () => {
    expect(parseVerificationField('CONFIRMED (grep)')).toEqual({ status: 'CONFIRMED', method: 'grep' });
  });

  it('parses "PLAUSIBLE (none)"', () => {
    expect(parseVerificationField('PLAUSIBLE (none)')).toEqual({ status: 'PLAUSIBLE', method: 'none' });
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseVerificationField('  confirmed (LSP)  ')).toEqual({ status: 'CONFIRMED', method: 'lsp' });
  });

  it('returns null for malformed values', () => {
    expect(parseVerificationField('yes')).toBeNull();
    expect(parseVerificationField('CONFIRMED')).toBeNull();
    expect(parseVerificationField('CONFIRMED (ast-grep)')).toBeNull();
  });
});

// ── 2. Parser + validators accept the line, with and without it ──

describe('Task 29 (FR-HM17): code-reviewer accepts the optional Verification line', () => {
  it('parses Finding.verification when the line is present', () => {
    const parsed = parseMarkdownOutput(loadFixture('code-reviewer-with-verification.md'));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].verification).toEqual({ status: 'CONFIRMED', method: 'lsp' });
  });

  it('validates with no errors when the line is present', () => {
    const result = validateCodeReviewerOutput(loadFixture('code-reviewer-with-verification.md'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('Finding.verification is null when the line is absent (default `off`)', () => {
    const parsed = parseMarkdownOutput(loadFixture('code-reviewer-without-verification.md'));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].verification).toBeNull();
  });

  it('validates with no errors when the line is absent', () => {
    const result = validateCodeReviewerOutput(loadFixture('code-reviewer-without-verification.md'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('Task 29 (FR-HM17): security-reviewer accepts the optional Verification line', () => {
  it('parses Finding.verification when the line is present', () => {
    const parsed = parseMarkdownOutput(loadFixture('security-reviewer-with-verification.md'));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].verification).toEqual({ status: 'PLAUSIBLE', method: 'none' });
  });

  it('validates with no errors when the line is present', () => {
    const result = validateSecurityReviewerOutput(loadFixture('security-reviewer-with-verification.md'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('Finding.verification is null when the line is absent (default `off`)', () => {
    const parsed = parseMarkdownOutput(loadFixture('security-reviewer-without-verification.md'));
    expect(parsed.findings[0].verification).toBeNull();
  });

  it('validates with no errors when the line is absent', () => {
    const result = validateSecurityReviewerOutput(loadFixture('security-reviewer-without-verification.md'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // ── security rule 8: never approve code with CRITICAL findings ─────
  // A PLAUSIBLE CRITICAL finding (i.e. verification could not confirm it via
  // LSP or grep) still fails the review — verification never blocks or
  // overrides the verdict rule.
  it('rule 8 is unaffected: a PLAUSIBLE CRITICAL finding still requires FAIL', () => {
    const parsed = parseMarkdownOutput(loadFixture('security-reviewer-with-verification.md'));
    expect(parsed.verdict).toBe('FAIL');
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[0].verification?.status).toBe('PLAUSIBLE');
    expect(isVerdictConsistent('FAIL', parsed.findings)).toBe(true);
    // A PASS/WARN verdict on the same PLAUSIBLE-CRITICAL findings would be
    // inconsistent — rule 8 still forces FAIL regardless of verification status.
    expect(isVerdictConsistent('PASS', parsed.findings)).toBe(false);
    expect(isVerdictConsistent('WARN', parsed.findings)).toBe(false);
  });

  it('security-reviewer.md rule 8 wording is unchanged', () => {
    const content = readFileSync(join(AGENTS_DIR, 'security-reviewer.md'), 'utf8');
    expect(content).toContain(
      '8. **Never approve code with CRITICAL findings.** Always FAIL. There is no exception to this rule.'
    );
  });
});

describe('Task 29 (FR-HM17): performance-engineer accepts the optional Verification line', () => {
  it('parses Finding.verification when the line is present', () => {
    const parsed = parseMarkdownOutput(loadFixture('performance-engineer-with-verification.md'));
    expect(parsed.findings[0].verification).toEqual({ status: 'CONFIRMED', method: 'grep' });
  });

  it('validates with no errors when the line is present', () => {
    const result = validatePerformanceEngineerOutput(loadFixture('performance-engineer-with-verification.md'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('Finding.verification is null when the line is absent (default `off`)', () => {
    const parsed = parseMarkdownOutput(loadFixture('performance-engineer-without-verification.md'));
    expect(parsed.findings[0].verification).toBeNull();
  });

  it('validates with no errors when the line is absent', () => {
    const result = validatePerformanceEngineerOutput(loadFixture('performance-engineer-without-verification.md'));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ── 3. D21 header regex is unchanged ──────────────────────────────

describe('Task 29 (FR-HM17): D21 path-and-reason header regex is unchanged', () => {
  it('still accepts the canonical native-only example', () => {
    const result = validatePathAndReasonHeader(
      'Review path: native-only (below-threshold diff; reviewers: 2 native)'
    );
    expect(result.valid).toBe(true);
  });

  it('still rejects a header missing "reviewers:"', () => {
    const result = validatePathAndReasonHeader(
      'Review path: multi-model (above-threshold diff; 2 native + 2 external)'
    );
    expect(result.valid).toBe(false);
  });
});

// ── 4. Malformed Verification value never becomes an error ───────

describe('Task 29 (FR-HM17): verification never blocks the review', () => {
  const malformed = `## Code Review Verdict: FAIL

### Findings

#### [CRITICAL] Some issue
- **Category:** Correctness
- **Location:** src/x.ts:1
- **Issue:** broken
- **Why this matters:** breaks things
- **Suggestion:** fix it
- **Verification:** sort of maybe

### What's Done Well
N/A

### Recommendations
Fix it.
`;

  it('a malformed Verification value is a warning, never an error', () => {
    const result = validateCodeReviewerOutput(malformed);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('Verification'))).toBe(true);
  });
});

// ── 5. Shared section text: present and byte-identical across the three agents ──

describe('Task 29 (FR-HM17, D18): shared "Verification pass" section present and byte-identical across agents', () => {
  const AGENT_FILES = ['code-reviewer.md', 'security-reviewer.md', 'performance-engineer.md'];

  const contents = AGENT_FILES.map((f) => readFileSync(join(AGENTS_DIR, f), 'utf8'));

  it.each(AGENT_FILES)('%s contains the canonical section text, byte-for-byte', (file) => {
    const content = readFileSync(join(AGENTS_DIR, file), 'utf8');
    expect(content).toContain(CANONICAL_SECTION_TEXT);
  });

  it('the canonical section text is byte-identical across all three agents (trivially true — same fixture)', () => {
    // Each agent is checked above against the same CANONICAL_SECTION_TEXT
    // constant, so cross-agent identity follows by construction. This test
    // also guards against the fixture accidentally changing shape (e.g.
    // losing its trailing newline) without anyone noticing.
    expect(Buffer.byteLength(CANONICAL_SECTION_TEXT, 'utf8')).toBeGreaterThan(0);
    for (const content of contents) {
      expect(content).toContain(CANONICAL_SECTION_TEXT);
    }
  });

  it('the section sits before "## Output Format" and does not touch it', () => {
    for (const content of contents) {
      const sectionIdx = content.indexOf(CANONICAL_SECTION_TEXT);
      const outputFormatIdx = content.indexOf('## Output Format');
      expect(sectionIdx).toBeGreaterThan(-1);
      expect(outputFormatIdx).toBeGreaterThan(sectionIdx);
    }
  });

  it('is gated on code_review.verification (prose|off) in every agent', () => {
    for (const content of contents) {
      expect(content).toContain('code_review.verification: prose|off');
      expect(content).toContain('default `off`');
    }
  });
});

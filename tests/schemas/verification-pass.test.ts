/**
 * Task 29 (FR-HM17, D18): "Verification pass (CRITICAL/HIGH only, top 5)".
 *
 * Covers the [T] acceptance criteria:
 *   1. helpers.ts and the code-reviewer/security-reviewer/performance-engineer
 *      validators accept the optional "- **Verification:**" line, with and
 *      without it present.
 *   2. security-reviewer rule 8 ("never approve code with CRITICAL findings")
 *      and the D21 header regex are unchanged.
 *   3. The shared section text (once it lands in the three agent bodies) must
 *      be byte-identical across code-reviewer.md, security-reviewer.md, and
 *      performance-engineer.md.
 *
 * BLOCKED SUB-ITEM (documented per the Task 29 instruction to "keep the
 * section under ~900 bytes or tell me the numbers and stop rather than
 * weakening the test"): inserting the shared section into the three agent
 * bodies breaks tests/schemas/agent-boilerplate.test.ts's per-agent shrink
 * floor (MIN_REDUCTION_BYTES = 1536, measured against the pre-Task-16
 * `before_bytes`). Current headroom before that floor breaks, as of this
 * task:
 *   - code-reviewer.md:        149 bytes
 *   - security-reviewer.md:     90 bytes
 *   - performance-engineer.md: 170 bytes
 * Even the terse form of the required section text (gate description +
 * LSP/grep instruction + non-blocking rule + cap-logging + render format) is
 * ~340 bytes, well over the smallest (security-reviewer) margin. Per
 * instruction, the section is NOT inserted into the three agent bodies in
 * this task; the plumbing below (config, parser, validators, fixtures) is
 * complete and ready for whichever of the following a maintainer picks:
 *   (a) trim additional unrelated prose from the three agents to make room, or
 *   (b) deliberately revisit the per-agent floor in agent-boilerplate.test.ts.
 * The "byte-identical copies" test below documents this: it currently
 * confirms consistent ABSENCE (not a partial rollout), and separately
 * confirms byte-identity IF a maintainer adds the section to all three.
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

// ── 5. Shared section text: byte-identical across the three agents ──
//     (see BLOCKED SUB-ITEM note at the top of this file)

describe('Task 29 (FR-HM17, D18): shared "Verification pass" section byte-identical across agents', () => {
  const AGENT_FILES = ['code-reviewer.md', 'security-reviewer.md', 'performance-engineer.md'];
  const SECTION_HEADING_PATTERN = /^#{2,4}\s+Verification [Pp]ass \(CRITICAL\/HIGH only, top 5\)\s*$/m;

  function extractSection(content: string): string | null {
    const match = content.match(SECTION_HEADING_PATTERN);
    if (!match || match.index === undefined) return null;
    const rest = content.slice(match.index);
    const lines = rest.split('\n');
    let end = lines.length;
    for (let i = 1; i < lines.length; i++) {
      if (/^#{1,4}\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(0, end).join('\n').trim();
  }

  const sections = AGENT_FILES.map((f) => extractSection(readFileSync(join(AGENTS_DIR, f), 'utf8')));

  it('is consistently present or consistently absent across all three (never a partial rollout)', () => {
    const presentCount = sections.filter((s) => s !== null).length;
    expect([0, AGENT_FILES.length]).toContain(presentCount);
  });

  it('is byte-identical across all three when present', () => {
    const present = sections.filter((s): s is string => s !== null);
    if (present.length === 0) {
      // Documented blocker (see file header): not yet inserted into the
      // agent bodies pending a byte-budget resolution. Vacuously true.
      return;
    }
    for (const s of present.slice(1)) {
      expect(Buffer.byteLength(s, 'utf8')).toBe(Buffer.byteLength(present[0], 'utf8'));
      expect(s).toBe(present[0]);
    }
  });
});

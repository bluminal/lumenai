/**
 * Task 90 (Phase 11.2): ADR-003 Known Limitations addendum.
 *
 * [T] criteria from the plan:
 *   1. D27 row (or immediately-following paragraph) contains the literal phrase "Known Limitations"
 *   2. All four numbered gaps are present (raw-string check for the keywords
 *      "supply-chain", "file-read scope", "CI bypass", "rate limiting")
 *   3. Layer 1 test asserts presence in D27 context
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLAN = join(__dirname, '..', '..', 'docs', 'plans', 'multi-model-teams.md');

describe('Task 90: ADR-003 Known Limitations addendum', () => {
  let content: string;
  let d27Context: string;

  beforeAll(() => {
    content = readFileSync(PLAN, 'utf8');
    // "D27 context" = the region between the D27 row and the next ## header (Open Questions).
    // The Known Limitations subsection MUST live in this region per the plan acceptance criterion.
    const d27Idx = content.indexOf('| D27 / ADR-003 |');
    const openQuestionsIdx = content.indexOf('## Open Questions', d27Idx);
    expect(d27Idx).toBeGreaterThan(-1);
    expect(openQuestionsIdx).toBeGreaterThan(d27Idx);
    d27Context = content.slice(d27Idx, openQuestionsIdx);
  });

  describe('[T] (1): "Known Limitations" phrase present in D27 context', () => {
    it('contains the literal phrase "Known Limitations"', () => {
      expect(d27Context).toContain('Known Limitations');
    });

    it('the Known Limitations subsection exists between D27 and Open Questions', () => {
      // Match a header that contains "Known Limitations" — accepts ###, ####, etc.
      expect(d27Context).toMatch(/^#+ .*Known Limitations/m);
    });

    it('the D27 row body cross-references the Known Limitations subsection', () => {
      // The D27 row itself should mention the subsection so consumers find it
      const d27Row = d27Context.split('\n')[0];
      expect(d27Row).toContain('Known Limitations');
    });
  });

  describe('[T] (2): all four numbered gaps present', () => {
    it.each([
      ['supply-chain'],
      ['file-read scope'],
      ['CI bypass'],
      ['rate limiting'],
    ])('contains the keyword "%s" (case-insensitive)', (keyword) => {
      expect(d27Context.toLowerCase()).toContain(keyword.toLowerCase());
    });

    it('contains four numbered list items (1., 2., 3., 4.)', () => {
      expect(d27Context).toMatch(/^1\. /m);
      expect(d27Context).toMatch(/^2\. /m);
      expect(d27Context).toMatch(/^3\. /m);
      expect(d27Context).toMatch(/^4\. /m);
    });
  });

  describe('semantic checks: each gap is framed as out-of-scope-for-v1', () => {
    it('uses the literal phrase "out of scope for v1" in the section', () => {
      expect(d27Context).toMatch(/out of scope for v1/i);
    });

    it('each gap documents a deferred mitigation', () => {
      // All four numbered items should mention "Mitigation deferred"
      const matches = d27Context.match(/Mitigation deferred/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });

    it('section explicitly notes none represent a default-unsafe configuration', () => {
      expect(d27Context).toMatch(/default-unsafe configuration|none.*blocker/i);
    });
  });

  describe('regression: D27 row itself remains intact (not corrupted by addendum insertion)', () => {
    it('D27 / ADR-003 row still contains all three Pattern descriptions', () => {
      expect(d27Context).toContain('Pattern 1 (read-only)');
      expect(d27Context).toContain('Pattern 2 (sandbox-yolo)');
      expect(d27Context).toContain('Pattern 3 (parent-mediated)');
    });

    it('D27 row still references FR-MMT21', () => {
      expect(d27Context).toContain('FR-MMT21');
    });
  });
});

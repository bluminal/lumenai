/**
 * Layer 1: Schema validation tests for the standing-pool-cleanup agent file.
 *
 * Validates acceptance criteria [T] for Task 32:
 *   [T1] Frontmatter declares model: haiku
 *   [T2] Negative scope: Identity/Core Mission/When You Are Invoked/Behavior sections
 *        do NOT contain the words discovery/filter/router/routing as agent-side scope
 *   [T3] Body cites FR-MMT13, FR-MMT22, and .index.lock (FR-MMT9a alignment)
 *   [T4] Output Contract declares all three result enum values: removed/not-found/lock-failed
 *   [T5] Required section headings are present
 *   [T6] "Pool Lead" terminology — no bare "Lead", "team Lead", or "team-lead"
 *
 * This test file is the foundation that Task 34's full validator will extend.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load agent file ───────────────────────────────────────────────

const AGENT_PATH = resolve(
  __dirname,
  '../../plugins/synthex-plus/agents/standing-pool-cleanup.md'
);

const AGENT_CONTENT = (() => {
  try {
    return readFileSync(AGENT_PATH, 'utf-8');
  } catch (e) {
    throw new Error(
      `Cannot load agent file at ${AGENT_PATH}: ${(e as Error).message}`
    );
  }
})();

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Split the document into sections keyed by H2 heading text.
 * Returns a map: { headingText -> sectionBodyIncludingHeading }
 */
function splitByH2(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = content.split(/^## /m);
  // parts[0] is pre-first-H2 content (frontmatter + H1)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const heading = part.split('\n')[0].trim();
    sections.set(heading, part);
  }
  return sections;
}

// ── [T1] Frontmatter: model: haiku ────────────────────────────────

describe('[T1] Frontmatter: model: haiku', () => {
  it('file starts with YAML frontmatter declaring model: haiku', () => {
    // Regex: frontmatter block at start of file with model: haiku
    const FRONTMATTER_RE = /^---\s*\nmodel:\s*haiku\s*\n---/m;
    expect(
      FRONTMATTER_RE.test(AGENT_CONTENT),
      'Expected file to begin with ---\\nmodel: haiku\\n--- frontmatter block'
    ).toBe(true);
  });
});

// ── [T5] Required section headings ───────────────────────────────

describe('[T5] Required section headings', () => {
  const sections = splitByH2(AGENT_CONTENT);

  const REQUIRED_HEADINGS = [
    'Identity',
    'Core Mission',
    'When You Are Invoked',
    'Input Contract',
    'Behavior',
    'Output Contract',
  ] as const;

  for (const heading of REQUIRED_HEADINGS) {
    it(`has ## ${heading} section`, () => {
      const found = [...sections.keys()].some(
        (k) => k === heading || k.startsWith(heading)
      );
      expect(found, `Missing required section: ## ${heading}`).toBe(true);
    });
  }

  it('has ## Boundaries (or ## Out of Scope) section', () => {
    const found = [...sections.keys()].some(
      (k) => k.includes('Boundaries') || k.includes('Out of Scope')
    );
    expect(found, 'Missing required Boundaries / Out of Scope section').toBe(true);
  });
});

// ── [T3] FR-MMT13 / FR-MMT22 / .index.lock references ────────────

describe('[T3] FR-MMT citations and lock reference', () => {
  it('file cites FR-MMT13', () => {
    expect(AGENT_CONTENT).toMatch(/FR-MMT13/);
  });

  it('file cites FR-MMT22', () => {
    expect(AGENT_CONTENT).toMatch(/FR-MMT22/);
  });

  it('file references .index.lock (FR-MMT9a locking primitive)', () => {
    expect(AGENT_CONTENT).toMatch(/\.index\.lock/);
  });
});

// ── [T4] Output Contract: all three result enum values ────────────

describe('[T4] Output Contract: result enum values', () => {
  it('mentions result value "removed"', () => {
    // Accept quoted or unquoted form
    expect(AGENT_CONTENT).toMatch(/removed/);
  });

  it('mentions result value "not-found"', () => {
    expect(AGENT_CONTENT).toMatch(/not-found/);
  });

  it('mentions result value "lock-failed"', () => {
    expect(AGENT_CONTENT).toMatch(/lock-failed/);
  });

  it('Output Contract section documents all three enum values', () => {
    const sections = splitByH2(AGENT_CONTENT);
    const outputSection = sections.get('Output Contract') ?? '';
    expect(outputSection, 'Output Contract section is empty or missing').not.toBe('');

    // All three result values must appear in the Output Contract section itself
    expect(outputSection).toMatch(/removed/);
    expect(outputSection).toMatch(/not-found/);
    expect(outputSection).toMatch(/lock-failed/);
  });
});

// ── [T2] Negative scope: forbidden words not in positive-scope sections ──

describe('[T2] Negative scope — forbidden words absent from agent-scope sections', () => {
  /**
   * The words "discovery", "filter", "router", "routing" must NOT appear
   * in the following sections as part of the agent's own scope description.
   * They MAY appear in the Boundaries section (negative form only).
   *
   * Sections under test: Identity, Core Mission, When You Are Invoked, Behavior
   */
  const FORBIDDEN = /\b(discovery|filter|router|routing)\b/i;

  const POSITIVE_SCOPE_SECTIONS = [
    'Identity',
    'Core Mission',
    'When You Are Invoked',
    'Behavior',
  ] as const;

  const sections = splitByH2(AGENT_CONTENT);

  for (const heading of POSITIVE_SCOPE_SECTIONS) {
    it(`## ${heading} does not contain discovery/filter/router/routing`, () => {
      // Find the matching section (exact match or startsWith for headings with subtitles)
      const sectionContent = [...sections.entries()]
        .filter(([k]) => k === heading || k.startsWith(heading))
        .map(([, v]) => v)
        .join('\n');

      expect(
        sectionContent,
        `Section "## ${heading}" must exist for this check to be meaningful`
      ).not.toBe('');

      const match = FORBIDDEN.exec(sectionContent);
      expect(
        match,
        `Section "## ${heading}" contains forbidden word "${match?.[0]}" at position ${match?.index}. ` +
        'Agent-side scope must be cleanup-only; these words may only appear in the Boundaries section.'
      ).toBeNull();
    });
  }

  it('Boundaries section IS allowed to contain those words (negative form)', () => {
    const boundariesContent = [...sections.entries()]
      .filter(([k]) => k.includes('Boundaries') || k.includes('Out of Scope'))
      .map(([, v]) => v)
      .join('\n');

    expect(
      boundariesContent,
      'Boundaries section must exist for out-of-scope declaration'
    ).not.toBe('');

    // Boundaries must use those words in negative form
    // (e.g. "does NOT do discovery"). Verify at least one of them appears.
    expect(
      FORBIDDEN.test(boundariesContent),
      'Boundaries section should reference the out-of-scope terms (discovery/filter/router/routing) in negative form'
    ).toBe(true);
  });
});

// ── [T6] "Pool Lead" terminology — no bare Lead ───────────────────

describe('[T6] Pool Lead terminology — no bare "Lead"', () => {
  it('contains no bare "Lead" (must always be "Pool Lead")', () => {
    // Strategy: remove all "Pool Lead" occurrences, then scan remaining text
    // for standalone Lead, team Lead, or team-lead.
    const withoutPoolLead = AGENT_CONTENT.replace(/Pool Lead/g, '');
    const BARE_LEAD_RE = /\b(Lead|team[ -]lead)\b/i;
    const match = BARE_LEAD_RE.exec(withoutPoolLead);
    expect(
      match,
      `Found bare Lead reference: "${match?.[0]}" — must always be "Pool Lead" (two words, capitalized)`
    ).toBeNull();
  });

  it('"Pool Lead" appears at least once (confirms the agent references the concept)', () => {
    expect(AGENT_CONTENT).toMatch(/Pool Lead/);
  });
});

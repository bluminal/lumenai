/**
 * Layer 1: Schema validation for Task 30 (FR-HM14 PR-B, D10) — model/effort
 * re-tier gate artifacts.
 *
 * The per-agent effort: contract itself (which agents carry which effort
 * value, and that no Haiku-backed agent carries one) is asserted in
 * agent-frontmatter.test.ts. This file covers the two remaining Task 30
 * acceptance criteria that don't belong to that per-agent sweep:
 *
 *   - "Adapter envelope parse rates unchanged at effort: low" (vacuous per
 *     Task 7: the *-review-prompter.md adapters are Haiku-backed and get
 *     NO effort key at all, so there is no effort change to regress against
 *     — this test asserts the vacuity condition itself, i.e. that no
 *     adapter carries an effort: key).
 *   - "The D28 eval gate passes" — asserted here only as a documentation
 *     check: docs/testing.md records a "Task 30" section with the gate
 *     result line. The actual eval run (node tests/scripts/run-evals.mjs)
 *     is real spend against live models and is NOT re-run by this suite;
 *     it was run once as part of landing Task 30 and its result recorded
 *     in docs/testing.md, which this test pins against regressing away.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const agentsRoot = join(repoRoot, 'plugins/synthex/agents');
const testingDocPath = join(repoRoot, 'docs/testing.md');

function frontmatterBlock(contents: string): string {
  if (!contents.startsWith('---\n')) return '';
  const lines = contents.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return lines.slice(1, i).join('\n');
  }
  return '';
}

const adapterSlugs = readdirSync(agentsRoot)
  .filter((file) => file.endsWith('-review-prompter.md'))
  .map((file) => file.replace(/\.md$/, ''))
  .sort();

describe('Task 30 (FR-HM14 PR-B, D10): adapter effort vacuity', () => {
  it('found at least one *-review-prompter.md adapter (sanity)', () => {
    expect(adapterSlugs.length).toBeGreaterThan(0);
  });

  describe.each(adapterSlugs)('%s', (slug) => {
    it('carries no effort: key (Haiku-backed adapter; Task 7 ignores it)', () => {
      const content = readFileSync(join(agentsRoot, `${slug}.md`), 'utf8');
      const block = frontmatterBlock(content);
      expect(block).toMatch(/^model:\s*haiku\s*$/m);
      expect(block).not.toMatch(/^effort:/m);
    });
  });
});

describe('Task 30 (FR-HM14 PR-B, D10): docs/testing.md re-tier gate record', () => {
  const doc = readFileSync(testingDocPath, 'utf8');

  it('has a "Task 30" section heading', () => {
    expect(doc).toMatch(/^##\s+Task 30\s+—/m);
  });

  it('records the D28 eval gate result (aggregate recall line) in that section', () => {
    const sectionMatch = doc.match(/^##\s+Task 30\s+—[\s\S]*?(?=^## |\z)/m);
    expect(sectionMatch).toBeTruthy();
    const section = sectionMatch![0];
    expect(section).toMatch(/Aggregate recall/i);
    expect(section).toMatch(/baseline/i);
  });

  it('never contains an unresolved merge-conflict marker (drive-by regression guard)', () => {
    expect(doc).not.toMatch(/^(<{7}|={7}|>{7}|\|{7})/m);
  });
});

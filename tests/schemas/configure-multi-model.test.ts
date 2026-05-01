/**
 * Layer 1: Structural tests for /synthex:configure-multi-model wizard.
 *
 * Complements init-multimodel-md.test.ts (which covers wizard CONTENT —
 * CLI detection, auth checks, FR-MR27 warning, AskUserQuestion options).
 * This file covers Task 18 acceptance criteria — STRUCTURAL properties:
 *   - frontmatter
 *   - idempotency Step 0 present
 *   - total AskUserQuestion block count (3 or 4 — Step 0 re-entry,
 *     Step 1b detection-options, plus the warning's confirmation if
 *     surfaced as a question)
 *   - three-option labels (Re-run / Reset to disabled / Leave as-is)
 *   - "Reset to disabled" sets enabled: false (D-UO5), does NOT delete the block
 *
 * Plan: docs/plans/upgrade-onboarding.md Task 18.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIZARD_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'configure-multi-model.md'
);

describe('configure-multi-model.md — Task 18 structural validation', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(WIZARD_PATH, 'utf-8');
  });

  describe('Frontmatter', () => {
    it('starts with --- frontmatter delimiter', () => {
      expect(content.startsWith('---\n')).toBe(true);
    });

    it('declares model: haiku', () => {
      const fmEnd = content.indexOf('\n---\n', 4);
      expect(fmEnd).toBeGreaterThan(0);
      const frontmatter = content.slice(4, fmEnd);
      expect(frontmatter).toMatch(/^model:\s*haiku\s*$/m);
    });
  });

  describe('Step 0 — idempotency re-entry check', () => {
    it('contains a Step 0 section', () => {
      expect(content).toMatch(/^### 0\.\s+Re-entry Check/m);
    });

    it('Step 0 reads .synthex/config.yaml', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toContain('.synthex/config.yaml');
    });

    it('Step 0 detects multi_model_review.enabled: true', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toContain('multi_model_review.enabled: true');
    });

    it('Step 0 surfaces three re-entry options via AskUserQuestion', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toContain('AskUserQuestion');
      expect(step0!).toMatch(/Re-run the wizard/);
      expect(step0!).toMatch(/Reset to disabled/);
      expect(step0!).toMatch(/Leave as-is/);
    });

    it('Step 0 "Reset to disabled" sets enabled: false (D-UO5)', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toMatch(/multi_model_review\.enabled:\s*false/);
    });

    it('Step 0 "Reset to disabled" does NOT delete the block (D-UO5)', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toMatch(/Do NOT delete the .multi_model_review. block/);
    });
  });

  describe('AskUserQuestion total block count', () => {
    it('contains at least 2 AskUserQuestion invocations (Step 0 + Step 1b)', () => {
      const matches = content.match(/AskUserQuestion/g) || [];
      // Step 0 re-entry + Step 1b three-option block, at minimum.
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('contains at most 5 AskUserQuestion mentions (sanity bound)', () => {
      const matches = content.match(/AskUserQuestion/g) || [];
      // Includes prose mentions; 5 is a generous ceiling that catches accidental duplication.
      expect(matches.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Idempotency contract', () => {
    it('on missing config file, Step 0 falls through to Step 1', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toMatch(/file does not exist.*skip to Step 1/i);
    });

    it('on enabled: false, Step 0 falls through to Step 1 (re-evaluate)', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toMatch(/enabled:\s*false.*skip to Step 1/);
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract Step 0 (re-entry check) section. */
function extractStep0(markdown: string): string | null {
  const pattern = /### 0\.\s+Re-entry Check[\s\S]*?(?=\n### \d|\n## [A-Z]|$)/;
  const match = markdown.match(pattern);
  return match ? match[0] : null;
}

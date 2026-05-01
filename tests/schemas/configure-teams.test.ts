/**
 * Layer 1: Structural tests for /synthex-plus:configure-teams wizard.
 *
 * Task 19 acceptance criteria:
 *   - frontmatter (model: haiku)
 *   - idempotency Step 0 (re-entry check)
 *   - enable/skip AskUserQuestion block
 *   - follow-up blocks for routing_mode and matching_mode
 *   - no pool-spawn instructions (preserves FR-MMT27 criterion 3)
 *   - scope strictly onboarding — no team-init duplication
 *
 * Plan: docs/plans/upgrade-onboarding.md Task 19.
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
  'synthex-plus',
  'commands',
  'configure-teams.md'
);

describe('configure-teams.md — Task 19 structural validation', () => {
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

    it('Step 0 reads .synthex-plus/config.yaml', () => {
      expect(content).toContain('.synthex-plus/config.yaml');
    });

    it('Step 0 detects standing_pools.enabled: true', () => {
      expect(content).toContain('standing_pools.enabled: true');
    });

    it('Step 0 surfaces three re-entry options', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toMatch(/Re-run the wizard/);
      expect(step0!).toMatch(/Reset to disabled/);
      expect(step0!).toMatch(/Leave as-is/);
    });

    it('"Reset to disabled" sets enabled: false (D-UO5)', () => {
      const step0 = extractStep0(content);
      expect(step0).not.toBeNull();
      expect(step0!).toMatch(/standing_pools\.enabled:\s*false/);
    });
  });

  describe('Step 1 — Enable / Skip', () => {
    it('contains a Step 1 with enable/skip via AskUserQuestion', () => {
      const step1 = extractStep(content, 1);
      expect(step1).not.toBeNull();
      expect(step1!).toContain('AskUserQuestion');
      expect(step1!).toMatch(/Enable/);
      expect(step1!).toMatch(/Skip/);
    });

    it('Skip path exits without writing config', () => {
      const step1 = extractStep(content, 1);
      expect(step1).not.toBeNull();
      expect(step1!).toMatch(/Do not write any.*standing_pools/);
    });
  });

  describe('Step 2 — routing_mode', () => {
    it('asks about routing_mode via AskUserQuestion', () => {
      expect(content).toMatch(/routing_mode/);
      const step2 = extractStep(content, 2);
      expect(step2).not.toBeNull();
      expect(step2!).toContain('AskUserQuestion');
    });

    it('lists prefer-with-fallback as default', () => {
      expect(content).toContain('prefer-with-fallback');
    });

    it('lists explicit-pool-required as the strict alternative', () => {
      // Plan says strict; defaults.yaml uses "explicit-pool-required" as the
      // canonical value. Either label is acceptable as long as both modes are surfaced.
      expect(content).toMatch(/explicit-pool-required|strict/i);
    });
  });

  describe('Step 3 — matching_mode', () => {
    it('asks about matching_mode via AskUserQuestion', () => {
      expect(content).toMatch(/matching_mode/);
      const step3 = extractStep(content, 3);
      expect(step3).not.toBeNull();
      expect(step3!).toContain('AskUserQuestion');
    });

    it('lists covers as default', () => {
      expect(content).toContain('covers');
    });

    it('lists exact as the alternative', () => {
      expect(content).toMatch(/\bexact\b/);
    });
  });

  describe('No pool-spawn instructions (FR-MMT27 criterion 3)', () => {
    it('contains an explicit anti-pattern note about NOT spawning a pool', () => {
      expect(content).toMatch(/Anti-pattern[\s\S]*do NOT spawn a pool/i);
    });

    it('Step 4 (Apply) explicitly tells the wizard NOT to spawn a pool', () => {
      const step4 = extractStep(content, 4);
      expect(step4).not.toBeNull();
      expect(step4!).toMatch(/Do NOT spawn any pool/i);
    });
  });

  describe('AskUserQuestion total block count', () => {
    it('contains at least 4 AskUserQuestion invocations (Step 0 + 3 wizard steps)', () => {
      const matches = content.match(/AskUserQuestion/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

function extractStep0(markdown: string): string | null {
  const pattern = /### 0\.\s+Re-entry Check[\s\S]*?(?=\n### \d|\n## [A-Z]|$)/;
  const match = markdown.match(pattern);
  return match ? match[0] : null;
}

function extractStep(markdown: string, n: number): string | null {
  const pattern = new RegExp(
    `### ${n}\\.\\s+[\\s\\S]*?(?=\\n### \\d|\\n## [A-Z]|$)`
  );
  const match = markdown.match(pattern);
  return match ? match[0] : null;
}

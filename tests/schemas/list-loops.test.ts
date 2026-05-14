/**
 * Layer 1: Structural tests for /synthex:list-loops.
 *
 * Task 29 acceptance criteria:
 *   - frontmatter (model: haiku per D-NL16)
 *   - output-format anchors (FR-NL32: RUNNING (N), COMPLETED (M) headers)
 *   - missing-directory path prints "No loops in this project." (E15)
 *
 * Plan: docs/plans/native-looping.md Task 29.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIST_LOOPS_MD = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'list-loops.md'
);

describe('/synthex:list-loops (list-loops.md) — Task 29 structural validation', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(LIST_LOOPS_MD, 'utf-8');
  });

  describe('Frontmatter', () => {
    it('starts with --- delimiter', () => {
      expect(content.startsWith('---\n')).toBe(true);
    });

    it('declares model: haiku (D-NL16 — lightweight read-only enumeration)', () => {
      const fmEnd = content.indexOf('\n---\n', 4);
      const frontmatter = content.slice(4, fmEnd);
      expect(frontmatter).toMatch(/^model:\s*haiku\s*$/m);
    });
  });

  describe('Output format (FR-NL32)', () => {
    it('contains `RUNNING (<N>):` header pattern', () => {
      // Match either the literal angle-bracket placeholder or a concrete count.
      expect(content).toMatch(/RUNNING \(/);
    });

    it('contains `COMPLETED (<M>):` header pattern', () => {
      expect(content).toMatch(/COMPLETED \(/);
    });

    it('documents the loop-id + iter + started_at columns for RUNNING', () => {
      expect(content).toMatch(/iter <iteration>\/<max_iterations>/);
      expect(content).toMatch(/started <relative time>/);
    });

    it('documents the terminal-status labels (completed, cancelled, max-iterations, crashed)', () => {
      expect(content).toMatch(/completed \(promise\)/);
      expect(content).toMatch(/\bcancelled\b/);
      expect(content).toMatch(/max-iterations/);
      expect(content).toMatch(/\bcrashed\b/);
    });
  });

  describe('Sort/truncation rules (FR-NL33)', () => {
    it('documents running sort by last_updated desc', () => {
      // Match the actual phrasing with backticks: `last_updated` descending
      expect(content).toMatch(/`last_updated`\s+descending/);
    });

    it('documents terminal sort by exited_at desc', () => {
      expect(content).toMatch(/`exited_at`\s+descending/);
    });

    it('documents the 20-most-recent cap with truncation note', () => {
      expect(content).toMatch(/Cap at the 20 most recent/);
      expect(content).toMatch(/truncation count/);
    });
  });

  describe('Missing-directory path (E15)', () => {
    it('prints the literal "No loops in this project." message', () => {
      expect(content).toContain('No loops in this project.');
    });
  });

  describe('Excludes .archive/', () => {
    it('explicitly skips the .archive subdirectory', () => {
      expect(content).toMatch(/\.archive\/.*intentionally skipped|skip.*\.archive/i);
    });
  });

  describe('Read-only contract', () => {
    it('explicitly states the command is read-only', () => {
      expect(content).toMatch(/read-only/i);
    });

    it('documents the WARNINGS block for malformed state files', () => {
      expect(content).toMatch(/WARNINGS/);
    });
  });

  describe('Anti-patterns', () => {
    it('does NOT mutate any state file', () => {
      expect(content).toMatch(/Do NOT mutate any state file/i);
    });

    it('does NOT recurse into .archive/', () => {
      expect(content).toMatch(/Do NOT recurse into `\.archive\/`/i);
    });
  });
});

/**
 * Layer 1: Structural tests for /synthex:cancel-loop.
 *
 * Task 30 acceptance criteria:
 *   - frontmatter (model: haiku per D-NL16)
 *   - `--all` path documented
 *   - idempotent re-cancel of terminal-status loop prints "already <status>" and exits 0 (FR-NL29)
 *   - atomic state-file write contract
 *   - cancellation is polled at iteration boundary (FR-NL31)
 *
 * Plan: docs/plans/native-looping.md Task 30.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANCEL_LOOP_MD = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'cancel-loop.md'
);

describe('/synthex:cancel-loop (cancel-loop.md) — Task 30 structural validation', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(CANCEL_LOOP_MD, 'utf-8');
  });

  describe('Frontmatter', () => {
    it('starts with --- delimiter', () => {
      expect(content.startsWith('---\n')).toBe(true);
    });

    it('declares model: haiku', () => {
      const fmEnd = content.indexOf('\n---\n', 4);
      const frontmatter = content.slice(4, fmEnd);
      expect(frontmatter).toMatch(/^model:\s*haiku\s*$/m);
    });
  });

  describe('Parameters (loop_id + --all)', () => {
    it('lists `loop_id` positional parameter', () => {
      expect(content).toMatch(/`loop_id`/);
    });

    it('lists `--all` flag', () => {
      expect(content).toMatch(/`--all`/);
    });

    it('declares mutual exclusivity of loop_id and --all', () => {
      expect(content).toMatch(/loop_id and --all are mutually exclusive/i);
    });

    it('refuses when neither loop_id nor --all is supplied', () => {
      expect(content).toMatch(/Usage: \/synthex:cancel-loop <loop-id> \| --all/);
    });
  });

  describe('Single-loop cancel path', () => {
    it('mutates status to "cancelled"', () => {
      expect(content).toContain('"cancelled"');
      expect(content).toMatch(/mutate to `status: "cancelled"`/i);
    });

    it('sets exited_at to current UTC ISO 8601 time', () => {
      expect(content).toMatch(/exited_at: <UTC ISO 8601 now>/);
    });

    it('sets exit_reason verbatim per FR-NL22', () => {
      expect(content).toMatch(/exit_reason: "Cancelled by \/synthex:cancel-loop"/);
    });

    it('refuses for missing state file with /synthex:list-loops hint', () => {
      expect(content).toMatch(/No loop found:/);
      expect(content).toMatch(/Run \/synthex:list-loops/i);
    });
  });

  describe('Idempotency (FR-NL29 — already-terminal handling)', () => {
    it('prints "Loop ... is already <status>" for terminal-status loops', () => {
      expect(content).toMatch(/Loop "<loop_id>" is already <status>/);
    });

    it('does NOT mutate a terminal-status state file', () => {
      expect(content).toMatch(/Do NOT mutate a terminal-status loop/i);
    });

    it('exits 0 on idempotent re-cancel', () => {
      expect(content).toMatch(/Exit 0.*FR-NL29 idempotency/);
    });
  });

  describe('--all path (FR-NL30 + E16)', () => {
    it('iterates running loops and cancels each', () => {
      // The --all path is described as a workflow step that enumerates the loops directory.
      // Use [\s\S]* for multi-line matching.
      expect(content).toMatch(/Cancel-all path \(`--all` supplied\)[\s\S]*Enumerate[\s\S]*\.synthex\/loops/i);
    });

    it('prints per-loop summary on --all', () => {
      expect(content).toMatch(/Cancelled \(<N>\):/);
    });

    it('handles "no running loops" idempotency (E16)', () => {
      expect(content).toContain('No running loops to cancel.');
    });
  });

  describe('Atomic write contract', () => {
    it('uses tmp-file + atomic rename', () => {
      expect(content).toMatch(/atomic.*rename|tmp.*mv/i);
      expect(content).toMatch(/<state-file>\.tmp\.<pid>/);
    });

    it('cleans up tmp-file on failure (best-effort)', () => {
      expect(content).toMatch(/best-effort cleanup|leave a partial.*tmp/i);
    });
  });

  describe('Cancellation latency (FR-NL31)', () => {
    it('documents that cancellation is polled at iteration boundary', () => {
      expect(content).toMatch(/polled at iteration boundar|polled at the iteration boundary/i);
    });

    it('explains worst-case one-iteration latency', () => {
      expect(content).toMatch(/within at most one more iteration|one iteration delay/i);
    });
  });

  describe('Anti-patterns', () => {
    it('does NOT delete the state file', () => {
      expect(content).toMatch(/Do NOT delete the state file/i);
    });

    it('does NOT touch loops in .archive/', () => {
      expect(content).toMatch(/Do NOT touch loops in `?\.archive/i);
    });

    it('does NOT prompt the user', () => {
      expect(content).toMatch(/Do NOT prompt the user/i);
    });
  });
});

/**
 * Task 86 (Phase 11.2), as superseded by Task 25 (FR-HM44 / FR-HM28).
 *
 * Task 86 originally added a pre-invocation `gemini --help` probe that selected
 * between a `--readonly` and a `--no-tools` flag. Neither flag has ever existed in
 * the Gemini CLI (confirmed absent from `gemini --help` and `config.ts` at v0.39.1
 * and on `main`), so the probe always fell through to its "neither flag present"
 * branch and every Pattern 1 (read-only) invocation aborted with `cli_failed` before
 * Gemini was ever called — a latent defect. Task 25 removes the probe entirely and
 * replaces it with `--approval-mode default`, which is a real, version-stable flag
 * that provides the same read-only guarantee in headless mode.
 *
 * [T] criteria (updated for Task 25):
 *   1. The `gemini --help` flag probe (and its --readonly/--no-tools selection logic)
 *      is no longer documented as adapter behavior.
 *   2. `--approval-mode default` is documented as the CLI invocation's read-only flag.
 *   3. sandbox_violation detection behavior remains documented.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGENT = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'agents',
  'gemini-review-prompter.md',
);

describe('Task 86 superseded by Task 25: Gemini approval-mode invocation + sandbox_violation detection', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
  });

  describe('[T] (1): the gemini --help flag probe is removed', () => {
    it('does not invoke `gemini --help` as a bash command (no active probe)', () => {
      // The doc may still reference "gemini --help" in prose explaining why the old
      // probe was removed, but it must not appear inside a ```bash invocation block.
      const bashBlocks = content.match(/```bash\n([\s\S]*?)```/g) ?? [];
      for (const block of bashBlocks) {
        expect(block).not.toContain('gemini --help');
      }
    });

    it('does not reference --readonly', () => {
      expect(content).not.toContain('--readonly');
    });

    it('does not reference --no-tools', () => {
      expect(content).not.toContain('--no-tools');
    });

    it('documents that no flag probe / detection is needed', () => {
      expect(content).toMatch(/no flag probe|probe is removed|No .*flag probe/i);
    });
  });

  describe('[T] (2): --approval-mode default documented as the CLI invocation flag', () => {
    it('documents the literal `--approval-mode default` flag', () => {
      expect(content).toContain('--approval-mode default');
    });

    it('documents --output-format json alongside it', () => {
      expect(content).toContain('--output-format json');
    });

    it('explains why headless default approval mode is read-only (no TTY to confirm on)', () => {
      expect(content).toMatch(/no TTY|denies?.*confirm|denied.*exclude/i);
    });

    it('references FR-HM44', () => {
      expect(content).toContain('FR-HM44');
    });
  });

  describe('[T] (3): sandbox_violation detection behavior documented', () => {
    it('mentions sandbox_violation as an error code', () => {
      expect(content).toContain('sandbox_violation');
    });

    it('documents what triggers sandbox_violation (write-tool evidence in output)', () => {
      expect(content).toMatch(/write-tool|write_file|state-mutating|tool_calls/i);
    });

    it('documents the sandbox_violation envelope return shape', () => {
      // Must be in a json block or similar referencing sandbox_violation as the error_code
      expect(content).toMatch(/error_code.*sandbox_violation|sandbox_violation.*error_code/s);
    });

    it('acknowledges detection is best-effort (not a guarantee)', () => {
      expect(content).toMatch(/best-effort|does NOT prove|absence.*does not/i);
    });
  });

  it('references Task 25 supersession context', () => {
    expect(content).toMatch(/Task 25/);
  });
});

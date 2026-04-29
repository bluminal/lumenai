/**
 * Task 86 (Phase 11.2): Gemini adapter probe + sandbox_violation detection.
 *
 * [T] criteria from the plan:
 *   1. Pre-invocation `gemini --help` probe documented (raw-string check)
 *   2. Both --readonly and --no-tools flag selection logic documented
 *   3. sandbox_violation detection behavior documented
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

describe('Task 86: Gemini probe + sandbox_violation detection', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
  });

  describe('[T] (1): pre-invocation gemini --help probe documented', () => {
    it('documents the literal `gemini --help` probe command', () => {
      expect(content).toContain('gemini --help');
    });

    it('documents the probe as a Step 4a (or equivalent pre-invocation) section', () => {
      expect(content).toMatch(/Step 4a|read-only flag probe|flag probe/i);
    });

    it('documents that the probe parses help output to select the flag', () => {
      expect(content).toMatch(/parse.*help.*output|select.*flag/i);
    });
  });

  describe('[T] (2): both --readonly and --no-tools flag selection logic documented', () => {
    it('mentions --readonly flag', () => {
      expect(content).toContain('--readonly');
    });

    it('mentions --no-tools flag', () => {
      expect(content).toContain('--no-tools');
    });

    it('documents priority order (--readonly preferred over --no-tools)', () => {
      // The probe should pick --readonly first, --no-tools as fallback
      expect(content).toMatch(/preferred|priority|first/i);
    });

    it('documents abort behavior when neither flag is present', () => {
      expect(content).toMatch(/neither flag|cli_failed/i);
      expect(content).toContain('cli_failed');
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

  it('references ADR-003 hardening context (Task 86)', () => {
    expect(content).toMatch(/Task 86|ADR-003 hardening/);
  });
});

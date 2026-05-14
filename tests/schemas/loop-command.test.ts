/**
 * Layer 1: Structural tests for /synthex:loop (the generic looping command).
 *
 * Task 28 acceptance criteria:
 *   - frontmatter (model: sonnet)
 *   - eight Parameters rows per FR-NL4
 *   - refusal-case anchors (FR-NL37, FR-NL38, FR-NL39, FR-NL40, FR-NL41, FR-NL42)
 *   - resume-logic anchors (FR-NL26, FR-NL27)
 *   - cross-reference to native-looping.md
 *
 * Plan: docs/plans/native-looping.md Task 28.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOOP_MD = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'loop.md'
);

describe('/synthex:loop (loop.md) — Task 28 structural validation', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(LOOP_MD, 'utf-8');
  });

  describe('Frontmatter', () => {
    it('starts with --- frontmatter delimiter', () => {
      expect(content.startsWith('---\n')).toBe(true);
    });

    it('declares model: sonnet (per D-NL16)', () => {
      const fmEnd = content.indexOf('\n---\n', 4);
      expect(fmEnd).toBeGreaterThan(0);
      const frontmatter = content.slice(4, fmEnd);
      expect(frontmatter).toMatch(/^model:\s*sonnet\s*$/m);
    });
  });

  describe('Parameters table (FR-NL4 — eight rows)', () => {
    const expectedParams = [
      '`--prompt <string>`',
      '`--prompt-file <path>`',
      '`--completion-promise <string>`',
      '`--max-iterations <int>`',
      '`--loop-isolated`',
      '`--name <slug>`',
      '`--resume <loop-id>`',
      '`--resume-last`',
    ];

    it.each(expectedParams)('contains %s row', (param) => {
      expect(content).toContain(param);
    });

    it('declares "Parameters" section heading', () => {
      expect(content).toMatch(/^## Parameters/m);
    });
  });

  describe('Refusal-case anchors (FR-NL37..FR-NL42)', () => {
    const refusalAnchors = [
      // FR-NL37: no prompt source AND no resume
      { fr: 'FR-NL37', pattern: /Pass --prompt, --prompt-file, --resume/ },
      // FR-NL38: --prompt and --prompt-file mutually exclusive
      { fr: 'FR-NL38', pattern: /mutually exclusive/ },
      // FR-NL39: --prompt-file does not exist
      { fr: 'FR-NL39', pattern: /Prompt file not found/ },
      // FR-NL40: --resume <id> state file doesn't exist
      { fr: 'FR-NL40', pattern: /No loop found:/ },
      // FR-NL41: --resume with unknown schema_version
      { fr: 'FR-NL41', pattern: /schema_version|delete-instructions/ },
      // FR-NL42: --max-iterations > 200
      { fr: 'FR-NL42', pattern: /--max-iterations must be an integer in \[1, 200\]/ },
    ];

    it.each(refusalAnchors)('refusal path for $fr present', ({ pattern }) => {
      expect(content).toMatch(pattern);
    });
  });

  describe('Resume-logic anchors (FR-NL26, FR-NL27)', () => {
    it('FR-NL26 — --resume <loop-id> uses persisted args', () => {
      expect(content).toMatch(/--resume re-uses the persisted/i);
    });

    it('FR-NL27 — --resume-last picks the most-recent running loop', () => {
      expect(content).toContain('--resume-last');
      expect(content).toMatch(/most-recent running/);
    });

    it('refuses --resume with new prompt source (E11)', () => {
      expect(content).toMatch(/do not pass --prompt or --prompt-file alongside --resume/);
    });
  });

  describe('Iteration framework reference', () => {
    it('cross-references native-looping.md', () => {
      expect(content).toMatch(/native-looping\.md/);
    });

    it('references shared-context (default) and subagent modes', () => {
      expect(content).toMatch(/shared-context/);
      expect(content).toMatch(/subagent/i);
    });

    it('references the iteration marker format', () => {
      expect(content).toMatch(/\[loop <loop-id> iteration/);
    });
  });

  describe('Ralph Loop precedence (FR-NL44)', () => {
    it('includes the verbatim advisory line', () => {
      expect(content).toContain('Note: --loop overrides Ralph Loop');
    });

    it('states that .claude/ralph-loop.local.md is NOT mutated', () => {
      expect(content).toMatch(/Do \*\*not\*\* mutate `\.claude\/ralph-loop\.local\.md`/);
    });
  });

  describe('Anti-patterns documented', () => {
    it('do NOT accumulate iteration state in conversation', () => {
      expect(content).toMatch(/Do NOT accumulate iteration state in the conversation/);
    });

    it('do NOT emit promise in thinking text', () => {
      expect(content).toMatch(/Do NOT emit `<promise>\.\.\.<\/promise>` in thinking text/);
    });
  });
});

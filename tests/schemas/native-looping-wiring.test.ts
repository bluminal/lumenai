/**
 * Layer 1: Verifies that all 8 FR-NL1 commands have the `--loop` wiring
 * (Phase 4 + Phase 5 amendments). Asserts both Parameters table rows and
 * the Native Looping section anchors are present.
 *
 * Task 31 — parameterized across the 8 FR-NL1 commands.
 *
 * Plan: docs/plans/native-looping.md Task 31.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

interface CommandSpec {
  label: string;
  plugin: 'synthex' | 'synthex-plus';
  filename: string;
  isTeam: boolean;
}

const FR_NL1_COMMANDS: CommandSpec[] = [
  // Phase 4 — synthex
  { label: 'next-priority', plugin: 'synthex', filename: 'next-priority.md', isTeam: false },
  { label: 'write-implementation-plan', plugin: 'synthex', filename: 'write-implementation-plan.md', isTeam: false },
  { label: 'refine-requirements', plugin: 'synthex', filename: 'refine-requirements.md', isTeam: false },
  { label: 'review-code', plugin: 'synthex', filename: 'review-code.md', isTeam: false },
  // Phase 5 — synthex-plus team commands
  { label: 'team-implement', plugin: 'synthex-plus', filename: 'team-implement.md', isTeam: true },
  { label: 'team-review', plugin: 'synthex-plus', filename: 'team-review.md', isTeam: true },
  { label: 'team-plan', plugin: 'synthex-plus', filename: 'team-plan.md', isTeam: true },
  { label: 'team-refine', plugin: 'synthex-plus', filename: 'team-refine.md', isTeam: true },
];

const NEW_PARAM_ANCHORS = [
  '`--loop`',
  '`--completion-promise <string>`',
  '`--max-iterations <int>`',
  '`--loop-isolated`',
  '`--name <slug>`',
];

const NATIVE_LOOPING_SUB_ANCHORS = [
  '## Native Looping',
  '### Emission Point',
  '### Iteration Body',
  '### Precedence with Ralph Loop',
  '### See Also',
];

describe.each(FR_NL1_COMMANDS)(
  '$plugin/$label — --loop wiring (Task 31)',
  ({ plugin, filename, isTeam }) => {
    const cmdPath = join(REPO_ROOT, 'plugins', plugin, 'commands', filename);
    let content: string;

    beforeAll(() => {
      content = readFileSync(cmdPath, 'utf-8');
    });

    describe('Parameters table — five new rows (FR-NL2)', () => {
      it.each(NEW_PARAM_ANCHORS)('contains %s', (param) => {
        expect(content).toContain(param);
      });
    });

    describe('Native Looping section — four sub-anchors', () => {
      it.each(NATIVE_LOOPING_SUB_ANCHORS)('contains "%s" heading', (heading) => {
        expect(content).toContain(heading);
      });
    });

    describe('Cross-reference to native-looping.md', () => {
      it('links to the shared framework spec', () => {
        expect(content).toMatch(/native-looping\.md/);
      });
    });

    describe('Ralph Loop precedence (FR-NL44)', () => {
      it('includes the verbatim advisory line', () => {
        expect(content).toContain('Note: --loop overrides Ralph Loop');
      });

      it('explicitly states .claude/ralph-loop.local.md is NOT mutated', () => {
        expect(content).toMatch(/`\.claude\/ralph-loop\.local\.md` is NOT mutated/);
      });
    });

    if (isTeam) {
      describe('Team-specific clauses (FR-NL34, FR-NL35, E7)', () => {
        it('documents lead-output-only promise scan (E7)', () => {
          expect(content).toMatch(/Lead-output-only promise scan|Pool Lead's consolidated output/);
        });

        it('documents team-lifecycle independence (FR-NL35)', () => {
          expect(content).toMatch(/Team lifecycle independence|does NOT change.*team lifecycle/i);
        });
      });
    }
  }
);

describe('Commands with existing Ralph Loop Integration — precedence paragraph (D-NL11)', () => {
  // Only next-priority and team-implement have pre-existing Ralph Loop Integration sections.
  const RALPH_COMMANDS: CommandSpec[] = [
    { label: 'next-priority', plugin: 'synthex', filename: 'next-priority.md', isTeam: false },
    { label: 'team-implement', plugin: 'synthex-plus', filename: 'team-implement.md', isTeam: true },
  ];

  describe.each(RALPH_COMMANDS)('$plugin/$label', ({ plugin, filename }) => {
    const cmdPath = join(REPO_ROOT, 'plugins', plugin, 'commands', filename);
    let content: string;

    beforeAll(() => {
      content = readFileSync(cmdPath, 'utf-8');
    });

    it('still has the original "Ralph Loop Integration" section', () => {
      expect(content).toMatch(/## Ralph Loop Integration/);
    });

    it('Ralph Loop Integration section gains a precedence paragraph (FR-NL44)', () => {
      // Specifically the appended subsection within Ralph Loop Integration.
      expect(content).toMatch(/### `--loop` precedence \(FR-NL44\)/);
    });

    it('precedence paragraph mentions Synthex 0.7+', () => {
      expect(content).toMatch(/Synthex 0\.7\+/);
    });
  });
});

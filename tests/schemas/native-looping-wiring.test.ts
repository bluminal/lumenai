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

    describe('Native Looping section — required headings', () => {
      it.each(NATIVE_LOOPING_SUB_ANCHORS)('contains "%s" heading', (heading) => {
        expect(content).toContain(heading);
      });
    });

    describe('Cross-reference to native-looping.md', () => {
      it('links to the shared framework spec', () => {
        expect(content).toMatch(/native-looping\.md/);
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

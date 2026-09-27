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

// ---------------------------------------------------------------------------
// Task 34 (FR-HM18): "Layer 2 shows 1 Bash call per iteration" — Layer 2
// requires a live LLM run to actually count tool calls, which this suite does
// not trigger (see the promptfoo NOT-RUN case documented in
// tests/promptfoo.config.yaml). This Layer 1 assertion is the substitute: it
// checks that each looping command's per-iteration protocol prose DIRECTS
// exactly one `loop-step.sh advance` Bash call per iteration, rather than
// the old multi-step (boundary check + increment + marker-print) breakdown.
//
// Scoped to the 4 synthex commands actually rewritten for FR-HM18 (plus
// /synthex:loop itself, asserted separately in loop-command.test.ts). The
// synthex-plus team commands are untouched by Task 34 (synthex-plus is
// being phased out) and are not asserted here.
// ---------------------------------------------------------------------------

const ADVANCE_REWRITTEN_COMMANDS = FR_NL1_COMMANDS.filter((c) => !c.isTeam);

describe.each(ADVANCE_REWRITTEN_COMMANDS)(
  '$plugin/$label — one loop-step.sh advance Bash call per iteration (Task 34, FR-HM18)',
  ({ plugin, filename }) => {
    const cmdPath = join(REPO_ROOT, 'plugins', plugin, 'commands', filename);
    let content: string;

    beforeAll(() => {
      content = readFileSync(cmdPath, 'utf-8');
    });

    it('directs the per-iteration `loop-step.sh advance <loop-id>` call', () => {
      expect(content).toMatch(/loop-step\.sh advance <loop-id>/);
    });

    it('names it as ONE Bash call', () => {
      expect(content).toMatch(/ONE Bash call/);
    });

    it('the iteration-body prose calls `advance` from exactly one step (not once per some other loop construct)', () => {
      // The intro sentence may restate the call for context; what matters is
      // that the actual numbered protocol only performs it from a single
      // step. Heuristic: no two DIFFERENT numbered list items ("1. **...**"
      // style) both invoke advance — i.e. it is not re-invoked mid-iteration.
      const numberedStepsInvokingAdvance = (
        content.match(/^\d+\.\s+\*\*[^*]*\*\*[^\n]*loop-step\.sh advance/gm) || []
      ).length;
      expect(numberedStepsInvokingAdvance).toBeLessThanOrEqual(1);
    });

    it('no longer documents the old separate boundary-check + increment + marker-print steps', () => {
      expect(content).not.toMatch(
        /boundary check → increment counter → print marker → execute workflow → scan for promise → cancellation check → loop/,
      );
    });
  },
);

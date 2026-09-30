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
  plugin: 'synthex';
  filename: string;
}

// Task 55 (FR-HM2, FR-HM24): synthex-plus and its 5 team-* commands
// (team-review, team-implement, team-plan, team-refine, team-init) are
// retired outright — their behavior is the capability ladder inside these
// existing synthex commands (see docs/migrations/synthex-plus.md).
const FR_NL1_COMMANDS: CommandSpec[] = [
  { label: 'next-priority', plugin: 'synthex', filename: 'next-priority.md' },
  { label: 'write-implementation-plan', plugin: 'synthex', filename: 'write-implementation-plan.md' },
  { label: 'refine-requirements', plugin: 'synthex', filename: 'refine-requirements.md' },
  { label: 'review-code', plugin: 'synthex', filename: 'review-code.md' },
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
  ({ plugin, filename }) => {
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
// /synthex:loop itself, asserted separately in loop-command.test.ts).
// ---------------------------------------------------------------------------

const ADVANCE_REWRITTEN_COMMANDS = FR_NL1_COMMANDS;

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

// ---------------------------------------------------------------------------
// Default completion promise (docs/plans/loop-default-completion-promise.md
// Task 2, D1-D5): --completion-promise is no longer required. Each of the 5
// loop-capable synthex commands (loop.md plus the 4 non-team FR-NL1
// commands), and native-looping.md itself, must document the
// ALLDONE<session_id> default and the ALLDONE<loop_id> fallback, and none
// may still claim the flag is "Required with `--loop`".
// ---------------------------------------------------------------------------

const DEFAULT_PROMISE_FILES = [
  { label: 'loop', path: join(REPO_ROOT, 'plugins', 'synthex', 'commands', 'loop.md') },
  ...FR_NL1_COMMANDS.map((c) => ({
    label: c.label,
    path: join(REPO_ROOT, 'plugins', c.plugin, 'commands', c.filename),
  })),
  {
    label: 'native-looping.md',
    path: join(REPO_ROOT, 'plugins', 'synthex', 'docs', 'native-looping.md'),
  },
];

describe.each(DEFAULT_PROMISE_FILES)(
  '$label — default completion promise (loop-default-completion-promise Task 2)',
  ({ path }) => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(path, 'utf-8');
    });

    it('does not say --completion-promise is "Required with `--loop`"', () => {
      expect(content).not.toMatch(/Required with `--loop`/);
    });

    it('documents the ALLDONE<session_id> default', () => {
      expect(content).toMatch(/ALLDONE<session_id>/);
    });

    it('documents the ALLDONE<loop_id> fallback', () => {
      expect(content).toMatch(/ALLDONE<loop_id>/);
    });
  },
);

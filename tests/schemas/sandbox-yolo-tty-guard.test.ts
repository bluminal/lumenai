/**
 * Task 89 (Phase 11.2): non-TTY guard for sandbox-yolo confirmation prompt.
 *
 * [T] criteria from the plan:
 *   1. All three commands document the non-TTY guard with the literal phrase "When stdin is not a TTY"
 *   2. All three use identical wording (verbatim per D25/NFR-MMT7 convention)
 *   3. (this file) Layer 1 test asserts the guard is present in all three command files
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGINS = join(__dirname, '..', '..', 'plugins');

const COMMANDS = [
  {
    name: '/synthex-plus:start-review-team',
    file: join(PLUGINS, 'synthex-plus', 'commands', 'start-review-team.md'),
  },
  {
    name: '/synthex:review-code',
    file: join(PLUGINS, 'synthex', 'commands', 'review-code.md'),
  },
  {
    name: '/synthex:performance-audit',
    file: join(PLUGINS, 'synthex', 'commands', 'performance-audit.md'),
  },
];

// The verbatim sentence locked across all three commands. Per D25/NFR-MMT7
// the user-visible string copy is locked verbatim; this test enforces that
// at the Layer 1 (schema) level so any drift in any one command file fails
// CI and forces the change to all three.
const VERBATIM_GUARD =
  '**When stdin is not a TTY** (CI, scripted invocation, stdin redirected from `/dev/null`), treat as default-N and abort cleanly without prompting. This mirrors the TTY guard documented for the waiting indicator and prevents unbounded CI hangs on the unanswerable prompt. Detect non-TTY stdin before reading the prompt; do NOT block waiting for input that will never arrive.';

describe('Task 89: non-TTY guard for sandbox-yolo confirmation prompt', () => {
  const contents = new Map<string, string>();

  beforeAll(() => {
    for (const cmd of COMMANDS) {
      contents.set(cmd.name, readFileSync(cmd.file, 'utf8'));
    }
  });

  describe('[T] (1): each command documents the non-TTY guard with the literal phrase "When stdin is not a TTY"', () => {
    for (const cmd of COMMANDS) {
      it(`${cmd.name} contains the literal phrase`, () => {
        expect(contents.get(cmd.name)).toContain('When stdin is not a TTY');
      });
    }
  });

  describe('[T] (2): all three use identical wording (verbatim per D25/NFR-MMT7)', () => {
    for (const cmd of COMMANDS) {
      it(`${cmd.name} contains the verbatim guard sentence`, () => {
        expect(contents.get(cmd.name)).toContain(VERBATIM_GUARD);
      });
    }

    it('all three command files contain byte-identical guard sentences', () => {
      // Re-extract the sentence from each file and compare. Any drift fails this.
      const startMarker = '**When stdin is not a TTY**';
      const endMarker = 'will never arrive.';
      const extracted = COMMANDS.map((cmd) => {
        const c = contents.get(cmd.name) ?? '';
        const start = c.indexOf(startMarker);
        const end = c.indexOf(endMarker, start);
        return start !== -1 && end !== -1
          ? c.slice(start, end + endMarker.length)
          : null;
      });
      // All three must have extracted the sentence
      for (const e of extracted) expect(e).not.toBeNull();
      // And all three must be identical
      expect(extracted[1]).toBe(extracted[0]);
      expect(extracted[2]).toBe(extracted[0]);
    });
  });

  describe('semantic checks: non-TTY guard semantics are correctly conveyed', () => {
    for (const cmd of COMMANDS) {
      it(`${cmd.name} mentions abort-without-prompting on non-TTY`, () => {
        expect(contents.get(cmd.name)).toMatch(
          /abort cleanly without prompting|abort.*default-N/i,
        );
      });
      it(`${cmd.name} explains the rationale (CI hang prevention)`, () => {
        expect(contents.get(cmd.name)).toMatch(/CI hang|unbounded|never arrive/i);
      });
    }
  });
});

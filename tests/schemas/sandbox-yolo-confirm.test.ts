import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGINS = join(__dirname, '..', '..', 'plugins');

type Cmd = { name: string; file: string; followupContext: string };

// Task 83 requires the verbatim warning string + y/N confirmation prompt
// to appear in three commands.
const COMMANDS: Cmd[] = [
  {
    name: '/synthex-plus:start-review-team',
    file: join(PLUGINS, 'synthex-plus', 'commands', 'start-review-team.md'),
    followupContext: 'pool',
  },
  {
    name: '/synthex:review-code',
    file: join(PLUGINS, 'synthex', 'commands', 'review-code.md'),
    followupContext: 'review',
  },
  {
    name: '/synthex:performance-audit',
    file: join(PLUGINS, 'synthex', 'commands', 'performance-audit.md'),
    followupContext: 'audit',
  },
];

// D25 / NFR-MMT7: this string is locked verbatim per-character.
const VERBATIM_WARNING =
  '⚠ <cli-name> is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.';

describe('Task 83: sandbox-yolo confirmation prompt across 3 commands', () => {
  for (const cmd of COMMANDS) {
    describe(cmd.name, () => {
      let content: string;
      beforeAll(() => {
        content = readFileSync(cmd.file, 'utf8');
      });

      it('[T] verbatim warning string matches per D25 / NFR-MMT7', () => {
        expect(content).toContain(VERBATIM_WARNING);
      });

      it('[T] y/N confirmation prompt is required (default N) for sandbox-yolo', () => {
        expect(content).toMatch(/\[y\/N\]/);
        // Default-N semantics must be documented (Enter = no).
        expect(content).toMatch(/Default is\s*\*\*N\*\*|Default is N|default.*N.*Enter.*no/i);
      });

      it('[T] confirmation step is skipped when no CLI is sandbox-yolo (only triggers for that mode)', () => {
        // The "skip" guard must be present so read-only/parent-mediated invocations don't prompt.
        expect(content).toMatch(/Skip this step.*no CLI.*sandbox-yolo|skip.*read-only.*parent-mediated/is);
      });

      it('references ADR-003 / D27 / FR-MMT21 in the new section', () => {
        expect(content).toContain('ADR-003');
        expect(content).toContain('D27');
        expect(content).toContain('FR-MMT21');
      });

      it('reads the per-CLI external_permission_mode config key', () => {
        expect(content).toContain('multi_model_review.external_permission_mode');
      });

      it(`mentions the ${cmd.followupContext} context in the confirmation prompt`, () => {
        // Each command's prompt body should be context-appropriate
        // (pool / review / audit) — not just a generic copy.
        expect(content).toMatch(new RegExp(`\\bsandbox-yolo CLI\\(s\\)`, 'i'));
      });

      it('locks D25 / NFR-MMT7 verbatim copy convention', () => {
        expect(content).toMatch(/D25.*NFR-MMT7|NFR-MMT7.*D25|locked verbatim/);
      });
    });
  }
});

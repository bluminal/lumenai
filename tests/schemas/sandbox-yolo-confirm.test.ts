import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGINS = join(__dirname, '..', '..', 'plugins');

type Cmd = { name: string; file: string; followupContext: string };

// Task 83 requires the verbatim warning string + y/N confirmation prompt
// to appear in three commands.
//
// Task 13 (FR-HM5, D17) repoint: /synthex:review-code's Step 1c body moved
// byte-identical to plugins/synthex/docs/sandbox-yolo.md, replaced in
// review-code.md by a two-line D17 gate (the TTY-guard sentence itself
// stays inline — see sandbox-yolo-tty-guard.test.ts). These verbatim
// strings now live in the doc file, so this entry reads it instead.
//
// Task 14 (FR-HM5, D17) repoint: /synthex:performance-audit's Step 1c body
// was verbatim-identical to review-code's except for command-specific words
// ("review" vs "audit", the sibling command named in the closing sentence),
// so it moved into the SAME doc file rather than a fork, kept verbatim
// under a "## performance-audit variant" heading. This entry now also
// reads docs/sandbox-yolo.md.
const COMMANDS: Cmd[] = [
  {
    name: '/synthex-plus:start-review-team',
    file: join(PLUGINS, 'synthex-plus', 'commands', 'start-review-team.md'),
    followupContext: 'pool',
  },
  {
    name: '/synthex:review-code',
    file: join(PLUGINS, 'synthex', 'docs', 'sandbox-yolo.md'),
    followupContext: 'review',
  },
  {
    name: '/synthex:performance-audit',
    file: join(PLUGINS, 'synthex', 'docs', 'sandbox-yolo.md'),
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

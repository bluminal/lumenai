/**
 * Layer 1: Structural tests for /synthex:dismiss-upgrade-nudge and
 * /synthex-plus:dismiss-upgrade-nudge commands.
 *
 * Task 20 acceptance criteria:
 *   - frontmatter (model: haiku)
 *   - no parameters
 *   - sets dismissed: true
 *   - idempotent re-creation logic documented (creates state if missing)
 *
 * Both commands are tested in parallel since they mirror each other. The
 * synthex variant was repointed at scripts/state-flag.sh (Task 38,
 * FR-HM26): it no longer writes state.json inline via the Write tool, so
 * its "State file write" / "Idempotent re-creation" assertions check the
 * new script-delegation prose instead — see the `usesScript` branch below.
 * synthex-plus is untouched (still writes state.json inline) and keeps the
 * original assertions.
 *
 * Plan: docs/plans/upgrade-onboarding.md Task 20; docs/plans/harness
 * -modernization.md Task 38.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYNTHEX_DISMISS = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'dismiss-upgrade-nudge.md'
);

const SYNTHEX_PLUS_DISMISS = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex-plus',
  'commands',
  'dismiss-upgrade-nudge.md'
);

const variants: {
  label: string;
  path: string;
  statePath: string;
  siblingCommand: string;
  usesScript: boolean;
}[] = [
  {
    label: 'synthex',
    path: SYNTHEX_DISMISS,
    statePath: '.synthex/state.json',
    siblingCommand: '/synthex:configure-multi-model',
    usesScript: true,
  },
  {
    label: 'synthex-plus',
    path: SYNTHEX_PLUS_DISMISS,
    statePath: '.synthex-plus/state.json',
    siblingCommand: '/synthex-plus:configure-teams',
    usesScript: false,
  },
];

describe.each(variants)(
  'dismiss-upgrade-nudge.md ($label) — Task 20 structural validation',
  ({ path, statePath, siblingCommand, usesScript }) => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(path, 'utf-8');
    });

    describe('Frontmatter', () => {
      it('starts with --- frontmatter delimiter', () => {
        expect(content.startsWith('---\n')).toBe(true);
      });

      it('declares model: haiku', () => {
        const fmEnd = content.indexOf('\n---\n', 4);
        expect(fmEnd).toBeGreaterThan(0);
        const frontmatter = content.slice(4, fmEnd);
        expect(frontmatter).toMatch(/^model:\s*haiku\s*$/m);
      });
    });

    describe('No parameters', () => {
      it('does not declare a Parameters table', () => {
        // The command takes no arguments. Per the plan: "No flags, no parameters."
        // (We allow the word "parameters" elsewhere in prose, just not as a table.)
        const hasParamsTable = /^##\s+Parameters\b/m.test(content);
        expect(hasParamsTable).toBe(false);
      });

      it('explicitly states the command takes no arguments', () => {
        expect(content).toMatch(/takes no arguments/i);
      });
    });

    describe('State file write', () => {
      it(`targets ${statePath}`, () => {
        expect(content).toContain(statePath);
      });

      if (usesScript) {
        // Task 38 (FR-HM26): the write itself is delegated to
        // scripts/state-flag.sh — the command's prose documents what the
        // script does rather than performing the write itself.

        it('delegates the write to state-flag.sh', () => {
          expect(content).toMatch(/state-flag\.sh\s+dismissed/);
          expect(content).toMatch(/CLAUDE_PLUGIN_ROOT/);
        });

        it('sets dismissed: true', () => {
          expect(content).toMatch(/"dismissed":\s*true/);
          expect(content).toMatch(/atomically sets\s+`"dismissed":\s*true`/);
        });

        it('preserves last_seen_version when present', () => {
          expect(content).toMatch(/Preserve\s+`last_seen_version`/i);
          expect(content).toMatch(/field-preservation rules/i);
        });

        it('mentions updated_at', () => {
          expect(content).toMatch(/updated_at/);
        });
      } else {
        it('sets dismissed: true', () => {
          expect(content).toMatch(/"dismissed":\s*true/);
          expect(content).toMatch(/Always set\s+`dismissed:\s*true`/);
        });

        it('preserves last_seen_version when present', () => {
          expect(content).toMatch(/Preserve\s+`last_seen_version`/i);
        });

        it('updates updated_at timestamp', () => {
          expect(content).toMatch(/updated_at/);
          expect(content).toMatch(/Always update\s+`updated_at`/i);
        });
      }
    });

    describe('Idempotent re-creation', () => {
      if (usesScript) {
        it('handles a missing or malformed state file by creating a fresh state (FR-UO18)', () => {
          expect(content).toMatch(
            /does not exist yet, or fails to parse[\s\S]*treats it as missing[\s\S]*creates a fresh document/i,
          );
        });
      } else {
        it('handles missing state file by creating a fresh state', () => {
          expect(content).toMatch(/file does not exist[\s\S]*defaults?\s+to\s+`current_version`/i);
        });

        it('handles malformed state file by overwriting (FR-UO18)', () => {
          expect(content).toMatch(/parse fails[\s\S]*overwrite/i);
        });
      }

      it('explicitly states idempotency', () => {
        expect(content).toMatch(/idempotent/i);
      });
    });

    describe('Anti-patterns', () => {
      it('does NOT modify config.yaml (writes ONLY state.json)', () => {
        expect(content).toMatch(/does NOT modify[\s\S]*config\.yaml/);
      });

      it('does NOT prompt the user (no AskUserQuestion)', () => {
        expect(content).toMatch(/Do NOT use\s+`AskUserQuestion`/);
        // The body itself should not invoke AskUserQuestion (only mention it as anti-pattern).
        const askInvocations = (content.match(/^[^>#`].*\bAskUserQuestion\b/gm) || []).filter(
          (line) => !/Do NOT use|anti-pattern/i.test(line)
        );
        expect(askInvocations.length).toBe(0);
      });
    });

    describe('Confirmation output', () => {
      it('mentions the sibling configuration command for re-enabling', () => {
        expect(content).toContain(siblingCommand);
      });

      it('explains how to un-dismiss (delete state file)', () => {
        expect(content).toMatch(/delete\s+`?\.synthex/i);
      });
    });
  }
);

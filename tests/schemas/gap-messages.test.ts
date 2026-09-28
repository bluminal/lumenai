/**
 * Layer 1: Schema validation for Task 47 (FR-HM24, D11) — the documented-gap
 * sentence gating the 3 pool-management commands folded into synthex from
 * synthex-plus.
 *
 * D11: `start-review-team`, `stop-review-team`, and `list-teams` print
 * `GAP_MESSAGES.pool` (single-sourced in scripts/lib/host-matrix.mjs)
 * verbatim, without calling `SendMessage`/`ListAgents`, whenever the host's
 * tool list lacks Agent Teams. `configure-teams` is ungated — it only ever
 * writes config, so a mixed-host team must be able to author it from any
 * host — so it must contain neither the gap sentence nor a tool-presence
 * gate referencing `SendMessage`/`ListAgents`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GAP_MESSAGES } from '../../plugins/synthex/scripts/lib/host-matrix.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const commandsRoot = join(repoRoot, 'plugins', 'synthex', 'commands');

const GATED_COMMANDS = ['start-review-team', 'stop-review-team', 'list-teams'];
const UNGATED_COMMAND = 'configure-teams';

function readCommand(slug: string): string {
  return readFileSync(join(commandsRoot, `${slug}.md`), 'utf8');
}

describe('Task 47 (FR-HM24, D11): gap-messages.test.ts', () => {
  it('GAP_MESSAGES.pool is a single-sourced, non-empty, single-line sentence', () => {
    expect(GAP_MESSAGES.pool).toBeTruthy();
    expect(typeof GAP_MESSAGES.pool).toBe('string');
    expect(GAP_MESSAGES.pool).not.toContain('\n');
  });

  describe.each(GATED_COMMANDS)('%s.md', (slug) => {
    const content = readCommand(slug);

    it('prints GAP_MESSAGES.pool verbatim', () => {
      expect(content).toContain(GAP_MESSAGES.pool);
    });

    it('gates on SendMessage/ListAgents tool presence, not host name', () => {
      expect(content).toMatch(/`SendMessage`/);
      expect(content).toMatch(/`ListAgents`/);
      expect(content).toMatch(/in your tool list/i);
      expect(content).toMatch(/\botherwise\b/i);
    });

    it('has a Step 0 host capability gate ahead of every other step', () => {
      // "### 0." or "### Step 0." — both step-numbering styles are used
      // across the 4 folded commands (see stop-review-team.md vs.
      // start-review-team.md).
      expect(content).toMatch(/^### (Step )?0\.\s+Host Capability Gate/m);
    });
  });

  describe(`${UNGATED_COMMAND}.md`, () => {
    const content = readCommand(UNGATED_COMMAND);

    it('does not print GAP_MESSAGES.pool (D11: never gated)', () => {
      expect(content).not.toContain(GAP_MESSAGES.pool);
    });

    it('has no Step 0 host capability gate', () => {
      expect(content).not.toMatch(/^### (Step )?0\.\s+Host Capability Gate/m);
    });

    it('never references SendMessage or ListAgents (writes config only)', () => {
      expect(content).not.toMatch(/`SendMessage`/);
      expect(content).not.toMatch(/`ListAgents`/);
    });
  });
});

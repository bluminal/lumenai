/**
 * Layer 1: Structural validation for the synthex-plus tombstone release
 * (Task 54, FR-HM2, decisions D7/D8/D20/D23).
 *
 * FR-HM2: "Because removing a plugin from the marketplace does not
 * uninstall cached copies, a final tombstone release of synthex-plus
 * (empty hooks.json, commands that print migration steps only) ships
 * before the marketplace entry is removed." D7: the tombstone ships in
 * the same release as the pool-capability fold. D8: the major version
 * bump is carried in .release-intent.json (see cross-harness-compat.test.ts
 * "marks the synthex-plus tombstone release as a one-time major bump").
 *
 * Task 54 acceptance criteria covered here:
 *   [T] hooks.json has no hook events
 *   [T] agents[] is empty and no agent files remain
 *   [T] every command file contains a pointer to docs/migrations/synthex-plus.md
 *
 * See docs/migrations/synthex-plus.md for the migration guide every stub
 * points at, and plugins/synthex-plus/README.md for the plugin-level notice.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex-plus');
const MIGRATION_GUIDE_REL = 'docs/migrations/synthex-plus.md';
const MIGRATION_GUIDE_ABS = join(REPO_ROOT, MIGRATION_GUIDE_REL);

const PLUGIN_JSON_PATH = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const HOOKS_JSON_PATH = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

describe('synthex-plus tombstone (Task 54, FR-HM2, D7/D8)', () => {
  it('the migration guide this tombstone points at actually exists', () => {
    // A stale pointer would defeat the whole tombstone.
    expect(existsSync(MIGRATION_GUIDE_ABS)).toBe(true);
  });

  describe('hooks.json has no hook events', () => {
    const hooksJson = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf-8'));

    it('parses as JSON with a "hooks" object', () => {
      expect(hooksJson).toHaveProperty('hooks');
      expect(typeof hooksJson.hooks).toBe('object');
      expect(Array.isArray(hooksJson.hooks)).toBe(false);
    });

    it('declares zero hook events (no SessionStart, TaskCompleted, or TeammateIdle)', () => {
      expect(Object.keys(hooksJson.hooks)).toEqual([]);
    });

    it('registers no SessionStart entry (the upgrade nudge no longer fires for stale installs)', () => {
      expect(hooksJson.hooks.SessionStart).toBeUndefined();
    });

    it('registers no TaskCompleted or TeammateIdle entries (stale lifecycle gates no longer fire)', () => {
      expect(hooksJson.hooks.TaskCompleted).toBeUndefined();
      expect(hooksJson.hooks.TeammateIdle).toBeUndefined();
    });
  });

  describe('agents[] is empty and no agent files remain', () => {
    const pluginJson = JSON.parse(readFileSync(PLUGIN_JSON_PATH, 'utf-8'));

    it('plugin.json declares an empty agents array', () => {
      expect(Array.isArray(pluginJson.agents)).toBe(true);
      expect(pluginJson.agents).toEqual([]);
    });

    it('the agents/ directory contains no agent definitions (directory itself may be absent)', () => {
      if (!existsSync(AGENTS_DIR)) {
        // The directory disappearing entirely (its only contents were the
        // three deleted agent files) also satisfies "no agent files remain".
        return;
      }
      const remaining = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
      expect(remaining).toEqual([]);
    });

    it('the three synthex-plus-only agents are gone (ported copies live on in plugins/synthex/agents/)', () => {
      for (const agent of [
        'standing-pool-cleanup.md',
        'standing-pool-submitter.md',
        'team-orchestrator-bridge.md',
      ]) {
        expect(existsSync(join(AGENTS_DIR, agent))).toBe(false);
        expect(
          existsSync(join(REPO_ROOT, 'plugins', 'synthex', 'agents', agent)),
        ).toBe(true);
      }
    });
  });

  describe('plugin.json and README reflect the deprecation', () => {
    const pluginJson = JSON.parse(readFileSync(PLUGIN_JSON_PATH, 'utf-8'));
    const readme = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf-8');

    it('plugin.json description says deprecated and points at the migration guide', () => {
      expect(pluginJson.description).toMatch(/deprecated/i);
      expect(pluginJson.description).toContain(MIGRATION_GUIDE_REL);
    });

    it('README.md says deprecated and links the migration guide', () => {
      expect(readme).toMatch(/deprecated/i);
      expect(readme).toContain('synthex-plus.md');
    });
  });

  describe('every command file contains a pointer to docs/migrations/synthex-plus.md', () => {
    const commandFiles = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));

    // Every .md file plugin.json registers, plus api-spike.md (D11: never
    // registered in plugin.json, but still a live command file in this
    // directory that must carry the same migration pointer).
    it('found at least the 12 known synthex-plus command files', () => {
      expect(commandFiles.length).toBeGreaterThanOrEqual(12);
    });

    it.each(commandFiles)('%s points at docs/migrations/synthex-plus.md', (filename) => {
      const content = readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
      expect(content).toContain(MIGRATION_GUIDE_REL);
    });

    it.each(commandFiles)('%s states that synthex-plus is deprecated', (filename) => {
      const content = readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
      expect(content).toMatch(/synthex-plus is deprecated/i);
    });
  });

  describe('command stubs print migration steps and do nothing else', () => {
    const commandFiles = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));

    it.each(commandFiles)('%s has a Workflow section that only prints and stops', (filename) => {
      const content = readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
      expect(content).toMatch(/## Workflow/);
      expect(content).toMatch(/Print the following verbatim and stop/i);
    });
  });

  describe("the retired pool commands name their synthex: equivalent", () => {
    const POOL_COMMAND_EQUIVALENTS: Record<string, string> = {
      'configure-teams.md': '/synthex:configure-teams',
      'start-review-team.md': '/synthex:start-review-team',
      'stop-review-team.md': '/synthex:stop-review-team',
      'list-teams.md': '/synthex:list-teams',
    };

    it.each(Object.entries(POOL_COMMAND_EQUIVALENTS))(
      '%s names %s',
      (filename, equivalent) => {
        const content = readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
        expect(content).toContain(equivalent);
      },
    );
  });

  describe('the retired team-* commands point at their synthex replacement (mapping table)', () => {
    const TEAM_COMMAND_EQUIVALENTS: Record<string, string> = {
      'team-implement.md': '/synthex:next-priority',
      'team-review.md': '/synthex:review-code',
      'team-plan.md': '/synthex:write-implementation-plan',
      'team-refine.md': '/synthex:refine-requirements',
      'team-init.md': '/synthex:init',
    };

    it.each(Object.entries(TEAM_COMMAND_EQUIVALENTS))(
      '%s names %s',
      (filename, equivalent) => {
        const content = readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
        expect(content).toContain(equivalent);
      },
    );
  });

  describe('star, dismiss-upgrade-nudge, and api-spike point only at the migration guide (D23: no synthex-plus replacement)', () => {
    it.each(['star.md', 'dismiss-upgrade-nudge.md', 'api-spike.md'])(
      '%s has no synthex-plus command replacement',
      (filename) => {
        const content = readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
        expect(content).toMatch(/no .{0,20}replacement/i);
      },
    );
  });
});

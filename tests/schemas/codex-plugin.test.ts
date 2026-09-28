import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOSTS } from '../../plugins/synthex/scripts/lib/host-matrix.mjs';

const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');
const CLAUDE_MANIFEST = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const CODEX_MANIFEST = join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const CODEX_MARKETPLACE = join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');
const GENERATOR = join(PLUGIN_ROOT, 'scripts', 'generate-codex-skills.mjs');
const CODEX_HOOKS = join(PLUGIN_ROOT, 'hooks', 'codex-hooks.json');
const EXCLUDED_EVENTS = ['Stop', 'SessionStart', 'TaskCompleted', 'TeammateIdle'];

describe('Synthex Codex compatibility', () => {
  it('keeps the Codex manifest version aligned with the Claude manifest', () => {
    const claude = JSON.parse(readFileSync(CLAUDE_MANIFEST, 'utf8'));
    const codex = JSON.parse(readFileSync(CODEX_MANIFEST, 'utf8'));

    expect(codex.name).toBe('synthex');
    expect(codex.version).toBe(claude.version);
    expect(codex.skills).toBe('./portable-skills/');
  });

  it('publishes Synthex under the same name in the Codex marketplace', () => {
    const marketplace = JSON.parse(readFileSync(CODEX_MARKETPLACE, 'utf8'));
    const synthex = marketplace.plugins.find((plugin: any) => plugin.name === 'synthex');

    expect(marketplace.name).toBe('lumenai');
    expect(synthex.source).toEqual({
      source: 'local',
      path: './plugins/synthex',
    });
    expect(synthex.policy).toEqual({
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    });
  });

  it('has current generated wrappers for every Claude command and agent', () => {
    expect(() =>
      execFileSync(process.execPath, [GENERATOR, '--check'], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      })
    ).not.toThrow();
  });

  // Task 46 (FR-HM27, D25): the Codex manifest's hooks key points at the
  // generated hooks/codex-hooks.json, which never carries the Claude-only
  // native-looping events and always uses the host-matrix.mjs Codex
  // matcher, never Claude's own "Bash".
  describe("Codex hooks manifest (Task 46, FR-HM27, D25)", () => {
    it("the Codex manifest's hooks key points at hooks/codex-hooks.json", () => {
      const codex = JSON.parse(readFileSync(CODEX_MANIFEST, 'utf8'));
      expect(codex.hooks).toBe('./hooks/codex-hooks.json');
    });

    it('hooks/codex-hooks.json has no Stop/SessionStart/TaskCompleted/TeammateIdle entries', () => {
      const codexHooks = JSON.parse(readFileSync(CODEX_HOOKS, 'utf8'));
      for (const event of EXCLUDED_EVENTS) {
        expect(codexHooks.hooks).not.toHaveProperty(event);
      }
    });

    it('uses the host-matrix.mjs Codex matcher (its own Bash-equivalent tool name), not "Bash"', () => {
      const codexHooks = JSON.parse(readFileSync(CODEX_HOOKS, 'utf8'));
      const matcher = codexHooks.hooks.PreToolUse[0].matcher;

      expect(matcher).toBe(HOSTS.codex.toolMap.Bash);
      expect(matcher).not.toBe('Bash');
      expect(codexHooks.hooks.PreToolUse[0].hooks[0].command).toBe(
        '${CLAUDE_PLUGIN_ROOT}/scripts/commit-lint.sh',
      );
    });

    it('is covered by `generate-codex-skills.mjs --check` (drift fails the check)', () => {
      const original = readFileSync(CODEX_HOOKS, 'utf8');
      try {
        expect(() =>
          execFileSync(process.execPath, [GENERATOR, '--check'], { cwd: REPO_ROOT, stdio: 'pipe' }),
        ).not.toThrow();

        writeFileSync(CODEX_HOOKS, '{"hooks":{}}\n');
        expect(() =>
          execFileSync(process.execPath, [GENERATOR, '--check'], { cwd: REPO_ROOT, stdio: 'pipe' }),
        ).toThrow();
      } finally {
        writeFileSync(CODEX_HOOKS, original);
      }
    });
  });
});

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');
const CLAUDE_MANIFEST = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const GROK_MANIFEST = join(PLUGIN_ROOT, '.grok-plugin', 'plugin.json');
const GROK_MARKETPLACE = join(REPO_ROOT, '.grok-plugin', 'marketplace.json');
const GENERATOR = join(PLUGIN_ROOT, 'scripts', 'generate-codex-skills.mjs');

describe('Synthex Grok compatibility', () => {
  it('keeps the Grok manifest version aligned and exposes only the shared skills', () => {
    const claude = JSON.parse(readFileSync(CLAUDE_MANIFEST, 'utf8'));
    const grok = JSON.parse(readFileSync(GROK_MANIFEST, 'utf8'));

    expect(grok.name).toBe('synthex');
    expect(grok.version).toBe(claude.version);
    expect(grok.skills).toBe('./portable-skills/');
    // Empty arrays override Claude's command and agent lists so Grok does not
    // register those files twice beside the skill wrappers.
    expect(grok.commands).toEqual([]);
    expect(grok.agents).toEqual([]);
  });

  it('publishes Synthex, and not Synthex Plus, in the Grok marketplace', () => {
    const marketplace = JSON.parse(readFileSync(GROK_MARKETPLACE, 'utf8'));
    const synthex = marketplace.plugins.find((plugin: { name: string }) => plugin.name === 'synthex');

    expect(marketplace.name).toBe('lumenai');
    expect(marketplace.version).toBe(
      JSON.parse(readFileSync(CLAUDE_MANIFEST, 'utf8')).version,
    );
    expect(marketplace.plugins.map((plugin: { name: string }) => plugin.name)).toEqual([
      'synthex',
    ]);
    expect(synthex.source).toEqual({
      type: 'local',
      path: './plugins/synthex',
    });
    expect(synthex.version).toBe(marketplace.version);
  });

  it('points each shared skill at the canonical definition without copying it', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'portable-skills', 'review-code', 'SKILL.md'), 'utf8');
    const canonical = readFileSync(join(PLUGIN_ROOT, 'commands', 'review-code.md'), 'utf8');

    expect(skill).toContain('name: review-code');
    expect(skill).toContain('../../commands/review-code.md');
    expect(skill).toContain('Codex, Gemini CLI, OpenCode, Grok, and Hermes');
    expect(skill).not.toContain('closest available Codex tools');
    expect(skill.length).toBeLessThan(canonical.length / 2);
  });

  it('keeps the release workflow bumping the Grok manifests with the others', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'release.yml'), 'utf8');

    expect(workflow).toContain('plugins/synthex/.grok-plugin/plugin.json');
    expect(workflow).toContain('.grok-plugin/marketplace.json');
  });

  it('has current generated wrappers for every Claude command and agent', () => {
    expect(() =>
      execFileSync(process.execPath, [GENERATOR, '--check'], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});

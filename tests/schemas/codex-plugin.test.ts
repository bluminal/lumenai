import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');
const CLAUDE_MANIFEST = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const CODEX_MANIFEST = join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const CODEX_MARKETPLACE = join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');
const GENERATOR = join(PLUGIN_ROOT, 'scripts', 'generate-codex-skills.mjs');

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
});

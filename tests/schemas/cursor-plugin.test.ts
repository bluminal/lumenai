import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const claude = read(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
const claudeMarket = read(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
const cursor = read(join(PLUGIN_ROOT, '.cursor-plugin', 'plugin.json'));
const cursorMarket = read(join(REPO_ROOT, '.cursor-plugin', 'marketplace.json'));

// Keys allowed by https://cursor.com/schemas/cursor-plugin/*.json
// (additionalProperties: false).
const PLUGIN_KEYS = [
  'name', 'displayName', 'description', 'version', 'minClientVersions', 'author',
  'publisher', 'homepage', 'repository', 'license', 'logo', 'keywords', 'category',
  'tags', 'commands', 'agents', 'skills', 'rules', 'hooks', 'variables', 'mcpServers',
];
const MARKET_KEYS = ['name', 'owner', 'metadata', 'plugins'];
const ENTRY_KEYS = ['name', 'source', 'description', 'minClientVersions'];

describe('Synthex Cursor compatibility', () => {
  it('keeps the Cursor plugin version aligned with Claude', () => {
    expect(cursor.name).toBe('synthex');
    expect(cursor.version).toBe(claude.version);
    expect(Object.keys(cursor).every((k) => PLUGIN_KEYS.includes(k))).toBe(true);
  });

  it('loads shared skills and Cursor agent wrappers, not Claude commands or hooks', () => {
    expect(cursor.skills).toBe('./portable-skills/');
    expect(cursor.agents).toBe('./cursor-agents/');
    expect(cursor.commands).toEqual([]);
    // Claude-format hooks/hooks.json would otherwise be auto-discovered.
    expect(cursor.hooks).toEqual({ hooks: {} });
  });

  it('publishes only Synthex in a schema-valid Cursor marketplace', () => {
    expect(cursorMarket.name).toBe('lumenai');
    expect(cursorMarket.metadata.version).toBe(claudeMarket.version);
    expect(Object.keys(cursorMarket).every((k) => MARKET_KEYS.includes(k))).toBe(true);
    expect(cursorMarket.plugins).toHaveLength(1);
    const [entry] = cursorMarket.plugins;
    expect(entry.name).toBe('synthex');
    expect(entry.source).toBe('plugins/synthex');
    expect(Object.keys(entry).every((k) => ENTRY_KEYS.includes(k))).toBe(true);
  });

  it('keeps the release workflow bumping the Cursor manifests', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
    expect(workflow).toContain('plugins/synthex/.cursor-plugin/plugin.json');
    expect(workflow).toContain('.cursor-plugin/marketplace.json');
  });
});

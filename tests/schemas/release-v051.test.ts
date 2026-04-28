/**
 * Release v0.5.1 / synthex-plus v0.2.0 validation tests.
 *
 * Verifies:
 * - plugins/synthex/.claude-plugin/plugin.json is at 0.5.1
 * - .claude-plugin/marketplace.json top-level and synthex entry are at 0.5.1
 * - synthex-plus entry is at 0.2.0
 * - All synthex version strings match exactly
 * - CHANGELOG.md contains the [0.5.0] entry (base release; 0.5.1 is a patch)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

const PLUGIN_JSON_PATH = join(ROOT, 'plugins', 'synthex', '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON_PATH = join(ROOT, '.claude-plugin', 'marketplace.json');
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');

const EXPECTED_SYNTHEX_VERSION = '0.5.1';
const EXPECTED_SYNTHEX_PLUS_VERSION = '0.2.0';
const EXPECTED_MARKETPLACE_VERSION = '0.5.1';

// ── File parsing ─────────────────────────────────────────────────

describe('Release v0.5.1: synthex plugin.json version', () => {
  let parsed: any;

  beforeAll(() => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('plugin.json parses as valid JSON', () => {
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it(`version === "${EXPECTED_SYNTHEX_VERSION}"`, () => {
    expect(parsed.version).toBe(EXPECTED_SYNTHEX_VERSION);
  });
});

// ── marketplace.json ─────────────────────────────────────────────

describe('Release v0.5.1: marketplace.json versions', () => {
  let parsed: any;

  beforeAll(() => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('marketplace.json parses as valid JSON', () => {
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it(`top-level version === "${EXPECTED_MARKETPLACE_VERSION}"`, () => {
    expect(parsed.version).toBe(EXPECTED_MARKETPLACE_VERSION);
  });

  it(`synthex entry version === "${EXPECTED_SYNTHEX_VERSION}"`, () => {
    const synthex = parsed.plugins.find((p: any) => p.name === 'synthex');
    expect(synthex).toBeTruthy();
    expect(synthex.version).toBe(EXPECTED_SYNTHEX_VERSION);
  });

  it(`synthex-plus entry version === "${EXPECTED_SYNTHEX_PLUS_VERSION}" (regression guard)`, () => {
    const synthexPlus = parsed.plugins.find((p: any) => p.name === 'synthex-plus');
    expect(synthexPlus).toBeTruthy();
    expect(synthexPlus.version).toBe(EXPECTED_SYNTHEX_PLUS_VERSION);
  });
});

// ── Cross-version sync ───────────────────────────────────────────

describe('Release v0.5.1: cross-version sync', () => {
  it('synthex plugin.json, marketplace top-level, and marketplace synthex entry all match', () => {
    const pluginParsed = JSON.parse(readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    const marketplaceParsed = JSON.parse(readFileSync(MARKETPLACE_JSON_PATH, 'utf8'));
    const synthexEntry = marketplaceParsed.plugins.find((p: any) => p.name === 'synthex');

    expect(pluginParsed.version).toBe(EXPECTED_SYNTHEX_VERSION);
    expect(marketplaceParsed.version).toBe(EXPECTED_MARKETPLACE_VERSION);
    expect(synthexEntry.version).toBe(EXPECTED_SYNTHEX_VERSION);

    // All three equal each other
    expect(pluginParsed.version).toBe(marketplaceParsed.version);
    expect(pluginParsed.version).toBe(synthexEntry.version);
  });

  it(`synthex-plus entry is at "${EXPECTED_SYNTHEX_PLUS_VERSION}" and not regressed to prior version`, () => {
    const marketplaceParsed = JSON.parse(readFileSync(MARKETPLACE_JSON_PATH, 'utf8'));
    const synthexPlus = marketplaceParsed.plugins.find((p: any) => p.name === 'synthex-plus');
    expect(synthexPlus).toBeTruthy();
    expect(synthexPlus.version).toBe(EXPECTED_SYNTHEX_PLUS_VERSION);
    // Must not be the old 0.1.2 version from v0.5.0 release
    expect(synthexPlus.version).not.toBe('0.1.2');
  });
});

// ── CHANGELOG.md ─────────────────────────────────────────────────

describe('Release v0.5.1: CHANGELOG.md contains required base-release content', () => {
  let changelog: string;

  beforeAll(() => {
    changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  });

  it('CHANGELOG.md contains ## [0.5.0] heading (base for 0.5.x line)', () => {
    expect(changelog).toContain('## [0.5.0]');
  });

  it('CHANGELOG.md [0.5.0] appears before [0.4.0] (correct ordering)', () => {
    const idx050 = changelog.indexOf('## [0.5.0]');
    const idx040 = changelog.indexOf('## [0.4.0]');
    expect(idx050).toBeGreaterThanOrEqual(0);
    expect(idx040).toBeGreaterThanOrEqual(0);
    expect(idx050).toBeLessThan(idx040);
  });
});

/**
 * Release v0.5.0 validation tests (Tasks 63, 64, 65).
 *
 * Verifies:
 * - plugins/synthex/.claude-plugin/plugin.json is at 0.5.0
 * - .claude-plugin/marketplace.json top-level and synthex entry are at 0.5.0
 * - synthex-plus entry is unchanged at 0.1.2 (regression guard)
 * - All three version strings match exactly
 * - CHANGELOG.md contains the [0.5.0] entry with all required content
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

const PLUGIN_JSON_PATH = join(ROOT, 'plugins', 'synthex', '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON_PATH = join(ROOT, '.claude-plugin', 'marketplace.json');
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');

const EXPECTED_VERSION = '0.5.0';
const EXPECTED_SYNTHEX_PLUS_VERSION = '0.1.2';

// ── File parsing ─────────────────────────────────────────────────

describe('Task 63: synthex plugin.json version', () => {
  let parsed: any;

  beforeAll(() => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('plugin.json parses as valid JSON', () => {
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it(`version === "${EXPECTED_VERSION}"`, () => {
    expect(parsed.version).toBe(EXPECTED_VERSION);
  });
});

// ── marketplace.json ─────────────────────────────────────────────

describe('Task 64: marketplace.json versions', () => {
  let parsed: any;

  beforeAll(() => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('marketplace.json parses as valid JSON', () => {
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it(`top-level version === "${EXPECTED_VERSION}"`, () => {
    expect(parsed.version).toBe(EXPECTED_VERSION);
  });

  it(`synthex entry version === "${EXPECTED_VERSION}"`, () => {
    const synthex = parsed.plugins.find((p: any) => p.name === 'synthex');
    expect(synthex).toBeTruthy();
    expect(synthex.version).toBe(EXPECTED_VERSION);
  });

  it(`synthex-plus entry version UNCHANGED at "${EXPECTED_SYNTHEX_PLUS_VERSION}" (regression guard)`, () => {
    const synthexPlus = parsed.plugins.find((p: any) => p.name === 'synthex-plus');
    expect(synthexPlus).toBeTruthy();
    expect(synthexPlus.version).toBe(EXPECTED_SYNTHEX_PLUS_VERSION);
  });
});

// ── Cross-version sync ───────────────────────────────────────────

describe('Tasks 63 + 64: cross-version sync', () => {
  it('all three versions match exactly', () => {
    const pluginRaw = readFileSync(PLUGIN_JSON_PATH, 'utf8');
    const pluginParsed = JSON.parse(pluginRaw);

    const marketplaceRaw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8');
    const marketplaceParsed = JSON.parse(marketplaceRaw);

    const synthexEntry = marketplaceParsed.plugins.find((p: any) => p.name === 'synthex');

    expect(pluginParsed.version).toBe(EXPECTED_VERSION);
    expect(marketplaceParsed.version).toBe(EXPECTED_VERSION);
    expect(synthexEntry.version).toBe(EXPECTED_VERSION);

    // All three equal each other
    expect(pluginParsed.version).toBe(marketplaceParsed.version);
    expect(pluginParsed.version).toBe(synthexEntry.version);
  });
});

// ── CHANGELOG.md ─────────────────────────────────────────────────

describe('Task 65: CHANGELOG.md entry', () => {
  let changelog: string;

  beforeAll(() => {
    changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  });

  it('CHANGELOG.md exists', () => {
    expect(existsSync(CHANGELOG_PATH)).toBe(true);
  });

  it('CHANGELOG.md contains ## [0.5.0] heading near the top', () => {
    expect(changelog).toContain('## [0.5.0]');
    // Verify it appears before the 0.4.0 entry (i.e., is near the top)
    const idx050 = changelog.indexOf('## [0.5.0]');
    const idx040 = changelog.indexOf('## [0.4.0]');
    expect(idx050).toBeGreaterThanOrEqual(0);
    expect(idx040).toBeGreaterThanOrEqual(0);
    expect(idx050).toBeLessThan(idx040);
  });

  it('CHANGELOG.md mentions multi_model_review config addition', () => {
    expect(changelog).toContain('multi_model_review');
  });

  it('CHANGELOG.md mentions orchestrator + adapter agents', () => {
    expect(changelog).toContain('multi-model-review-orchestrator');
    expect(changelog).toContain('codex-review-prompter');
    expect(changelog).toContain('gemini-review-prompter');
    expect(changelog).toContain('ollama-review-prompter');
  });

  it('CHANGELOG.md mentions init updates', () => {
    // Must reference the init command in context of multi-model setup
    expect(changelog).toMatch(/init.*[Mm]ulti|[Mm]ulti.*init/s);
  });

  it('CHANGELOG.md mentions audit artifacts', () => {
    expect(changelog).toContain('audit');
    // Specifically audit artifacts / per-invocation files
    expect(changelog).toMatch(/[Aa]udit.{0,50}artifact|artifact.{0,50}[Aa]udit/s);
  });

  it('CHANGELOG.md mentions complexity gate', () => {
    expect(changelog).toContain('complexity gate');
  });

  it('CHANGELOG.md mentions docs/reviews/ as default audit output directory', () => {
    expect(changelog).toContain('docs/reviews/');
  });

  it('CHANGELOG.md mentions .gitignore recommendation for docs/reviews/', () => {
    expect(changelog).toContain('.gitignore');
    // The .gitignore mention and docs/reviews/ must both be present in the 0.5.0 section
    const idx050 = changelog.indexOf('## [0.5.0]');
    const idx040 = changelog.indexOf('## [0.4.0]');
    const section050 = changelog.slice(idx050, idx040);
    expect(section050).toContain('.gitignore');
    expect(section050).toContain('docs/reviews/');
  });

  it('CHANGELOG.md has a [0.5.0]: link reference at the bottom', () => {
    expect(changelog).toContain('[0.5.0]:');
    // The link reference should appear after all the entries (near the end of file)
    const lastLinkRefBlock = changelog.lastIndexOf('[0.5.0]:');
    expect(lastLinkRefBlock).toBeGreaterThan(changelog.indexOf('## [0.4.0]'));
  });
});

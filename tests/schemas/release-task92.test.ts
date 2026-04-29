/**
 * Task 92 (Phase 11.2): release version regression guards.
 *
 * [T] criteria from the plan:
 *   1. plugins/synthex/.claude-plugin/plugin.json version is "0.5.2"
 *   2. plugins/synthex-plus/.claude-plugin/plugin.json version is "0.2.1"
 *   3. .claude-plugin/marketplace.json top-level + both plugin entries
 *      match the per-plugin versions above
 *   4. CHANGELOG.md has a new top-level entry titled with both version
 *      numbers covering Phase 11.2 hardening
 *   5. All JSON files parse as valid JSON (regression)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const SYNTHEX_PLUGIN_JSON = join(REPO_ROOT, 'plugins', 'synthex', '.claude-plugin', 'plugin.json');
const SYNTHEX_PLUS_PLUGIN_JSON = join(REPO_ROOT, 'plugins', 'synthex-plus', '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON = join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const CHANGELOG = join(REPO_ROOT, 'CHANGELOG.md');

const SYNTHEX_VERSION = '0.5.2';
const SYNTHEX_PLUS_VERSION = '0.2.1';
const MARKETPLACE_VERSION = '0.5.2';

describe('Task 92 [T] (1, 5): synthex plugin.json version', () => {
  let parsed: any;

  beforeAll(() => {
    parsed = JSON.parse(readFileSync(SYNTHEX_PLUGIN_JSON, 'utf8'));
  });

  it('parses as valid JSON (regression)', () => {
    expect(parsed).toBeTruthy();
  });

  it(`version is "${SYNTHEX_VERSION}"`, () => {
    expect(parsed.version).toBe(SYNTHEX_VERSION);
  });

  it('name is "synthex" (sanity)', () => {
    expect(parsed.name).toBe('synthex');
  });
});

describe('Task 92 [T] (2, 5): synthex-plus plugin.json version', () => {
  let parsed: any;

  beforeAll(() => {
    parsed = JSON.parse(readFileSync(SYNTHEX_PLUS_PLUGIN_JSON, 'utf8'));
  });

  it('parses as valid JSON (regression)', () => {
    expect(parsed).toBeTruthy();
  });

  it(`version is "${SYNTHEX_PLUS_VERSION}"`, () => {
    expect(parsed.version).toBe(SYNTHEX_PLUS_VERSION);
  });

  it('name is "synthex-plus" (sanity)', () => {
    expect(parsed.name).toBe('synthex-plus');
  });
});

describe('Task 92 [T] (3, 5): marketplace.json top-level + both plugin entries match', () => {
  let parsed: any;

  beforeAll(() => {
    parsed = JSON.parse(readFileSync(MARKETPLACE_JSON, 'utf8'));
  });

  it('parses as valid JSON (regression)', () => {
    expect(parsed).toBeTruthy();
  });

  it(`top-level version is "${MARKETPLACE_VERSION}"`, () => {
    expect(parsed.version).toBe(MARKETPLACE_VERSION);
  });

  it(`synthex plugin entry version is "${SYNTHEX_VERSION}"`, () => {
    const synthex = parsed.plugins.find((p: any) => p.name === 'synthex');
    expect(synthex).toBeDefined();
    expect(synthex.version).toBe(SYNTHEX_VERSION);
  });

  it(`synthex-plus plugin entry version is "${SYNTHEX_PLUS_VERSION}"`, () => {
    const synthexPlus = parsed.plugins.find((p: any) => p.name === 'synthex-plus');
    expect(synthexPlus).toBeDefined();
    expect(synthexPlus.version).toBe(SYNTHEX_PLUS_VERSION);
  });

  it('synthex marketplace entry version matches synthex plugin.json (cross-version sync)', () => {
    const synthex = parsed.plugins.find((p: any) => p.name === 'synthex');
    const synthexPluginJson = JSON.parse(readFileSync(SYNTHEX_PLUGIN_JSON, 'utf8'));
    expect(synthex.version).toBe(synthexPluginJson.version);
  });

  it('synthex-plus marketplace entry version matches synthex-plus plugin.json (cross-version sync)', () => {
    const synthexPlus = parsed.plugins.find((p: any) => p.name === 'synthex-plus');
    const synthexPlusPluginJson = JSON.parse(readFileSync(SYNTHEX_PLUS_PLUGIN_JSON, 'utf8'));
    expect(synthexPlus.version).toBe(synthexPlusPluginJson.version);
  });
});

describe('Task 92 [T] (4): CHANGELOG.md entry covers Phase 11.2 hardening', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(CHANGELOG, 'utf8');
  });

  it(`has a top-level entry titled with both versions: synthex ${SYNTHEX_VERSION} / synthex-plus ${SYNTHEX_PLUS_VERSION}`, () => {
    expect(content).toContain(
      `## [synthex ${SYNTHEX_VERSION} / synthex-plus ${SYNTHEX_PLUS_VERSION}]`,
    );
  });

  it('entry references Phase 11.2 hardening provenance', () => {
    expect(content).toMatch(/Phase 11\.2.*ADR-003 hardening|ADR-003 hardening.*Phase 11\.2/i);
  });

  it('entry mentions the team-review source (2026-04-29 multi-model run)', () => {
    expect(content).toMatch(/team-review.*2026-04-29|2026-04-29.*team-review/i);
  });

  it('entry mentions all seven Phase 11.2 task surfaces', () => {
    // Tasks 85 (probe-caching/latency/id-correlation), 86 (Gemini probe), 87 (sandbox profile),
    // 88 (CLI-name validation), 89 (non-TTY guard), 90 (Known Limitations), 91 (loadDefaults helper)
    const requiredKeywords = [
      'probe-caching',          // Task 85
      'requestApproval',         // Task 85
      'sandbox_violation',       // Task 86
      'Safe-name assertion',     // Task 88
      'non-TTY guard',           // Task 89
      'Known Limitations',       // Task 90
      'loadDefaultsYaml',        // Task 91
      'sandbox.sb',              // Task 87
    ];
    const lowered = content.toLowerCase();
    const missing = requiredKeywords.filter(
      (kw) => !lowered.includes(kw.toLowerCase()),
    );
    expect(
      missing,
      `CHANGELOG missing references to Phase 11.2 task surfaces: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('entry is positioned ABOVE the prior synthex-plus 0.2.0 entry (newest-first ordering)', () => {
    const newIdx = content.indexOf(
      `## [synthex ${SYNTHEX_VERSION} / synthex-plus ${SYNTHEX_PLUS_VERSION}]`,
    );
    const priorIdx = content.indexOf('## [synthex-plus 0.2.0]');
    expect(newIdx).toBeGreaterThan(-1);
    expect(priorIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(priorIdx);
  });
});

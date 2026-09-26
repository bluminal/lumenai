/**
 * Task 91 (Phase 11.2): tests for the loadDefaultsYaml() module-level singleton helper.
 *
 * [T] criteria from the plan:
 *   1. Helper file exists and exports a `loadDefaultsYaml()` function
 *   2. (consumed by other test files) all three referenced test files use the helper
 *   3. (consumed by other test files) all three test files still pass after the refactor
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  loadDefaultsYaml,
  loadDefaultsYamlText,
  getDefaultsYamlPath,
  _resetDefaultsYamlCache,
} from '../helpers/load-defaults';

describe('Task 91 [T] (1): loadDefaultsYaml helper module exists and exports the expected API', () => {
  it('the helper file exists at tests/helpers/load-defaults.ts', () => {
    const path = join(__dirname, '..', 'helpers', 'load-defaults.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('exports a loadDefaultsYaml() function', () => {
    expect(typeof loadDefaultsYaml).toBe('function');
  });

  it('exports a loadDefaultsYamlText() function for raw-string assertions', () => {
    expect(typeof loadDefaultsYamlText).toBe('function');
  });

  it('exports a getDefaultsYamlPath() function', () => {
    expect(typeof getDefaultsYamlPath).toBe('function');
  });

  it('exports an _resetDefaultsYamlCache() function for tests that intentionally mutate', () => {
    expect(typeof _resetDefaultsYamlCache).toBe('function');
  });
});

describe('Task 91: helper behavior', () => {
  it('loadDefaultsYaml() returns a parsed object with the multi_model_review section', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg).toBeTruthy();
    expect(typeof cfg).toBe('object');
    expect(cfg.multi_model_review).toBeDefined();
  });

  it('loadDefaultsYamlText() returns the raw YAML text', () => {
    const text = loadDefaultsYamlText();
    expect(typeof text).toBe('string');
    expect(text).toContain('multi_model_review:');
  });

  it('getDefaultsYamlPath() points to plugins/synthex/config/defaults.yaml', () => {
    const path = getDefaultsYamlPath();
    expect(path).toMatch(/plugins[\/\\]synthex[\/\\]config[\/\\]defaults\.yaml$/);
    expect(existsSync(path)).toBe(true);
  });

  it('caches results across calls (singleton behavior)', async () => {
    const a = await loadDefaultsYaml();
    const b = await loadDefaultsYaml();
    // Same object reference — proves the result is memoized
    expect(b).toBe(a);
  });

  it('caches text across calls', () => {
    const a = loadDefaultsYamlText();
    const b = loadDefaultsYamlText();
    expect(b).toBe(a);
  });

  it('_resetDefaultsYamlCache() clears the cache', async () => {
    const a = await loadDefaultsYaml();
    _resetDefaultsYamlCache();
    const c = await loadDefaultsYaml();
    // After reset, a fresh parse returns a different object reference
    expect(c).not.toBe(a);
    // But content equivalence still holds
    expect(c).toEqual(a);
  });
});

describe('Task 24 (FR-HM44): multi_model_review.context.* and per_reviewer_timeout_seconds via the helper', () => {
  it('loadDefaultsYaml() exposes multi_model_review.per_reviewer_timeout_seconds: 180', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.multi_model_review.per_reviewer_timeout_seconds).toBe(180);
  });

  it('loadDefaultsYaml() exposes multi_model_review.context with max_bundle_bytes and max_file_bytes', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.multi_model_review.context.max_bundle_bytes).toBe(204800);
    expect(cfg.multi_model_review.context.max_file_bytes).toBe(65536);
  });

  it('loadDefaultsYaml() exposes multi_model_review.context.convention_paths and spec_paths', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.multi_model_review.context.convention_paths).toEqual([
      'CLAUDE.md',
      '.eslintrc',
      '.prettierrc',
    ]);
    expect(cfg.multi_model_review.context.spec_paths).toEqual(['docs/specs']);
  });

  it('loadDefaultsYamlText() contains the new keys with comments (raw-text check)', () => {
    const text = loadDefaultsYamlText();
    for (const key of [
      'per_reviewer_timeout_seconds:',
      'context:',
      'max_bundle_bytes:',
      'max_file_bytes:',
      'convention_paths:',
      'spec_paths:',
    ]) {
      const lines = text.split('\n');
      const idx = lines.findIndex((l) => l.includes(key));
      expect(idx, `Expected to find ${key} in defaults.yaml`).toBeGreaterThan(0);
      const window = lines.slice(Math.max(0, idx - 5), idx + 1).join('\n');
      expect(window, `Expected a comment above ${key}`).toMatch(/#/);
    }
  });
});

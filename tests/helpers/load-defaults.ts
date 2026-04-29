/**
 * Module-level singleton for loading and parsing the canonical
 * `plugins/synthex/config/defaults.yaml` once per process.
 *
 * Multiple Layer 1 schema test files need to read and parse the
 * same defaults.yaml; previously each did so in its own beforeAll
 * block (Tasks 79, 82) or describe-level beforeAll (Task 84). This
 * helper centralizes the read + parse + dynamic yaml/js-yaml fallback
 * to (a) eliminate duplicated import-with-fallback boilerplate and
 * (b) avoid re-parsing the same ~18KB YAML file 3+ times per test
 * run (Task 91 / Phase 11.2 / Performance LOW #3).
 *
 * Usage:
 *
 *   import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';
 *
 *   // structured config object (parsed)
 *   const cfg = await loadDefaultsYaml();
 *   expect(cfg.multi_model_review.external_permission_mode.codex).toBe('parent-mediated');
 *
 *   // raw file text (for substring/regex assertions on comments)
 *   const text = loadDefaultsYamlText();
 *   expect(text).toContain('ADR-003');
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DEFAULTS_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'config',
  'defaults.yaml',
);

let cachedText: string | null = null;
let cachedParsed: any = null;

/**
 * Returns the raw text of `plugins/synthex/config/defaults.yaml`.
 * Cached after the first call.
 */
export function loadDefaultsYamlText(): string {
  if (cachedText === null) {
    cachedText = readFileSync(DEFAULTS_PATH, 'utf8');
  }
  return cachedText;
}

/**
 * Returns the parsed `defaults.yaml` as a structured object. Cached
 * after the first call. Tries `yaml` first; falls back to `js-yaml`
 * if `yaml` is unavailable. The fallback mirrors the pattern that
 * existed in `mmt-defaults-yaml-task79.test.ts`,
 * `mmt-defaults-yaml-task82.test.ts`, and
 * `permission-model-fixtures.test.ts` before the Task 91 refactor.
 */
export async function loadDefaultsYaml(): Promise<any> {
  if (cachedParsed !== null) return cachedParsed;
  const text = loadDefaultsYamlText();
  try {
    const yaml = await import('yaml');
    cachedParsed = (yaml as any).parse(text);
  } catch {
    const yaml = await import('js-yaml');
    cachedParsed = (yaml as any).load(text);
  }
  return cachedParsed;
}

/**
 * Returns the absolute path of the canonical defaults.yaml. Useful
 * for tests that want to display the path in a failure message.
 */
export function getDefaultsYamlPath(): string {
  return DEFAULTS_PATH;
}

/**
 * Resets the in-memory cache. Tests should not need this in normal
 * operation, but it is exposed for tests that intentionally mutate
 * defaults.yaml at runtime (none currently exist).
 */
export function _resetDefaultsYamlCache(): void {
  cachedText = null;
  cachedParsed = null;
}

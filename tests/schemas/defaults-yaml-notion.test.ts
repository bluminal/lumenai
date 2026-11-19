/**
 * Phase 1: `documents.backend*` and `notion` blocks in defaults.yaml.
 *
 * Follows the defaults-yaml-mmr.test.ts pattern for introducing a new config
 * block, including the documentation-as-code assertion that every top-level
 * subkey carries an explanatory inline comment.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

/** Asserts an explanatory comment appears within 8 lines above `key`. */
function expectCommentAbove(content: string, key: string) {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.trimStart().startsWith(key));
  expect(idx, `key not found: ${key}`).toBeGreaterThan(0);
  const window = lines.slice(Math.max(0, idx - 8), idx).join('\n');
  expect(window, `no inline comment documents ${key}`).toMatch(/#/);
}

describe('Phase 1: Notion backend config in defaults.yaml', () => {
  let content: string;
  let cfg: any;

  beforeAll(async () => {
    content = loadDefaultsYamlText();
    cfg = await loadDefaultsYaml();
  });

  describe('documents.backend', () => {
    it('defaults to filesystem', () => {
      expect(cfg.documents.backend).toBe('filesystem');
    });

    it('defines backend_overrides as an empty map', () => {
      expect(cfg.documents.backend_overrides).toEqual({});
    });

    it('preserves the pre-existing document path keys', () => {
      // The backend switch is additive: the filesystem backend still resolves
      // these exact keys, so removing one would be a breaking change.
      for (const key of [
        'requirements',
        'implementation_plan',
        'specs',
        'decisions',
        'rfcs',
        'runbooks',
        'retros',
      ]) {
        expect(cfg.documents[key], `documents.${key} missing`).toBeTruthy();
      }
    });

    it('documents the resolution order', () => {
      expect(content).toMatch(
        /backend_overrides\.<doc_type>\s*>\s*backend\s*>\s*filesystem/,
      );
    });

    it.each(['backend:', 'backend_overrides:'])(
      'has an inline comment above %s',
      (key) => {
        expectCommentAbove(content, key);
      },
    );
  });

  describe('notion block', () => {
    it('is defined', () => {
      expect(cfg.notion).toBeDefined();
    });

    it('is off by default (FR-NB2 regression contract)', () => {
      // The single most important assertion in this file: if this flips to
      // true, every existing user's documents silently change backend on
      // upgrade.
      expect(cfg.notion.enabled).toBe(false);
    });

    it('defaults to fail-soft rather than abort', () => {
      expect(cfg.notion.strict_mode).toBe(false);
    });

    it.each([
      'enabled',
      'strict_mode',
      'docs_root',
      'tasks_database',
      'targets',
      'epic',
      'property_map',
      'status_values',
    ])('defines key %s', (key) => {
      expect(cfg.notion).toHaveProperty(key);
    });

    it('ships no targets configured', () => {
      expect(cfg.notion.docs_root).toBeNull();
      expect(cfg.notion.tasks_database).toBeNull();
      expect(cfg.notion.targets).toEqual({});
    });

    it('documents targets as the deterministic, rename-surviving path', () => {
      expect(content).toMatch(/deterministic resolution path/);
      expect(content).toMatch(/survives a page\s*#?\s*being renamed/);
    });

    it('ships epic unconfigured with both subkeys present', () => {
      expect(cfg.notion.epic).toEqual({ property: null, value: null });
    });

    it.each([
      'enabled:',
      'strict_mode:',
      'docs_root:',
      'tasks_database:',
      'targets:',
      'epic:',
      'property_map:',
      'status_values:',
    ])('has an inline comment above %s', (key) => {
      expectCommentAbove(content, key);
    });
  });

  describe('Maps, not arrays', () => {
    // config-merger.ts replaces arrays wholesale on merge, so a list here
    // would make a project override silently drop every other entry.
    it.each([
      ['documents.backend_overrides', () => cfg.documents.backend_overrides],
      ['notion.property_map', () => cfg.notion.property_map],
      ['notion.status_values', () => cfg.notion.status_values],
      ['notion.targets', () => cfg.notion.targets],
    ])('%s is a map', (_name, get) => {
      const value = get();
      expect(Array.isArray(value)).toBe(false);
      expect(typeof value).toBe('object');
      expect(value).not.toBeNull();
    });

    it('documents why these must be maps', () => {
      expect(content).toMatch(/Must be a map, never a list/);
      expect(content).toMatch(/replaces arrays wholesale/);
    });
  });

  describe('Bolt-on guarantees are documented', () => {
    it('states that the target workspace already exists', () => {
      expect(content).toMatch(/ALREADY EXISTS/);
    });

    it('documents the epic scoping guarantee', () => {
      expect(content).toMatch(/EVERY query Synthex\s*#?\s*issues filters on/);
      expect(content).toMatch(/other teams' tickets/);
    });

    it('documents that Synthex refuses to run unscoped', () => {
      expect(content).toMatch(/refuses to run\s*#?\s*unscoped/);
      expect(content).toMatch(/never an acceptable degradation/);
    });

    it('documents that schema is never altered without consent', () => {
      expect(content).toMatch(
        /NEVER alters an existing database's schema without explicit consent/,
      );
    });

    it('documents that required mappings fail rather than guess', () => {
      expect(content).toMatch(/schema_mismatch/);
      expect(content).toMatch(/rather than guess/);
    });

    it('documents that Synthex holds no Notion API key', () => {
      expect(content).toMatch(/never holds a Notion API key/);
    });

    it('points users at the wizard instead of hand-editing', () => {
      expect(content).toMatch(/\/synthex:configure-notion/);
    });
  });

  describe('Adapters only reference config keys that exist', () => {
    // A dangling `config.<key>` reference shipped once already: the adapters
    // pointed at `config.targets` after it was dropped from this file during a
    // simplification pass, so an implementer would have gone looking for
    // configuration that did not exist. This catches that class of drift in
    // either direction.
    const ADAPTERS = [
      'agents/notion-document-store.md',
      'agents/notion-task-store.md',
    ] as const;

    const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');

    // The `config` object an adapter receives is project config PLUS a small,
    // explicit set of values the CALLER resolves at runtime and passes in.
    // Those legitimately have no entry in defaults.yaml. Keeping the set here
    // and small is the point: anything else must be real config.
    const CALLER_SUPPLIED = new Set(['epic_page']);

    it.each(ADAPTERS)('%s references only real notion config keys', (rel) => {
      const text = readFileSync(join(PLUGIN, rel), 'utf8');
      const referenced = new Set(
        [...text.matchAll(/\bconfig\.([a-z_]+)/g)].map((m) => m[1]),
      );
      expect(referenced.size).toBeGreaterThan(0);
      for (const key of referenced) {
        if (CALLER_SUPPLIED.has(key)) continue;
        expect(
          Object.prototype.hasOwnProperty.call(cfg.notion, key),
          `${rel} references config.${key}, which is neither a key under notion: in defaults.yaml nor a documented caller-supplied field`,
        ).toBe(true);
      }
    });

    it('every caller-supplied field is documented as such in its adapter', () => {
      // A caller-supplied field that is not labelled as one is
      // indistinguishable from a dangling config reference.
      const combined = ADAPTERS.map((rel) =>
        readFileSync(join(PLUGIN, rel), 'utf8'),
      ).join('\n');
      for (const key of CALLER_SUPPLIED) {
        expect(combined).toMatch(
          new RegExp(`${key}[\\s\\S]{0,240}?[Ss]upplied by the caller`),
        );
      }
    });
  });

  describe('Canonical vocabulary is documented', () => {
    it('lists the four canonical task states', () => {
      expect(content).toMatch(/pending, in_progress, done, blocked/);
    });

    it('names the required property mappings', () => {
      expect(content).toMatch(/Required: title, status, epic/);
    });
  });
});

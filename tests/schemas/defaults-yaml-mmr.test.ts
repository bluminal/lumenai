import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULTS_PATH = join(__dirname, '..', '..', 'plugins', 'synthex', 'config', 'defaults.yaml');

describe('Task 2: multi_model_review block in defaults.yaml', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(DEFAULTS_PATH, 'utf8');
  });

  it('defaults.yaml file exists', () => {
    expect(existsSync(DEFAULTS_PATH)).toBe(true);
  });

  it('parses as valid YAML', async () => {
    let parsed: any;
    try {
      const yaml = await import('yaml');
      parsed = yaml.parse(content);
    } catch {
      const yaml = await import('js-yaml');
      parsed = (yaml as any).load(content);
    }
    expect(parsed).toBeTruthy();
    expect(parsed.multi_model_review).toBeDefined();
  });

  describe('Top-level keys present', () => {
    it.each([
      'multi_model_review:',
      'enabled: false',
      'strict_mode: false',
      'include_native_reviewers:',
      'min_family_diversity:',
      'min_proposers_to_proceed:',
      'per_reviewer_timeout_seconds:',
      'context:',
      'reviewers:',
      'aggregator:',
      'per_command:',
      'consolidation:',
      'audit:',
    ])('contains key %s', (key) => {
      expect(content).toContain(key);
    });
  });

  describe('Inline comments per top-level key in multi_model_review:', () => {
    it('has comments before each top-level multi_model_review subkey', () => {
      const subkeys = [
        'enabled:',
        'strict_mode:',
        'include_native_reviewers:',
        'min_family_diversity:',
        'min_proposers_to_proceed:',
        'per_reviewer_timeout_seconds:',
        'context:',
        'reviewers:',
        'aggregator:',
        'per_command:',
        'consolidation:',
        'audit:',
      ];
      for (const k of subkeys) {
        const lines = content.split('\n');
        const idx = lines.findIndex((l) => l.includes(k));
        expect(idx).toBeGreaterThan(0);
        const window = lines.slice(Math.max(0, idx - 5), idx + 1).join('\n');
        expect(window).toMatch(/#/);
      }
    });
  });

  describe('Task 24 (FR-HM44): multi_model_review.context.* and per_reviewer_timeout_seconds', () => {
    let parsed: any;
    beforeAll(async () => {
      try {
        const yaml = await import('yaml');
        parsed = yaml.parse(content);
      } catch {
        const yaml = await import('js-yaml');
        parsed = (yaml as any).load(content);
      }
    });

    it('multi_model_review.per_reviewer_timeout_seconds defaults to 180', () => {
      expect(parsed.multi_model_review.per_reviewer_timeout_seconds).toBe(180);
    });

    it('multi_model_review.context block is defined', () => {
      expect(parsed.multi_model_review.context).toBeDefined();
      expect(typeof parsed.multi_model_review.context).toBe('object');
    });

    it('multi_model_review.context.max_bundle_bytes defaults to 204800 (200 KB, FR-MR28)', () => {
      expect(parsed.multi_model_review.context.max_bundle_bytes).toBe(204800);
    });

    it('multi_model_review.context.max_file_bytes defaults to 65536 (64 KB, FR-MR28)', () => {
      expect(parsed.multi_model_review.context.max_file_bytes).toBe(65536);
    });

    it('multi_model_review.context.convention_paths mirrors code_review.convention_sources', () => {
      expect(parsed.multi_model_review.context.convention_paths).toEqual(
        parsed.code_review.convention_sources
      );
      expect(parsed.multi_model_review.context.convention_paths).toEqual([
        'CLAUDE.md',
        '.eslintrc',
        '.prettierrc',
      ]);
    });

    it('multi_model_review.context.spec_paths mirrors code_review.spec_paths', () => {
      expect(parsed.multi_model_review.context.spec_paths).toEqual(parsed.code_review.spec_paths);
      expect(parsed.multi_model_review.context.spec_paths).toEqual(['docs/specs']);
    });

    it('each new key has a preceding comment', () => {
      const keys = [
        'max_bundle_bytes:',
        'max_file_bytes:',
        'convention_paths:',
        'spec_paths:',
      ];
      const lines = content.split('\n');
      for (const k of keys) {
        const idx = lines.findIndex((l) => l.includes(k));
        expect(idx, `Expected to find line containing ${k}`).toBeGreaterThan(0);
        const window = lines.slice(Math.max(0, idx - 5), idx + 1).join('\n');
        expect(window, `Expected a comment above ${k}`).toMatch(/#/);
      }
    });
  });

  describe('D18 stage4 cap', () => {
    it('contains max_calls_per_consolidation: 25', () => {
      expect(content).toMatch(/max_calls_per_consolidation:\s*25/);
    });
  });

  describe('always_escalate_paths rationales', () => {
    const paths = ['auth', 'payments', 'billing', 'migrations', 'security', 'secrets', 'crypto'];
    it.each(paths)('contains always_escalate path for %s with rationale comment', (p) => {
      const lines = content.split('\n');
      const line = lines.find((l) => l.includes(`/${p}/`));
      expect(line, `Expected to find always_escalate_paths line for ${p}`).toBeDefined();
      expect(line).toMatch(/#/);
    });
  });
});

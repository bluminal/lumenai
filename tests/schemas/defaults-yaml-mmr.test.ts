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

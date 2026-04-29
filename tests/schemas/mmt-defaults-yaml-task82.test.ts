import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const DEFAULTS_PATH = join(__dirname, '..', '..', 'plugins', 'synthex', 'config', 'defaults.yaml');

describe('Task 82 (MMT): per-CLI external_permission_mode defaults', () => {
  let content: string;
  let parsed: any;
  let block: any;

  beforeAll(async () => {
    content = readFileSync(DEFAULTS_PATH, 'utf8');
    try {
      const yaml = await import('yaml');
      parsed = yaml.parse(content);
    } catch {
      const yaml = await import('js-yaml');
      parsed = (yaml as any).load(content);
    }
    block = parsed?.multi_model_review?.external_permission_mode ?? {};
  });

  it('defaults.yaml parses as valid YAML (regression)', () => {
    expect(parsed).toBeTruthy();
    expect(block).toBeTruthy();
  });

  describe('[T] config block has entries for all six v1 CLI names', () => {
    it.each([
      ['codex'],
      ['claude'],
      ['gemini'],
      ['bedrock'],
      ['llm'],
      ['ollama'],
    ])('CLI "%s" has an entry', (cli) => {
      expect(block[cli]).toBeDefined();
    });
  });

  describe('[T] Codex and Claude Code default to parent-mediated', () => {
    it('codex defaults to parent-mediated', () => {
      expect(block.codex).toBe('parent-mediated');
    });
    it('claude defaults to parent-mediated', () => {
      expect(block.claude).toBe('parent-mediated');
    });
  });

  describe('[T] all other CLIs default to read-only', () => {
    it.each([
      ['gemini'],
      ['bedrock'],
      ['llm'],
      ['ollama'],
    ])('%s defaults to read-only', (cli) => {
      expect(block[cli]).toBe('read-only');
    });
  });

  it('[T] universal `default` key remains read-only (covers any CLI not in the table)', () => {
    expect(block.default).toBe('read-only');
  });

  describe('per-CLI value enum validation', () => {
    const VALID_MODES = new Set(['read-only', 'parent-mediated', 'sandbox-yolo']);
    it.each([
      ['default'],
      ['codex'],
      ['claude'],
      ['gemini'],
      ['bedrock'],
      ['llm'],
      ['ollama'],
    ])('%s uses an allowed mode value', (key) => {
      expect(VALID_MODES.has(block[key])).toBe(true);
    });
  });

  it('inline rationale comments reference parent-mediated for codex+claude', () => {
    expect(content).toMatch(/codex:\s*parent-mediated/);
    expect(content).toMatch(/claude:\s*parent-mediated/);
  });

  it('inline rationale comments reference read-only for the other four', () => {
    expect(content).toMatch(/gemini:\s*read-only/);
    expect(content).toMatch(/bedrock:\s*read-only/);
    expect(content).toMatch(/llm:\s*read-only/);
    expect(content).toMatch(/ollama:\s*read-only/);
  });
});

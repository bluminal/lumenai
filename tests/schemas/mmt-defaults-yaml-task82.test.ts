import { describe, it, expect, beforeAll } from 'vitest';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

describe('Task 82 (MMT): per-CLI external_permission_mode defaults', () => {
  let content: string;
  let parsed: any;
  let block: any;

  beforeAll(async () => {
    content = loadDefaultsYamlText();
    parsed = await loadDefaultsYaml();
    block = parsed?.multi_model_review?.external_permission_mode ?? {};
  });

  it('defaults.yaml parses as valid YAML (regression)', () => {
    expect(parsed).toBeTruthy();
    expect(block).toBeTruthy();
  });

  describe('[T] config block has entries for all eight CLI names (six v1 + grok, cursor per multi-model-review Task 66)', () => {
    it.each([
      ['codex'],
      ['claude'],
      ['gemini'],
      ['bedrock'],
      ['llm'],
      ['ollama'],
      ['grok'],
      ['cursor'],
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
      ['grok'],
      ['cursor'],
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
      ['grok'],
      ['cursor'],
    ])('%s uses an allowed mode value', (key) => {
      expect(VALID_MODES.has(block[key])).toBe(true);
    });
  });

  it('inline rationale comments reference parent-mediated for codex+claude', () => {
    expect(content).toMatch(/codex:\s*parent-mediated/);
    expect(content).toMatch(/claude:\s*parent-mediated/);
  });

  it('inline rationale comments reference read-only for the other six', () => {
    expect(content).toMatch(/gemini:\s*read-only/);
    expect(content).toMatch(/bedrock:\s*read-only/);
    expect(content).toMatch(/llm:\s*read-only/);
    expect(content).toMatch(/ollama:\s*read-only/);
    expect(content).toMatch(/grok:\s*read-only/);
    expect(content).toMatch(/cursor:\s*read-only/);
  });

  // multi-model-review Task 66 (D25, D29)
  it('grok and cursor carry inline rationale comments on their read-only lines', () => {
    expect(content).toMatch(/^\s*grok:\s*read-only\s+#\s*Pattern 1\b.*--deny '\*'/m);
    expect(content).toMatch(/^\s*cursor:\s*read-only\s+#\s*Pattern 1\b.*--mode ask/m);
  });

  it('the allowed-keys comment lists grok and cursor and names their binaries (grok, cursor-agent)', () => {
    expect(content).toMatch(/`ollama`, `grok`,\s*#?\s*`cursor`/);
    expect(content).toMatch(/`grok` key's binary is `grok`/);
    expect(content).toMatch(/`cursor` key's is `cursor-agent`/);
  });

  it('the gemini rationale comment no longer claims a `--readonly` flag', () => {
    const geminiLine = content.split('\n').find((l) => /^\s*gemini:\s*read-only/.test(l)) ?? '';
    expect(geminiLine).not.toContain('--readonly');
    expect(geminiLine).toContain('--approval-mode default');
  });
});

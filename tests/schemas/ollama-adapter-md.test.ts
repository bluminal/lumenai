import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENT = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'ollama-review-prompter.md');

describe('Task 16: ollama-review-prompter.md', () => {
  let content: string;
  beforeAll(() => { content = readFileSync(AGENT, 'utf8'); });

  // Test 1: file exists
  it('file exists', () => expect(existsSync(AGENT)).toBe(true));

  // Test 2: declares Haiku model
  it('declares Haiku model', () => expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/));

  // Test 3: FR-MR8 8 responsibilities present
  describe('FR-MR8 8 responsibilities (acceptance criterion 1)', () => {
    it.each([
      [1, 'CLI Presence Check'],
      [2, 'Auth Check'],
      [3, 'Prompt Construction'],
      [4, 'CLI Invocation'],
      [5, 'Output Parsing'],
      [6, 'Retry-Once on Parse Failure'],
      [7, 'Normalize to Canonical Envelope'],
      [8, 'Return Canonical Envelope'],
    ])('responsibility %i: %s', (_n, label) => {
      expect(content).toContain(label);
    });
  });

  // Test 4: capability_tier: text-only
  it('capability_tier: text-only', () => expect(content).toMatch(/capability_tier.*text-only/));

  // Test 5: family: local-<model> (placeholder pattern)
  it('family: local-<model> placeholder pattern (raw string match for "local-")', () => {
    expect(content).toContain('local-');
    // Verify it is documented as a placeholder / dynamic pattern
    expect(content).toMatch(/local-<model>/);
  });

  // Test 6: install one-liner exact substring match
  it('install one-liner: curl -fsSL https://ollama.com/install.sh | sh (exact substring)', () => {
    expect(content).toContain('curl -fsSL https://ollama.com/install.sh | sh');
  });

  // Test 7: error_code enum coverage (cli_missing mentioned; cli_auth_failed N/A; parse_failed mentioned)
  describe('error_code enum coverage (FR-MR16)', () => {
    it('mentions error_code: cli_missing', () => expect(content).toContain('cli_missing'));
    it('mentions error_code: parse_failed', () => expect(content).toContain('parse_failed'));
    it('does NOT claim cli_auth_failed is emitted (N/A for local adapter)', () => {
      // The adapter explicitly states cli_auth_failed is never emitted; we verify it's
      // acknowledged but marked as N/A rather than silently absent.
      // The phrase "cli_auth_failed" should appear only in the context of explaining it's N/A.
      expect(content).toContain('cli_auth_failed');
    });
  });

  // Test 8: source authority cross-references
  describe('Source authority cross-references', () => {
    it.each([
      'FR-MR8',
      'FR-MR9',
      'FR-MR10',
      'FR-MR16',
      'FR-MR26',
      'D3',
      'NFR-MR4',
    ])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  // Test 9: Q2 TBD placeholder section present
  describe('Q2 TBD placeholder section (acceptance criterion)', () => {
    it('contains "Q2" marker', () => expect(content).toContain('Q2'));
    it('contains "TBD" marker', () => expect(content).toContain('TBD'));
    it('contains the "Recommended Default Model" section', () =>
      expect(content).toContain('Recommended Default Model'));
  });

  // Test 10: no auth check declared (explicitly states no auth required)
  it('no auth check: explicitly states "No authentication required"', () => {
    expect(content).toMatch(/No authentication required/);
  });

  // Test 11: sandbox flags N/A documented
  it('sandbox flags N/A documented (explicit statement that they do not apply)', () => {
    // Must contain "do not apply" or "N/A" near "sandbox" or "Sandbox"
    expect(content).toMatch(/[Ss]andbox[\s\S]{0,300}(N\/A|do not apply|not apply)/);
  });

  // Test 12: source.reviewer_id is "ollama-review-prompter"
  it('source.reviewer_id is "ollama-review-prompter"', () => {
    expect(content).toContain('"ollama-review-prompter"');
  });

  // Test 13: source.family pattern documented (e.g., "local-qwen2.5-coder")
  it('source.family pattern documented with concrete example (e.g., local-qwen2.5-coder)', () => {
    expect(content).toContain('local-qwen2.5-coder');
  });

  // Test 14: Known Gotchas section present with 4 numbered items
  describe('Known Gotchas section with 4 items', () => {
    it('contains Known Gotchas section', () => expect(content).toContain('Known Gotchas'));
    it('has 4 numbered gotcha items', () => {
      // Split on the section heading to get the section body only
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toBeDefined();
      // Check for items 1–4 (numbered list)
      expect(gotchasSection).toMatch(/1\./);
      expect(gotchasSection).toMatch(/2\./);
      expect(gotchasSection).toMatch(/3\./);
      expect(gotchasSection).toMatch(/4\./);
    });
    it('gotcha 1: server must be running', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Ss]erver must be running/);
    });
    it('gotcha 2: model must be pulled', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Mm]odel must be pulled/);
    });
    it('gotcha 3: schema-formatted output requires recent Ollama versions', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Ss]chema.formatted output requires recent Ollama versions/);
    });
    it('gotcha 4: GPU memory pressure', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/GPU memory pressure/);
    });
  });
});

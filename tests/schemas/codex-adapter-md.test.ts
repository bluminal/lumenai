import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENT = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'codex-review-prompter.md');

describe('Task 9: codex-review-prompter.md', () => {
  let content: string;
  beforeAll(() => { content = readFileSync(AGENT, 'utf8'); });

  it('file exists', () => expect(existsSync(AGENT)).toBe(true));
  it('declares Haiku model', () => expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/));

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

  describe('Tier and family declarations (acceptance criterion 2)', () => {
    it('capability_tier: agentic', () => expect(content).toMatch(/capability_tier.*agentic/));
    it('family: openai', () => expect(content).toMatch(/family.*openai/));
  });

  describe('Sandbox flags per FR-MR26 (acceptance criterion 3)', () => {
    it('contains --sandbox read-only', () => expect(content).toContain('--sandbox read-only'));
    it('contains --approval-mode never', () => expect(content).toContain('--approval-mode never'));
    it('contains --json', () => expect(content).toContain('--json'));
    it('references FR-MR26', () => expect(content).toContain('FR-MR26'));
  });

  describe('Install one-liner is single shell command [H]', () => {
    it('contains npm install one-liner', () => expect(content).toMatch(/npm install -g @openai\/codex/));
  });

  describe('error_code enum coverage (FR-MR16)', () => {
    it.each(['cli_missing', 'cli_auth_failed', 'parse_failed'])('mentions error_code: %s', (code) => {
      expect(content).toContain(code);
    });
  });

  describe('Source authority cross-references', () => {
    it.each(['FR-MR8', 'FR-MR9', 'FR-MR10', 'FR-MR16', 'FR-MR26', 'D3', 'NFR-MR4'])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  it('install one-liner present (acceptance criterion 4 - [H])', () => {
    expect(content).toMatch(/Install One-Liner/);
  });

  it('auth setup pointer present (codex login)', () => {
    expect(content).toContain('codex login');
  });

  it('known gotchas section present', () => {
    expect(content).toContain('Known Gotchas');
  });
});

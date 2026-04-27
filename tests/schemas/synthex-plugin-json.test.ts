import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PLUGIN_JSON = join(__dirname, '..', '..', 'plugins', 'synthex', '.claude-plugin', 'plugin.json');
const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');

describe('Task 6: synthex plugin.json registration', () => {
  let parsed: any;
  let raw: string;
  beforeAll(() => {
    raw = readFileSync(PLUGIN_JSON, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('plugin.json exists', () => expect(existsSync(PLUGIN_JSON)).toBe(true));
  it('parses as valid JSON', () => expect(parsed).toBeTruthy());
  it('has agents array', () => expect(Array.isArray(parsed.agents)).toBe(true));
  it('agents array contains context-bundle-assembler entry', () => {
    expect(parsed.agents).toContain('./agents/context-bundle-assembler.md');
  });
  it('the registered agent file actually exists', () => {
    const agentPath = join(AGENTS_DIR, 'context-bundle-assembler.md');
    expect(existsSync(agentPath)).toBe(true);
  });
});

describe('Tasks 10/14/17: synthex plugin.json adapter registrations', () => {
  let parsed: any;
  beforeAll(() => {
    const raw = readFileSync(PLUGIN_JSON, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('plugin.json parses', () => expect(parsed).toBeTruthy());

  // Task 10
  it('agents array contains codex-review-prompter entry', () => {
    expect(parsed.agents).toContain('./agents/codex-review-prompter.md');
  });
  it('codex-review-prompter.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'codex-review-prompter.md'))).toBe(true);
  });

  // Task 14
  it('agents array contains gemini-review-prompter entry', () => {
    expect(parsed.agents).toContain('./agents/gemini-review-prompter.md');
  });
  it('gemini-review-prompter.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'gemini-review-prompter.md'))).toBe(true);
  });

  // Task 17
  it('agents array contains ollama-review-prompter entry', () => {
    expect(parsed.agents).toContain('./agents/ollama-review-prompter.md');
  });
  it('ollama-review-prompter.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'ollama-review-prompter.md'))).toBe(true);
  });

  // Non-regression: Task 6 entry must still be present
  it('agents array still contains context-bundle-assembler (no regression)', () => {
    expect(parsed.agents).toContain('./agents/context-bundle-assembler.md');
  });
  it('context-bundle-assembler.md still exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'context-bundle-assembler.md'))).toBe(true);
  });
});

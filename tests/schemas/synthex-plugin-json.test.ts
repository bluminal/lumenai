import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PLUGIN_JSON = join(__dirname, '..', '..', 'plugins', 'synthex', '.claude-plugin', 'plugin.json');

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
    const agentPath = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'context-bundle-assembler.md');
    expect(existsSync(agentPath)).toBe(true);
  });
});

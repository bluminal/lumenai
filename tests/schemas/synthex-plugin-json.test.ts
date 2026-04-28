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

describe('Task 60: fast-follow adapter registrations', () => {
  let parsed: any;
  beforeAll(() => {
    const raw = readFileSync(PLUGIN_JSON, 'utf8');
    parsed = JSON.parse(raw);
  });

  // 1. All 3 new adapters present in agents array
  it('agents array contains bedrock-review-prompter entry', () => {
    expect(parsed.agents).toContain('./agents/bedrock-review-prompter.md');
  });

  it('agents array contains claude-review-prompter entry', () => {
    expect(parsed.agents).toContain('./agents/claude-review-prompter.md');
  });

  it('agents array contains llm-review-prompter entry', () => {
    expect(parsed.agents).toContain('./agents/llm-review-prompter.md');
  });

  // 2. All 3 new agent files exist on disk
  it('bedrock-review-prompter.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'bedrock-review-prompter.md'))).toBe(true);
  });

  it('claude-review-prompter.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'claude-review-prompter.md'))).toBe(true);
  });

  it('llm-review-prompter.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'llm-review-prompter.md'))).toBe(true);
  });

  // 3. Non-regression: existing entries still present
  it('agents array still contains multi-model-review-orchestrator (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/multi-model-review-orchestrator.md');
  });

  it('agents array still contains context-bundle-assembler (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/context-bundle-assembler.md');
  });

  it('agents array still contains codex-review-prompter (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/codex-review-prompter.md');
  });

  it('agents array still contains gemini-review-prompter (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/gemini-review-prompter.md');
  });

  it('agents array still contains ollama-review-prompter (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/ollama-review-prompter.md');
  });
});

describe('Task 20: orchestrator registration', () => {
  let parsed: any;
  beforeAll(() => {
    const raw = readFileSync(PLUGIN_JSON, 'utf8');
    parsed = JSON.parse(raw);
  });

  it('agents array contains ./agents/multi-model-review-orchestrator.md', () => {
    expect(parsed.agents).toContain('./agents/multi-model-review-orchestrator.md');
  });

  it('multi-model-review-orchestrator.md exists on disk', () => {
    expect(existsSync(join(AGENTS_DIR, 'multi-model-review-orchestrator.md'))).toBe(true);
  });

  // Non-regression: prior 4 entries must still be present
  it('agents array still contains context-bundle-assembler (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/context-bundle-assembler.md');
  });
  it('agents array still contains codex-review-prompter (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/codex-review-prompter.md');
  });
  it('agents array still contains gemini-review-prompter (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/gemini-review-prompter.md');
  });
  it('agents array still contains ollama-review-prompter (non-regression)', () => {
    expect(parsed.agents).toContain('./agents/ollama-review-prompter.md');
  });
});

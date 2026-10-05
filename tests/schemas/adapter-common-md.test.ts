/**
 * multi-model-review Task 66 (D28, D31, D32): plugins/synthex/docs/adapter-common.md
 * is the shared FR-MR8 procedure for every *-review-prompter adapter.
 *
 * [T] criterion: adapter-common.md lists eight adapters, says "eight times",
 * has the "Runner scripts (optional)" paragraph, and states that adapters
 * MUST surface `config.judge_mode_prompt` when present.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const DOC = join(REPO_ROOT, 'plugins', 'synthex', 'docs', 'adapter-common.md');

const ADAPTER_NAMES = ['bedrock', 'claude', 'codex', 'cursor', 'gemini', 'grok', 'llm', 'ollama'];

describe('Task 66: adapter-common.md shared adapter procedure', () => {
  let content: string;
  let intro: string;

  beforeAll(() => {
    content = readFileSync(DOC, 'utf8');
    intro = content.split('\n## ')[0];
  });

  it('the intro lists all eight adapters', () => {
    for (const name of ADAPTER_NAMES) {
      expect(intro, `intro should list \`${name}\``).toContain(`\`${name}\``);
    }
    const listed = intro.match(/\(`bedrock`[^)]*\)/)?.[0] ?? '';
    expect(listed.match(/`[a-z]+`/g)).toHaveLength(8);
  });

  it('says the shared prose is not duplicated "eight times" (no stale "six times")', () => {
    expect(content).toMatch(/eight\s+times/);
    expect(content).not.toMatch(/six\s+times/);
  });

  it('has the "Runner scripts (optional)" paragraph naming scripts/adapters/<name>-review.sh', () => {
    expect(content).toContain('## Runner scripts (optional)');
    const section = content.split('## Runner scripts (optional)')[1].split('\n## ')[0];
    expect(section).toContain('scripts/adapters/<name>-review.sh');
    expect(section).toContain('--input <envelope.json>');
    expect(section).toContain('--envelope-out');
    expect(section).toContain('--auth-check');
    expect(section).toMatch(/FR-MR9 envelope/);
  });

  it('states that adapters MUST surface config.judge_mode_prompt when present', () => {
    expect(content).toMatch(/MUST\s+surface\s+`config\.judge_mode_prompt`/);
    expect(content).toMatch(/judge_mode_prompt`? is\s+present|When the input envelope's\s+`config\.judge_mode_prompt` is present/);
  });

  it('the error-code reference lists all eight FR-MR16 codes including cli_unsupported_mode', () => {
    const table = content.split('## Error Code Reference (FR-MR16)')[1].split('\n## ')[0];
    for (const code of [
      'cli_missing',
      'cli_auth_failed',
      'cli_failed',
      'parse_failed',
      'timeout',
      'sandbox_violation',
      'unknown_error',
      'cli_unsupported_mode',
    ]) {
      expect(table).toContain(`| \`${code}\` |`);
    }
    expect(table).toMatch(/eight codes/);
  });

  it('Output Parsing documents the D32 parse_failed rule and --usage-json', () => {
    expect(content).toContain('D32');
    expect(content).toContain('--usage-json');
  });

  it('keeps the "Other hosts" plugin-root section last, after the new sections', () => {
    const otherHosts = content.indexOf('## Other hosts');
    expect(otherHosts).toBeGreaterThan(content.indexOf('## Runner scripts (optional)'));
    expect(otherHosts).toBeGreaterThan(content.indexOf('## Judge mode'));
  });
});

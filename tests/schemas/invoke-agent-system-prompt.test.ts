/**
 * Layer 1: Regression tests for the FR-HM34 prerequisite fix (Task 27).
 *
 * `tests/helpers/invoke-agent.ts` and `tests/helpers/claude-provider.js`
 * both used to pass the agent's markdown file PATH as the literal value of
 * `claude -p --system-prompt`. `claude --help` documents `--system-prompt
 * <prompt>` as "System prompt to use for the session" — it takes prompt
 * TEXT, not a path (there is no `--system-prompt-file` flag on this CLI) —
 * so no Layer 2 run ever actually loaded an agent's prompt; the model ran
 * with the harness default system prompt instead of the agent's persona.
 *
 * These tests assert, without shelling out to the Claude CLI, that the
 * constructed argv now carries the agent's own CONTENT (specifically its
 * H1 heading, which only appears in the body, never in a file path) rather
 * than a filesystem path.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 3 / Milestone 3.1 / Task 27
 * (FR-HM34), folding in the Task 16 finding.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  buildInvokeArgs,
  stripFrontmatter,
  parseAgentFrontmatter,
} from '../helpers/invoke-agent';
import { buildClaudeArgs, stripFrontmatter as stripFrontmatterJs } from '../helpers/claude-provider.js';

const AGENTS_DIR = join(import.meta.dirname, '..', '..', 'plugins', 'synthex', 'agents');

const SAMPLE_AGENT = `---
model: haiku
effort: low
---

# Sample Agent Persona

You are a **Sample Agent** used only by this test.
`;

describe('invoke-agent.ts: buildInvokeArgs (FR-HM34 prerequisite fix)', () => {
  it('carries the agent H1 heading in the --system-prompt value, not a file path', () => {
    const args = buildInvokeArgs({
      agentContent: SAMPLE_AGENT,
      model: 'haiku',
      effort: 'low',
      maxTurns: 1,
    });

    const flagIndex = args.indexOf('--system-prompt');
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    const systemPromptValue = args[flagIndex + 1];

    expect(systemPromptValue).toContain('# Sample Agent Persona');
    // Not a path: no .md extension, no path separators.
    expect(systemPromptValue).not.toMatch(/\.md$/);
    expect(systemPromptValue).not.toMatch(/[/\\]agents[/\\]/);
  });

  it('strips the frontmatter block out of the --system-prompt value', () => {
    const args = buildInvokeArgs({
      agentContent: SAMPLE_AGENT,
      model: 'haiku',
      maxTurns: 1,
    });
    const systemPromptValue = args[args.indexOf('--system-prompt') + 1];
    expect(systemPromptValue).not.toContain('model: haiku');
    expect(systemPromptValue).not.toContain('effort: low');
    expect(systemPromptValue.trim().startsWith('---')).toBe(false);
  });

  it('still parses model/effort from the untouched frontmatter (Task 3 handling preserved)', () => {
    const fm = parseAgentFrontmatter(SAMPLE_AGENT);
    expect(fm.model).toBe('haiku');
    expect(fm.effort).toBe('low');
  });

  it('includes --model and --max-turns alongside --system-prompt', () => {
    const args = buildInvokeArgs({
      agentContent: SAMPLE_AGENT,
      model: 'sonnet',
      maxTurns: 3,
    });
    expect(args).toEqual(
      expect.arrayContaining(['--model', 'sonnet', '--max-turns', '3']),
    );
  });

  it('stripFrontmatter removes only the leading block, leaving the body intact', () => {
    const body = stripFrontmatter(SAMPLE_AGENT);
    expect(body.trim().startsWith('# Sample Agent Persona')).toBe(true);
    expect(body).not.toContain('model: haiku');
  });

  it('every real agent file yields a --system-prompt value starting with its H1, not frontmatter', () => {
    const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
      const fm = parseAgentFrontmatter(content);
      const args = buildInvokeArgs({
        agentContent: content,
        model: fm.model ?? 'sonnet',
        effort: fm.effort,
        maxTurns: 1,
      });
      const systemPromptValue = args[args.indexOf('--system-prompt') + 1];
      expect(
        systemPromptValue.trimStart().startsWith('#'),
        `${file}: --system-prompt value does not start with a heading`,
      ).toBe(true);
      expect(systemPromptValue).not.toMatch(/^---/);
      expect(systemPromptValue).not.toMatch(new RegExp(`agents[/\\\\]${file.replace('.', '\\.')}$`));
    }
  });
});

describe('claude-provider.js: buildClaudeArgs (FR-HM34 prerequisite fix, promptfoo provider)', () => {
  it('carries the agent H1 heading in the --system-prompt value, not a file path', () => {
    const args = buildClaudeArgs({
      agentContent: SAMPLE_AGENT,
      model: 'haiku',
      maxTurns: 1,
    });
    const systemPromptValue = args[args.indexOf('--system-prompt') + 1];
    expect(systemPromptValue).toContain('# Sample Agent Persona');
    expect(systemPromptValue).not.toMatch(/\.md$/);
  });

  it('stripFrontmatter mirrors the TS helper', () => {
    expect(stripFrontmatterJs(SAMPLE_AGENT)).toBe(stripFrontmatter(SAMPLE_AGENT));
  });
});

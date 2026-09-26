/**
 * Task 23 (NFR-HM4, FR-HM7, FR-HM12; D22): Layer 1 unit tests for the
 * canary tool-behavior probe assertion functions
 * (tests/compat/lib/tool-probes.mjs).
 *
 * The authenticated canary itself (tests/compat/scenarios/codex-canary.mjs,
 * opencode-canary.mjs) needs a real, credentialed provider and can only run
 * from main (see tests/compat/README.md "Authenticated canary"). This suite
 * instead validates the counting/detection logic against authored
 * pass/violation transcripts recorded under
 * tests/fixtures/compat-canary/ (see that directory's README for their
 * provenance and the caveat that they are authored, not captured).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INJECTED_CONTEXT_CANDIDATE_FILES,
  NO_INJECTED_CONTEXT_PROBE_ID,
  PROBED_TOOL_NAME,
  TOOL_PROBE_IDS,
  WORKFLOW_STEP_PROBE_ID,
  assertInjectedContextFileRead,
  assertToolAttemptedAtMostOnce,
  codexReadInjectedContextFile,
  countCodexToolAttempts,
  countOpenCodeToolAttempts,
  noInjectedContextProbePrompt,
  opencodeReadInjectedContextFile,
  workflowStepProbePrompt,
} from '../compat/lib/tool-probes.mjs';

const fixturesRoot = resolve(import.meta.dirname, '../fixtures/compat-canary');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(resolve(fixturesRoot, `${name}.json`), 'utf8'));
}

describe('compat canary tool-behavior probes (Task 23)', () => {
  it('declares exactly the two probe ids', () => {
    expect(TOOL_PROBE_IDS).toEqual([WORKFLOW_STEP_PROBE_ID, NO_INJECTED_CONTEXT_PROBE_ID]);
  });

  it('probes the same nonexistent tool on both hosts', () => {
    expect(PROBED_TOOL_NAME).toBe('Workflow');
  });

  it('phrases the workflow-step probe as a tool-presence gate naming Workflow', () => {
    const prompt = workflowStepProbePrompt('TEST_TOKEN');
    expect(prompt).toMatch(/If a tool named `Workflow` is in your tool list/);
    expect(prompt).toMatch(/otherwise/i);
    expect(prompt).toContain('TEST_TOKEN');
  });

  it('phrases the no-injected-context probe with the canonical FR-HM7 sentence', () => {
    // Byte-identical to READ_SENTENCE in tests/schemas/portability-prose.test.ts.
    const prompt = noInjectedContextProbePrompt('TEST_TOKEN');
    expect(prompt).toContain(
      'If the host did not already inject the project instruction file into ' +
        'your context, Read the first of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, ' +
        '`.hermes.md` that exists at the repository root.',
    );
    expect(prompt).toContain('TEST_TOKEN');
  });

  it('stages only the two files neither Codex nor OpenCode auto-inject', () => {
    expect(INJECTED_CONTEXT_CANDIDATE_FILES).toEqual(['GEMINI.md', '.hermes.md']);
  });

  describe('Codex: countCodexToolAttempts', () => {
    it('counts exactly one attempt on the passing transcript (skip-once honored)', () => {
      const fixture = loadFixture('codex-workflow-step-pass');
      const attempts = countCodexToolAttempts(fixture.items);
      expect(attempts).toBe(1);
      expect(() =>
        assertToolAttemptedAtMostOnce({ harness: 'codex', id: fixture.id, attempts }),
      ).not.toThrow();
    });

    it('counts two attempts on the violating transcript (retried)', () => {
      const fixture = loadFixture('codex-workflow-step-violation');
      const attempts = countCodexToolAttempts(fixture.items);
      expect(attempts).toBe(2);
      expect(() =>
        assertToolAttemptedAtMostOnce({ harness: 'codex', id: fixture.id, attempts }),
      ).toThrow(/attempted at most once/);
    });

    it('does not count reasoning/agent_message items that merely mention the tool name', () => {
      const items = [
        { type: 'reasoning', text: 'Workflow is not in my tool list.' },
        { type: 'agent_message', text: 'I will not call Workflow.' },
      ];
      expect(countCodexToolAttempts(items)).toBe(0);
    });
  });

  describe('Codex: codexReadInjectedContextFile', () => {
    it('finds the file read on the passing transcript', () => {
      const fixture = loadFixture('codex-no-injected-context-pass');
      const file = codexReadInjectedContextFile(fixture.items);
      expect(file).toBe('GEMINI.md');
      expect(() =>
        assertInjectedContextFileRead({ harness: 'codex', id: fixture.id, file }),
      ).not.toThrow();
    });

    it('finds nothing on the violating transcript (claimed injection, no read)', () => {
      const fixture = loadFixture('codex-no-injected-context-violation');
      const file = codexReadInjectedContextFile(fixture.items);
      expect(file).toBeNull();
      expect(() =>
        assertInjectedContextFileRead({ harness: 'codex', id: fixture.id, file }),
      ).toThrow(/expected a Read/);
    });

    it('does not count a prose mention of the filename in a non-file-read item', () => {
      const items = [
        { type: 'agent_message', text: 'GEMINI.md was already injected into context.' },
      ];
      expect(codexReadInjectedContextFile(items)).toBeNull();
    });
  });

  describe('OpenCode: countOpenCodeToolAttempts', () => {
    it('counts exactly one attempt on the passing transcript (skip-once honored)', () => {
      const fixture = loadFixture('opencode-workflow-step-pass');
      const attempts = countOpenCodeToolAttempts(fixture.output);
      expect(attempts).toBe(1);
      expect(() =>
        assertToolAttemptedAtMostOnce({ harness: 'opencode', id: fixture.id, attempts }),
      ).not.toThrow();
    });

    it('counts two attempts on the violating transcript (retried)', () => {
      const fixture = loadFixture('opencode-workflow-step-violation');
      const attempts = countOpenCodeToolAttempts(fixture.output);
      expect(attempts).toBe(2);
      expect(() =>
        assertToolAttemptedAtMostOnce({ harness: 'opencode', id: fixture.id, attempts }),
      ).toThrow(/attempted at most once/);
    });

    it('does not count a plain-text mention with no tool-shaped event', () => {
      const output = '{"type":"message","text":"Workflow is unavailable, I will not call it."}\n';
      expect(countOpenCodeToolAttempts(output)).toBe(0);
    });
  });

  describe('OpenCode: opencodeReadInjectedContextFile', () => {
    it('finds the file read on the passing transcript', () => {
      const fixture = loadFixture('opencode-no-injected-context-pass');
      const file = opencodeReadInjectedContextFile(fixture.output);
      expect(file).toBe('GEMINI.md');
      expect(() =>
        assertInjectedContextFileRead({ harness: 'opencode', id: fixture.id, file }),
      ).not.toThrow();
    });

    it('finds nothing on the violating transcript (claimed injection, no read)', () => {
      const fixture = loadFixture('opencode-no-injected-context-violation');
      const file = opencodeReadInjectedContextFile(fixture.output);
      expect(file).toBeNull();
      expect(() =>
        assertInjectedContextFileRead({ harness: 'opencode', id: fixture.id, file }),
      ).toThrow(/expected a Read/);
    });

    it('falls back to bounded read-verb text matching when no line parses as JSON', () => {
      const output = 'assistant: I will read GEMINI.md now to get project context.\n';
      expect(opencodeReadInjectedContextFile(output)).toBe('GEMINI.md');
    });

    it('does not match a bare mention with no read verb in the text fallback', () => {
      const output = 'assistant: GEMINI.md was already injected, no action needed.\n';
      expect(opencodeReadInjectedContextFile(output)).toBeNull();
    });
  });
});

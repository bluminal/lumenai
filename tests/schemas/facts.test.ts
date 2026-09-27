/**
 * Layer 1: Schema validation for Task 40 (FR-HM29, D12) — `.synthex/facts.md`.
 *
 * `init` writes four project facts, each with an anchor and a freshness
 * rule, to `.synthex/facts.md`. Commands that currently re-detect these
 * facts read facts.md first and keep their own detection as the fallback.
 *
 * These tests validate the *definition* (markdown) of the facts feature,
 * not runtime behavior. They catch regressions where:
 * - A fact, its anchor, or its freshness rule is dropped from init.md
 * - A consumer's fallback-to-detection sentence is removed
 * - `.synthex/facts.md` stops being gitignored by the generated block
 * - init.md stops printing the "Wrote <N> facts" confirmation
 * - The Task 39 step-numbering pins in init-multimodel-md.test.ts break
 *
 * Cost: $0 (no LLM calls — pure file parsing)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');
const COMMANDS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'commands');

const INIT_MD_PATH = join(COMMANDS_DIR, 'init.md');

const FALLBACK_SENTENCE =
  'Read `.synthex/facts.md` first; if the fact is missing or stale per its freshness rule, detect as before.';

// The four FR-HM29 facts and the anchor each must carry in init.md.
const FACTS = [
  { name: 'commit_convention', anchor: '#commit-convention' },
  { name: 'test_runner', anchor: '#test-runner' },
  { name: 'frontend_framework', anchor: '#frontend-framework' },
  { name: 'spec_index', anchor: '#spec-index' },
] as const;

// Every consumer that currently re-detects one of the facts above, and the
// file it lives in. Each must carry the fallback sentence verbatim.
const CONSUMERS = [
  {
    label: 'commit-message-author.md (commit_convention)',
    path: join(AGENTS_DIR, 'commit-message-author.md'),
  },
  {
    label: 'test-coverage-analysis.md (test_runner)',
    path: join(COMMANDS_DIR, 'test-coverage-analysis.md'),
  },
  {
    label: 'lead-frontend-engineer.md (frontend_framework)',
    path: join(AGENTS_DIR, 'lead-frontend-engineer.md'),
  },
  {
    label: 'code-reviewer.md (spec_index)',
    path: join(AGENTS_DIR, 'code-reviewer.md'),
  },
] as const;

function loadInitMd(): string {
  return readFileSync(INIT_MD_PATH, 'utf-8');
}

describe('facts.md — FR-HM29 fact table in init.md', () => {
  let content: string;

  beforeAll(() => {
    content = loadInitMd();
  });

  it('init.md documents a "Detect and Write Project Facts" step', () => {
    expect(content).toMatch(/Detect and Write Project Facts/);
  });

  it.each(FACTS)('documents the $name fact with its anchor', ({ name, anchor }) => {
    expect(content).toContain(`\`${name}\``);
    expect(content).toContain(anchor);
  });

  it('documents a freshness rule for every fact', () => {
    // commit_convention: re-verify on >50 commits past the recorded SHA
    expect(content).toMatch(/50 commits? past.*recorded_sha|recorded_sha.*50 commits?/i);
    // test_runner / frontend_framework: re-verify on package.json / pytest.ini mtime
    expect(content).toMatch(/package\.json.*pytest\.ini.*mtime|mtime.*package\.json.*pytest\.ini/i);
    // spec_index: re-verify on docs/specs mtime
    expect(content).toMatch(/docs\/specs.*mtime/i);
  });

  it('states facts are omitted rather than guessed when detection fails', () => {
    expect(content).toMatch(/omit|never write a guess/i);
  });

  it('prints "Wrote <N> facts to .synthex/facts.md"', () => {
    expect(content).toContain('Wrote <N> facts to .synthex/facts.md');
  });

  it('the facts step precedes Step 3 (Configure Concurrent Tasks)', () => {
    const factsPos = content.indexOf('Detect and Write Project Facts');
    const step3Pos = content.indexOf('### 3. Configure Concurrent Tasks');
    expect(factsPos).toBeGreaterThan(-1);
    expect(step3Pos).toBeGreaterThan(factsPos);
  });
});

describe('facts.md — .gitignore handling (D12: gitignored)', () => {
  let content: string;

  beforeAll(() => {
    content = loadInitMd();
  });

  it('Step 5 (Update .gitignore) adds .synthex/facts.md', () => {
    const step5Idx = content.indexOf('### 5. Update .gitignore');
    expect(step5Idx).toBeGreaterThan(-1);
    const step6Idx = content.indexOf('### 6. Create `.worktreeinclude`');
    expect(step6Idx).toBeGreaterThan(step5Idx);
    const step5Body = content.slice(step5Idx, step6Idx);
    expect(step5Body).toContain('.synthex/facts.md');
  });

  it('lists facts.md alongside the other three synthex-managed gitignore entries', () => {
    expect(content).toContain('four');
    expect(content).toContain('.synthex/state.json');
    expect(content).toContain('.synthex/loops/');
    expect(content).toContain('.synthex/facts.md');
  });
});

describe('facts.md — consumer fallback sentences', () => {
  it.each(CONSUMERS)('$label carries the fallback sentence verbatim', ({ path }) => {
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain(FALLBACK_SENTENCE);
  });
});

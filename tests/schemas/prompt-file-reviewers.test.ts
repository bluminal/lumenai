/**
 * Prompt-file reviewers: a `reviewers` entry may point at a markdown prompt
 * file in the project instead of naming a Synthex agent
 * (plugins/synthex/docs/prompt-file-reviewers.md).
 *
 * Covers `normalizeReviewers` from plugins/synthex/workflows/lib/review-engine
 * .mjs, the function the FR-HM16 Workflow engine also carries inlined between
 * its sync markers (review-engine-sync.test.ts guards the two copies), plus
 * the config-surface and prose contracts the feature depends on.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeReviewers } from '../../plugins/synthex/workflows/lib/review-engine.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const pluginRoot = join(repoRoot, 'plugins', 'synthex');

describe('normalizeReviewers', () => {
  it('maps a bare agent name to a namespaced agent type', () => {
    expect(normalizeReviewers(['code-reviewer'])).toEqual([
      { id: 'code-reviewer', agentType: 'synthex:code-reviewer' },
    ]);
  });

  it('maps an { agent } object the same way', () => {
    expect(normalizeReviewers([{ agent: 'security-reviewer', enabled: true }])).toEqual([
      { id: 'security-reviewer', agentType: 'synthex:security-reviewer' },
    ]);
  });

  it('gives a prompt-file reviewer no agentType', () => {
    const [reviewer] = normalizeReviewers([
      { id: 'pr-guardian', promptBody: 'Check the PR for a linked issue.' },
    ]);
    expect(reviewer).toEqual({
      id: 'pr-guardian',
      promptBody: 'Check the PR for a linked issue.',
    });
    expect(reviewer).not.toHaveProperty('agentType');
  });

  it('falls back to a generic id when a prompt entry carries none', () => {
    expect(normalizeReviewers([{ promptBody: 'Review it.' }])[0].id).toBe('prompt-reviewer-1');
  });

  it('keeps the fallback id unique so findings stay attributable', () => {
    const ids = normalizeReviewers([
      { promptBody: 'First.' },
      { promptBody: 'Second.' },
    ]).map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('lets an explicit id override the agent name for attribution', () => {
    expect(normalizeReviewers([{ agent: 'code-reviewer', id: 'house-style' }])).toEqual([
      { id: 'house-style', agentType: 'synthex:code-reviewer' },
    ]);
  });

  it('mixes agent and prompt-file entries in one list, in order', () => {
    const out = normalizeReviewers([
      'code-reviewer',
      { id: 'pr-guardian', promptBody: 'guardian rules' },
      { agent: 'security-reviewer' },
    ]);
    expect(out.map((r) => r.id)).toEqual(['code-reviewer', 'pr-guardian', 'security-reviewer']);
    expect(out.map((r) => Boolean(r.agentType))).toEqual([true, false, true]);
  });

  it('drops entries disabled with enabled: false', () => {
    expect(
      normalizeReviewers([
        { agent: 'code-reviewer', enabled: false },
        { id: 'pr-guardian', promptBody: 'guardian rules', enabled: false },
        'security-reviewer',
      ]).map((r) => r.id),
    ).toEqual(['security-reviewer']);
  });

  // One unreadable or empty prompt file must not cost the review the reviewers
  // that resolved fine, so a malformed entry drops rather than throwing.
  it('drops malformed entries instead of throwing', () => {
    expect(
      normalizeReviewers([
        null,
        undefined,
        '',
        '   ',
        {},
        { prompt: '.github/scripts/pr-guardian/prompt.md' }, // unresolved by the caller
        { promptBody: '   ' }, // file was empty or frontmatter-only
        { agent: '  ' },
        42,
        'code-reviewer',
      ] as never).map((r) => r.id),
    ).toEqual(['code-reviewer']);
  });

  it('returns an empty list for a non-array', () => {
    expect(normalizeReviewers(undefined as never)).toEqual([]);
    expect(normalizeReviewers(null as never)).toEqual([]);
  });
});

describe('prompt-file reviewer contracts', () => {
  const doc = readFileSync(join(pluginRoot, 'docs', 'prompt-file-reviewers.md'), 'utf-8');

  it('documents the three native reviewer blocks that accept a prompt entry', () => {
    for (const block of [
      'code_review.reviewers',
      'implementation_plan.reviewers',
      'refine_requirements.reviewers',
    ]) {
      expect(doc).toContain(block);
    }
  });

  it('states the read-only rule, since borrowed prompts are often written for CI', () => {
    expect(doc).toMatch(/read-only/i);
    expect(doc).toMatch(/\bgh\b/);
  });

  it('documents that a bad path degrades rather than aborting the review', () => {
    expect(doc).toMatch(/Skip the reviewer, warn/);
    expect(doc).toMatch(/escapes the project root/);
  });

  it('names the directory-name fallback for a generic filename', () => {
    // `<tool>/prompt.md` is the usual layout, so the filename alone reports
    // nothing useful.
    expect(doc).toMatch(/`prompt\.md`/);
    expect(doc).toMatch(/the name of the directory holding it/);
  });

  it.each([
    ['review-code.md'],
    ['write-implementation-plan.md'],
    ['refine-requirements.md'],
  ])('%s points reviewers at the shared spec', (file) => {
    const text = readFileSync(join(pluginRoot, 'commands', file), 'utf-8');
    expect(text).toContain('docs/prompt-file-reviewers.md');
    expect(text).toContain('- prompt: <path>');
  });

  it('defaults.yaml advertises the prompt entry in each reviewer block', () => {
    const defaults = readFileSync(join(pluginRoot, 'config', 'defaults.yaml'), 'utf-8');
    expect(defaults.match(/docs\/prompt-file-reviewers\.md/g)).toHaveLength(3);
  });

  it('the workflow args contract records that the caller resolves the file', () => {
    const routing = readFileSync(join(pluginRoot, 'docs', 'standing-pool-routing.md'), 'utf-8');
    expect(routing).toContain('{id, promptBody}');
    expect(routing).toMatch(/has no `fs`/);
  });
});

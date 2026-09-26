/**
 * Task 26 (FR-HM44): schema checks for plugins/synthex/agents/code-reviewer.md
 * itself (as opposed to code-reviewer.ts / code-reviewer.test.ts, which
 * validate the agent's REVIEW OUTPUT).
 *
 * FR-HM44 latent defect: Step 2 "Specification Relevance Analysis" used to
 * instruct spawning a sub-agent (the "Specification Relevance Analyzer").
 * That step is dead whenever code-reviewer itself runs as a subagent —
 * subagents cannot spawn subagents on Claude Code, and depth-1 hosts refuse
 * it. Step 2 is now an inline, size-gated scan controlled by
 * `code_review.spec_inline_bytes` (default 65536), and the "Sub-Agent
 * Registry" table (whose only row was the analyzer) is gone.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CODE_REVIEWER = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'agents',
  'code-reviewer.md'
);

describe('Task 26 (FR-HM44): code-reviewer.md Step 2 inline spec scan', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(CODE_REVIEWER, 'utf8');
  });

  it('file exists', () => {
    expect(existsSync(CODE_REVIEWER)).toBe(true);
  });

  it('H1 is unchanged ("# Code Reviewer")', () => {
    const m = content.match(/^# .*$/m);
    expect(m ? m[0] : null).toBe('# Code Reviewer');
  });

  describe('Step 2 no longer delegates to a sub-agent', () => {
    it('has no "Spawn a sub-agent" / "spawn a sub-agent" wording anywhere in the file', () => {
      expect(content).not.toMatch(/spawn a sub-agent/i);
    });

    it('has no bare "sub-agent" delegation wording in the Step 2 section', () => {
      const idx = content.indexOf('### Step 2');
      expect(idx).toBeGreaterThan(-1);
      const nextIdx = content.indexOf('### Step 3', idx);
      expect(nextIdx).toBeGreaterThan(idx);
      const step2 = content.slice(idx, nextIdx);
      expect(step2).not.toMatch(/sub-agent/i);
    });

    it('Step 2 is still titled "Specification Relevance Analysis"', () => {
      expect(content).toContain('### Step 2: Specification Relevance Analysis');
    });
  });

  describe('Step 2 names the size-gate config key and describes the inline scan', () => {
    it('names code_review.spec_inline_bytes', () => {
      expect(content).toContain('code_review.spec_inline_bytes');
    });

    it('describes the default of 65536', () => {
      const idx = content.indexOf('### Step 2');
      const nextIdx = content.indexOf('### Step 3', idx);
      const step2 = content.slice(idx, nextIdx);
      expect(step2).toMatch(/65536/);
    });

    it('describes reading specs directly when within the size gate', () => {
      const idx = content.indexOf('### Step 2');
      const nextIdx = content.indexOf('### Step 3', idx);
      const step2 = content.slice(idx, nextIdx);
      expect(step2).toMatch(/read the specs directly/i);
    });

    it('describes scanning only the first 50 lines of each spec when over the size gate', () => {
      const idx = content.indexOf('### Step 2');
      const nextIdx = content.indexOf('### Step 3', idx);
      const step2 = content.slice(idx, nextIdx);
      expect(step2).toMatch(/first 50 lines of each spec/i);
    });

    it('still instructs reading the relevant specifications fully before review', () => {
      expect(content).toMatch(/[Rr]ead the relevant specifications fully/);
    });
  });

  describe('Sub-Agent Registry table is gone', () => {
    it('has no "Sub-Agent Registry" heading', () => {
      expect(content).not.toContain('## Sub-Agent Registry');
    });

    it('has no "Specification Relevance Analyzer" row', () => {
      expect(content).not.toContain('Specification Relevance Analyzer');
    });

    it('has no "Built-in (spawned automatically)" status cell', () => {
      expect(content).not.toContain('Built-in (spawned automatically)');
    });

    it('still documents code_review.specialists for additional reviewers', () => {
      expect(content).toContain('code_review.specialists');
    });
  });

  describe('Output Format section untouched by this task', () => {
    it('Output Format heading is still present', () => {
      expect(content).toContain('## Output Format');
    });
  });
});

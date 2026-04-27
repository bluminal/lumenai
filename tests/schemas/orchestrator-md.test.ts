import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ORCHESTRATOR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'multi-model-review-orchestrator.md');

describe('Task 19: multi-model-review-orchestrator.md', () => {
  let content: string;
  beforeAll(() => { content = readFileSync(ORCHESTRATOR, 'utf8'); });

  it('file exists', () => expect(existsSync(ORCHESTRATOR)).toBe(true));

  describe('Acceptance criterion 1: declares Sonnet model', () => {
    it('frontmatter has model: sonnet', () => {
      expect(content).toMatch(/^---[\s\S]*?model:\s*sonnet[\s\S]*?---/);
    });
  });

  describe('Acceptance criterion 2: documents fan-out pattern with FR-MR12 phrasing verbatim', () => {
    it('contains FR-MR12 verbatim phrase: "single parallel Task batch"', () => {
      expect(content).toContain('single parallel Task batch');
    });
    it('explicitly references FR-MR12', () => {
      expect(content).toContain('FR-MR12');
    });
    it('explicit MUST NOT serialize proposers rule', () => {
      expect(content).toMatch(/MUST NOT[\s\S]*serialize/);
    });
  });

  describe('Acceptance criterion 3: three sub-section requirements', () => {
    it('documents adapter Task-call JSON shape (FR-MR9)', () => {
      expect(content).toContain('"command"');
      expect(content).toContain('"context_bundle"');
      expect(content).toContain('"raw_output_path"');
    });
    it('documents native context shape with output_schema requirement', () => {
      expect(content).toMatch(/output_schema/);
    });
    it('documents collection mechanism (await all batch resolutions, concatenate findings)', () => {
      expect(content).toMatch(/[Cc]ollection/);
      expect(content).toMatch(/[Aa]wait all batch resolutions/);
      expect(content).toMatch(/[Cc]oncatenate.*findings/);
    });
  });

  describe('Acceptance criterion 4: respects include_native_reviewers: false', () => {
    it('skips natives when include_native_reviewers is false', () => {
      expect(content).toMatch(/include_native_reviewers[\s\S]*false[\s\S]*[Ss]kipped/);
    });
  });

  describe('Acceptance criterion 5: failure surfaces uniform + critical when ALL natives fail', () => {
    it('per_reviewer_results entries do NOT separate native vs external (uniform table)', () => {
      // Scope rule: source_type field distinguishes them; nothing else. Test via comment text.
      expect(content).toMatch(/source_type field distinguishes them/i);
    });
    it('all-externals-failed warning verbatim', () => {
      expect(content).toContain('All external reviewers failed; continuing with natives only');
    });
    it('all-natives-failed CRITICAL warning verbatim (Task 23b)', () => {
      expect(content).toContain('All native Synthex reviewers failed. Cannot continue — multi-model review has no findings to consolidate. Check sub-agent error logs.');
    });
  });

  describe('Acceptance criterion 6: cloud-surface remediation documented', () => {
    it('cloud-surface remediation message present (NFR-MR2)', () => {
      expect(content).toContain('NFR-MR2');
      expect(content).toMatch(/cloud-surface|adapter-recipes\.md/);
    });
    it('single remediation error, not per-CLI cascade', () => {
      expect(content).toMatch(/single remediation error|NOT a per-CLI cascade/i);
    });
  });

  describe('Source authority cross-references', () => {
    it.each(['FR-MR11', 'FR-MR12', 'FR-MR15', 'FR-MR17', 'FR-MR28', 'FR-MR9', 'D5', 'D6', 'D17', 'D21', 'NFR-MR2'])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  describe('Path-and-reason header (D21)', () => {
    it('Step 7 documents the D21 regex', () => {
      expect(content).toContain('Review path:');
      expect(content).toMatch(/regex/i);
    });
  });

  describe('Aggregator tier table (D17)', () => {
    it('lists all 6 tier-table entries in strict order', () => {
      const tier = 'Claude Opus > GPT-5 > Claude Sonnet > Gemini 2.5 Pro > DeepSeek V3 > Qwen 32B';
      expect(content).toContain(tier);
    });
  });

  describe('Scope constraints — what this milestone does NOT do', () => {
    it('Scope Constraints section explicitly defers consolidation to 3.2/3.3', () => {
      expect(content).toContain('Scope Constraints');
      expect(content).toMatch(/Stages 1\+2 land in Task 24/);
      expect(content).toMatch(/preflight.*Task 21/i);
    });
  });
});

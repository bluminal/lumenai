import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ORCHESTRATOR = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'agents',
  'multi-model-review-orchestrator.md'
);

describe('Tasks 24/25/26: Consolidation Pipeline (Stages 1, 2, 4) in multi-model-review-orchestrator.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(ORCHESTRATOR, 'utf8');
  });

  // --- Task 24: Stage 1 --- //

  describe('Stage 1: Fingerprint Dedup (Task 24, FR-MR14)', () => {
    it('file exists', () => {
      expect(existsSync(ORCHESTRATOR)).toBe(true);
    });

    it('consolidation section is present', () => {
      expect(content).toMatch(/##\s+Consolidation Pipeline/i);
    });

    it('Stage 1 section is present with "Fingerprint Dedup" heading', () => {
      const hasStage1 =
        content.includes('Fingerprint Dedup') || content.includes('fingerprint dedup');
      expect(hasStage1).toBe(true);
    });

    it('[T] finding_id MUST NOT contain line numbers (validated against canonical-finding-schema.md)', () => {
      expect(content).toContain('MUST NOT contain line numbers');
    });

    it('[T] documents raised_by[] collapse semantics', () => {
      expect(content).toContain('raised_by');
    });

    it('[T] two findings sharing finding_id collapse to one with both contributors listed', () => {
      // Must describe the collapse semantics: two → one, with both contributors in raised_by
      const hasCollapseDesc =
        /two findings sharing.*finding_id.*collapse/i.test(content) ||
        /sharing.*finding_id.*collapse/i.test(content) ||
        /collapse.*finding_id.*raised_by/i.test(content) ||
        /finding_id.*collapse.*one/i.test(content);
      expect(hasCollapseDesc).toBe(true);
      // Both contributors in raised_by
      expect(content).toMatch(/raised_by\[\].*both|both.*raised_by\[\]/i);
    });

    it('validates against canonical-finding-schema.md (cross-reference present)', () => {
      expect(content).toContain('canonical-finding-schema.md');
    });
  });

  // --- Task 25: Stage 2 --- //

  describe('Stage 2: Lexical Dedup (Task 25, FR-MR14)', () => {
    it('Stage 2 section is present with "lexical dedup" description', () => {
      const hasStage2 =
        content.includes('Lexical Dedup') || content.includes('lexical dedup');
      expect(hasStage2).toBe(true);
    });

    it('[T] Jaccard threshold is configurable — references stage2_jaccard_threshold config key (NOT hardcoded)', () => {
      expect(content).toContain('stage2_jaccard_threshold');
    });

    it('documents default Jaccard threshold of 0.8', () => {
      expect(content).toContain('0.8');
    });

    it('[T] merge preserves highest-severity description', () => {
      expect(content).toContain('highest-severity');
    });

    it('documents bucket grouping by (file, symbol)', () => {
      expect(content).toContain('(file, symbol)');
    });
  });

  // --- Task 26: Stage 4 --- //

  describe('Stage 4: LLM Tiebreaker (Task 26, D18 BOUNDED)', () => {
    it('Stage 4 section is present with "LLM Tiebreaker" or "tiebreaker" description', () => {
      const hasStage4 =
        content.includes('LLM Tiebreaker') ||
        content.includes('LLM tiebreaker') ||
        content.includes('tiebreaker');
      expect(hasStage4).toBe(true);
    });

    it('[T] pre-filter ≥30% Jaccard is documented before any LLM call', () => {
      expect(content).toContain('30%');
      // Confirm it is described as a pre-filter or gate applied before the LLM call
      const hasPreFilter =
        content.includes('Pre-filter') ||
        content.includes('pre-filter') ||
        content.includes('pre-filter') ||
        /30%.*before.*LLM|pre.*filter.*30%/i.test(content);
      expect(hasPreFilter).toBe(true);
    });

    it('[T] per-consolidation cap is documented via max_calls_per_consolidation config key (NOT hardcoded)', () => {
      expect(content).toContain('max_calls_per_consolidation');
    });

    it('[T] when the cap fires: remaining pairs left unmerged + single audit warning records total skipped count', () => {
      // Single warning (not per-bucket cascade)
      const hasSingleWarning =
        /single audit warning/i.test(content) || /ONE such warning/i.test(content);
      expect(hasSingleWarning).toBe(true);
      // Records total skipped pair count
      const hasSkippedCount =
        /skipped.*pair|pair.*skipped|skipped.*count|remaining.*unmerged/i.test(content);
      expect(hasSkippedCount).toBe(true);
    });

    it('[T] position-randomization rule documented — raw-string match for "alternating order"', () => {
      expect(content).toContain('alternating order');
    });

    it('position randomization is based on invocation_counter mod 2', () => {
      expect(content).toContain('invocation_counter mod 2');
    });

    it('Stage 4 cap warning text contains "Stage 4 cap reached" verbatim', () => {
      expect(content).toContain('Stage 4 cap reached');
    });
  });

  // --- Cross-cutting tests --- //

  describe('Cross-cutting: Source Authority and Scope Constraints', () => {
    it('Source Authority section references FR-MR14', () => {
      const sourceStart = content.indexOf('## Source Authority');
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceSection = content.slice(sourceStart, sourceStart + 2000);
      expect(sourceSection).toContain('FR-MR14');
    });

    it('Source Authority section references D18', () => {
      const sourceStart = content.indexOf('## Source Authority');
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceSection = content.slice(sourceStart, sourceStart + 2000);
      expect(sourceSection).toContain('D18');
    });

    it('Scope Constraints marks Stages 1+2 as done (Task 24)', () => {
      // The done marker must reference Stages 1+2 and Task 24
      expect(content).toMatch(/Stages 1\+2 land in Task 24/);
    });

    it('Scope Constraints marks Stage 4 as done (Task 26)', () => {
      // The done marker must reference Stage 4 and Task 26
      expect(content).toMatch(/Stage 4 in Task 26/);
    });

    it('Scope Constraints still lists Stage 5, 5b, 6 as pending for Milestone 3.3', () => {
      // Stages 5, 5b, 6 should still appear as NOT YET done
      const hasStage5Pending =
        /Stage 5.*pending|Stage 5.*Milestone 3\.3|Task 28/i.test(content);
      expect(hasStage5Pending).toBe(true);
    });
  });
});

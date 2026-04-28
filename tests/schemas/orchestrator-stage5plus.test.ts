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

describe('Tasks 28/29a/29b/30/31: Stages 5, 5b, 6 + Aggregator Bias Mitigation in multi-model-review-orchestrator.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(ORCHESTRATOR, 'utf8');
  });

  // ─── Stage 5: Severity Reconciliation (Task 28) ────────────────────────────

  describe('Stage 5: Severity Reconciliation (Task 28, FR-MR14a)', () => {
    it('1. Step 8d / Stage 5 section is present', () => {
      const hasStep8d =
        content.includes('Step 8d') ||
        content.includes('Stage 5: Severity Reconciliation') ||
        content.includes('Stage 5 — Severity Reconciliation') ||
        /Stage 5.*Severity Reconciliation/i.test(content);
      expect(hasStep8d).toBe(true);
    });

    it('2. "Unanimous" handling is documented', () => {
      expect(content).toContain('Unanimous');
    });

    it('3. one-level diff → max severity, severity_range documented', () => {
      // "max" in context of severity and "severity_range"
      expect(content).toMatch(/max.*severity|severity.*max/i);
      expect(content).toContain('severity_range');
    });

    it('4. two-or-more level diff → CoT judge step with severity_reasoning', () => {
      const hasJudgeStep =
        content.includes('judge step') ||
        content.includes('CoT') ||
        /Chain-of-Thought/i.test(content);
      expect(hasJudgeStep).toBe(true);
      expect(content).toContain('severity_reasoning');
    });

    it('5. per-reviewer severities preserved in raised_by[].severity', () => {
      const hasPreservation =
        content.includes('raised_by[].severity') ||
        /raised_by.*severity.*preserved|severity.*raised_by.*preserved/i.test(content) ||
        /PRESERVED.*raised_by|raised_by.*PRESERVED/i.test(content);
      expect(hasPreservation).toBe(true);
    });
  });

  // ─── Stage 5b: Contradiction Scan + CoVe Adjudication (Tasks 29a + 29b) ───

  describe('Stage 5b: Contradiction Scan + CoVe Adjudication (Tasks 29a + 29b, FR-MR14)', () => {
    it('6. Step 8e section is present', () => {
      const hasStep8e =
        content.includes('Step 8e') ||
        content.includes('Stage 5b') ||
        /Contradiction Scan/i.test(content);
      expect(hasStep8e).toBe(true);
    });

    it('7. Contradiction scan documents "Same location" as "same file AND same symbol"', () => {
      expect(content).toContain('same file AND same symbol');
    });

    it('8. Same file + no symbol + within 5 lines → candidate (raw-string for "5 lines")', () => {
      expect(content).toContain('5 lines');
    });

    it('9. Same file + no symbol + 7+ lines apart → NOT candidate (boundary documented)', () => {
      const hasBoundary =
        content.includes('7 or more lines apart') ||
        content.includes('7+ lines apart') ||
        /7.*lines.*apart.*NOT|NOT.*candidate.*7.*lines/i.test(content);
      expect(hasBoundary).toBe(true);
    });

    it('10. Output of scanner is candidate pairs, no severity changes yet', () => {
      const hasNoBias =
        content.includes('No severity changes yet') ||
        content.includes('no severity changes yet') ||
        /candidates only.*no severity|no severity.*candidates only/i.test(content);
      expect(hasNoBias).toBe(true);
    });

    it('11. CoVe documented (raw-string for "Chain-of-Verification" or "CoVe")', () => {
      const hasCoVe =
        content.includes('Chain-of-Verification') ||
        content.includes('CoVe');
      expect(hasCoVe).toBe(true);
    });

    it('12. arXiv reference 2309.11495 is present', () => {
      expect(content).toContain('2309.11495');
    });

    it('13. superseded_by_verification field is documented', () => {
      expect(content).toContain('superseded_by_verification');
    });

    it('14. verification_reasoning field is documented', () => {
      expect(content).toContain('verification_reasoning');
    });

    it('15. Both findings remain visible in output (raw-string)', () => {
      const hasBothVisible =
        content.includes('Both findings remain visible') ||
        content.includes('both findings remain visible');
      expect(hasBothVisible).toBe(true);
    });
  });

  // ─── Stage 6: Minority-of-One Demotion (Task 30) ───────────────────────────

  describe('Stage 6: Minority-of-One Demotion (Task 30, FR-MR14b)', () => {
    it('16. Step 8f section is present', () => {
      const hasStep8f =
        content.includes('Step 8f') ||
        content.includes('Stage 6') ||
        /Minority-of-One Demotion/i.test(content);
      expect(hasStep8f).toBe(true);
    });

    it('17. raised_by.length === 1 semantic is documented', () => {
      expect(content).toContain('raised_by.length === 1');
    });

    it('18. security category → NOT demoted (security exemption)', () => {
      const hasSecurityExempt =
        /security.*DO NOT demote|DO NOT demote.*security|category.*security.*not demot/i.test(content);
      expect(hasSecurityExempt).toBe(true);
    });

    it('19. high confidence → NOT demoted (confidence flag override)', () => {
      const hasConfidenceExempt =
        /confidence.*high.*DO NOT demote|DO NOT demote.*confidence.*high|high.*confidence.*not demot/i.test(content);
      expect(hasConfidenceExempt).toBe(true);
    });

    it('20. Otherwise → demote by exactly one level', () => {
      const hasDemoteOneLevel =
        content.includes('one level') &&
        content.includes('demote');
      expect(hasDemoteOneLevel).toBe(true);
    });

    it('21. Findings are NEVER dropped', () => {
      const hasNeverDropped =
        content.includes('NEVER dropped') ||
        content.includes('never dropped');
      expect(hasNeverDropped).toBe(true);
    });

    it('22. Demotion ladder documented: critical → high → medium → low → low', () => {
      // All four demotion transitions documented
      const hasCriticalToHigh = /critical.*→.*high|critical.*->.*high/i.test(content);
      const hasHighToMedium = /high.*→.*medium|high.*->.*medium/i.test(content);
      const hasMediumToLow = /medium.*→.*low|medium.*->.*low/i.test(content);
      const hasLowFloor = /low.*→.*low|low.*->.*low/i.test(content);
      expect(hasCriticalToHigh).toBe(true);
      expect(hasHighToMedium).toBe(true);
      expect(hasMediumToLow).toBe(true);
      expect(hasLowFloor).toBe(true);
    });
  });

  // ─── Aggregator Bias Mitigation (Task 31) ──────────────────────────────────

  describe('Aggregator Bias Mitigation (Task 31, FR-MR15)', () => {
    it('23. Step 8g section is present', () => {
      const hasStep8g =
        content.includes('Step 8g') ||
        /Aggregator Bias Mitigation/i.test(content);
      expect(hasStep8g).toBe(true);
    });

    it('24. Position-randomization across reviewer findings documented', () => {
      const hasPositionRandom =
        content.includes('Position-randomization') ||
        content.includes('position-randomization') ||
        /randomize the per-reviewer findings ORDER/i.test(content);
      expect(hasPositionRandom).toBe(true);
    });

    it('25. Sample of 10 invocations seed variation documented', () => {
      const hasSampleVariation =
        content.includes('10 invocations') ||
        /sample of 10.*invocation|invocation.*sample of 10/i.test(content);
      expect(hasSampleVariation).toBe(true);
    });

    it('26. Judge-mode system prompt for inline path (raw-string "judge-mode" + "inline")', () => {
      expect(content).toContain('judge-mode');
      const hasInlinePath =
        content.includes('inline-aggregator') ||
        content.includes('inline aggregat') ||
        /inline.*judge-mode|judge-mode.*inline/i.test(content);
      expect(hasInlinePath).toBe(true);
    });

    it('27. External-aggregator path: judge_mode_prompt packaged into adapter Task call (raw-string)', () => {
      expect(content).toContain('judge_mode_prompt');
      expect(content).toContain('"judge_mode_prompt"');
      // Must appear in context of "config" block (adapter envelope)
      const judgePromptIdx = content.indexOf('"judge_mode_prompt"');
      expect(judgePromptIdx).toBeGreaterThan(-1);
      // Verify it's in the context of the adapter config block (within 500 chars of "adapter")
      const surroundingCtx = content.slice(Math.max(0, judgePromptIdx - 500), judgePromptIdx + 500);
      const hasAdapterCtx =
        surroundingCtx.includes('adapter') ||
        surroundingCtx.includes('"config"') ||
        surroundingCtx.includes('"command"');
      expect(hasAdapterCtx).toBe(true);
    });

    it('28. D17 cross-reference present in Step 8g', () => {
      // D17 must appear in context of bias mitigation / external aggregator path
      const step8gIdx = content.indexOf('Step 8g');
      expect(step8gIdx).toBeGreaterThan(-1);
      const step8gSection = content.slice(step8gIdx, step8gIdx + 3000);
      expect(step8gSection).toContain('D17');
    });

    it('29. Self-preference warning cross-reference present (raw-string "self-preference")', () => {
      // Step 8g must cross-reference the self-preference warning
      const step8gIdx = content.indexOf('Step 8g');
      expect(step8gIdx).toBeGreaterThan(-1);
      const step8gSection = content.slice(step8gIdx, step8gIdx + 3000);
      const hasSelfPref =
        step8gSection.includes('self-preference') ||
        step8gSection.includes('Self-preference');
      expect(hasSelfPref).toBe(true);
    });

    it('30. Q3 partial resolution noted in Step 8g', () => {
      const step8gIdx = content.indexOf('Step 8g');
      expect(step8gIdx).toBeGreaterThan(-1);
      const step8gSection = content.slice(step8gIdx, step8gIdx + 3000);
      const hasQ3 =
        step8gSection.includes('Q3') ||
        /inline.*separate.*aggregator|aggregator.*inline.*separate/i.test(step8gSection);
      expect(hasQ3).toBe(true);
    });
  });

  // ─── Cross-cutting ──────────────────────────────────────────────────────────

  describe('Cross-cutting: Source Authority and Scope Constraints', () => {
    it('31. Source Authority updated to include FR-MR14a', () => {
      const sourceStart = content.indexOf('## Source Authority');
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceSection = content.slice(sourceStart, sourceStart + 3000);
      expect(sourceSection).toContain('FR-MR14a');
    });

    it('31b. Source Authority updated to include FR-MR14b', () => {
      const sourceStart = content.indexOf('## Source Authority');
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceSection = content.slice(sourceStart, sourceStart + 3000);
      expect(sourceSection).toContain('FR-MR14b');
    });

    it('31c. Source Authority updated to include FR-MR15 (aggregator bias mitigation)', () => {
      const sourceStart = content.indexOf('## Source Authority');
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceSection = content.slice(sourceStart, sourceStart + 3000);
      expect(sourceSection).toContain('FR-MR15');
    });

    it('32. Scope Constraints: Stages 5, 5b, 6 marked done', () => {
      const scopeStart = content.indexOf('## Scope Constraints');
      expect(scopeStart).toBeGreaterThan(-1);
      const scopeSection = content.slice(scopeStart, scopeStart + 3000);
      // Stage 5 must be marked DONE
      const hasStage5Done =
        /Stage 5.*DONE|DONE.*Stage 5/i.test(scopeSection) ||
        /~~Stage 5.*Severity.*~~.*DONE/i.test(scopeSection);
      expect(hasStage5Done).toBe(true);
      // Stage 5b must be marked DONE
      const hasStage5bDone =
        /Stage 5b.*DONE|DONE.*Stage 5b/i.test(scopeSection) ||
        /~~Stage 5b.*~~.*DONE/i.test(scopeSection);
      expect(hasStage5bDone).toBe(true);
      // Stage 6 must be marked DONE
      const hasStage6Done =
        /Stage 6.*DONE|DONE.*Stage 6/i.test(scopeSection) ||
        /~~Stage 6.*~~.*DONE/i.test(scopeSection);
      expect(hasStage6Done).toBe(true);
    });

    it('32b. Scope Constraints: Q3 partial resolution noted', () => {
      const scopeStart = content.indexOf('## Scope Constraints');
      expect(scopeStart).toBeGreaterThan(-1);
      const scopeSection = content.slice(scopeStart, scopeStart + 3000);
      const hasQ3 =
        scopeSection.includes('Q3') ||
        /inline.*separate.*aggregator|aggregator.*prompt.*partially/i.test(scopeSection);
      expect(hasQ3).toBe(true);
    });
  });
});

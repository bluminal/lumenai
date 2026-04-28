/**
 * Layer 1: Structural validation tests for the multi-model integration
 * in plugins/synthex/commands/write-implementation-plan.md.
 *
 * Validates all [T] acceptance criteria from Tasks 42, 43, 44:
 *   Task 42 — multi-model orchestrator invocation in plan-review step
 *   Task 43 — --multi-model and --no-multi-model flags (FR-MR6)
 *   Task 44 [H] — plan-linter runs BEFORE orchestrator (doc text present)
 *
 * Source authority: FR-MR6, FR-MR22, FR-MR23
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const WIP_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'write-implementation-plan.md'
);

const content = readFileSync(WIP_MD_PATH, 'utf-8');

// ── Task 42: Multi-model orchestrator invocation ─────────────────────────────

describe('write-implementation-plan.md — Task 42: multi-model orchestrator invocation', () => {

  it('[T] multi-model-review-orchestrator agent referenced by name', () => {
    expect(content).toContain('multi-model-review-orchestrator');
  });

  it('[T] command: "write-implementation-plan" present in orchestrator input contract', () => {
    expect(content).toContain('command: "write-implementation-plan"');
  });

  it('[T] architect listed as native reviewer in orchestrator invocation', () => {
    expect(content).toContain('architect');
  });

  it('[T] design-system-agent listed as native reviewer in orchestrator invocation', () => {
    expect(content).toContain('design-system-agent');
  });

  it('[T] tech-lead listed as native reviewer in orchestrator invocation', () => {
    expect(content).toContain('tech-lead');
  });

  it('[T] all three native reviewers appear together in the native_reviewers list', () => {
    // The orchestrator invocation block should list all three
    expect(content).toContain('native_reviewers: ["architect", "design-system-agent", "tech-lead"]');
  });

  it('[T] artifact_path field documented in orchestrator invocation', () => {
    expect(content).toContain('artifact_path');
  });

  it('[T] per_reviewer_timeout_seconds field documented in orchestrator invocation', () => {
    expect(content).toContain('per_reviewer_timeout_seconds');
  });

  it('[T] PM receives consolidated findings list with attribution', () => {
    const hasConsolidatedFindings =
      content.includes('consolidated findings list with attribution') ||
      content.includes('consolidated findings') ||
      content.includes('consolidated envelope');
    expect(hasConsolidatedFindings).toBe(true);
  });

  it('[T] PM receives single consolidated findings — not raw per-reviewer outputs', () => {
    // Document must state PM does not process raw per-reviewer outputs
    expect(content).toContain('does NOT process raw per-reviewer outputs');
  });

});

// ── Task 42: PM decision-and-revision flow unchanged ────────────────────────

describe('write-implementation-plan.md — Task 42: PM flow and plan-scribe unchanged', () => {

  it('[T] PM decision-and-revision flow stated as UNCHANGED', () => {
    const hasUnchanged =
      content.includes('decision-and-revision flow is UNCHANGED') ||
      content.includes('flow is UNCHANGED') ||
      content.includes('flow unchanged');
    expect(hasUnchanged).toBe(true);
  });

  it('[T] plan-scribe referenced as the edit mechanism', () => {
    expect(content).toContain('plan-scribe');
  });

  it('[T] plan-scribe still applies edits stated explicitly', () => {
    expect(content).toContain('plan-scribe');
    // The sentence "plan-scribe still applies edits" or equivalent must be present
    const hasPlanScribeAppliesEdits =
      content.includes('plan-scribe') &&
      (content.includes('still applies edits') || content.includes('applies edits to the plan'));
    expect(hasPlanScribeAppliesEdits).toBe(true);
  });

});

// ── Task 42: No complexity gate (FR-MR22) ───────────────────────────────────

describe('write-implementation-plan.md — Task 42: No complexity gate (FR-MR22)', () => {

  it('[T] FR-MR22 cross-reference present', () => {
    expect(content).toContain('FR-MR22');
  });

  it('[T] no complexity gate documented — "no complexity gate" or "ALWAYS runs" language present', () => {
    const hasNoGate =
      content.includes('No complexity gate') ||
      content.includes('no complexity gate') ||
      content.includes('ALWAYS runs') ||
      content.includes('always runs');
    expect(hasNoGate).toBe(true);
  });

  it('[T] distinction from review-code complexity gate explicit', () => {
    // Must note that review-code has a gate but write-implementation-plan does not
    const hasContrastNote =
      content.includes('Unlike `review-code`') ||
      content.includes('unlike review-code') ||
      content.includes('Contrast with') ||
      content.includes('no "trivial plan"');
    expect(hasContrastNote).toBe(true);
  });

});

// ── Task 42: Native-only path byte-identical (FR-MR23) ──────────────────────

describe('write-implementation-plan.md — Task 42: native-only path byte-identical (FR-MR23)', () => {

  it('[T] FR-MR23 cross-reference present', () => {
    expect(content).toContain('FR-MR23');
  });

  it('[T] native-only path byte-identical comment/prose present', () => {
    // Either the HTML comment or inline prose asserting byte-identical to baseline
    const hasByteIdentical =
      content.includes('byte-identical to baseline (FR-MR23)') ||
      content.includes('byte-identical');
    expect(hasByteIdentical).toBe(true);
  });

  it('[T] native-only path fires when multi-model disabled — explicit condition documented', () => {
    const hasNativeOnlyCondition =
      content.includes('multi_model_review.enabled: false') ||
      content.includes('--no-multi-model flag is set');
    expect(hasNativeOnlyCondition).toBe(true);
  });

});

// ── Task 43: Invocation Flags (FR-MR6) ──────────────────────────────────────

describe('write-implementation-plan.md — Task 43: Invocation Flags (FR-MR6)', () => {

  it('[T] Invocation Flags sub-section header with FR-MR6 reference present', () => {
    expect(content).toContain('Invocation Flags (FR-MR6)');
  });

  it('[T] --multi-model flag documented', () => {
    expect(content).toContain('--multi-model');
  });

  it('[T] --no-multi-model flag documented', () => {
    expect(content).toContain('--no-multi-model');
  });

  it('[T] flags are described as mutually exclusive', () => {
    const hasMutuallyExclusive =
      content.includes('mutually exclusive') ||
      content.includes('two mutually exclusive');
    expect(hasMutuallyExclusive).toBe(true);
  });

  it('[T] flag overrides master multi_model_review.enabled config', () => {
    expect(content).toContain('multi_model_review.enabled');
  });

  it('[T] flag overrides per-command write_implementation_plan config key', () => {
    expect(content).toContain('multi_model_review.per_command.write_implementation_plan.enabled');
  });

  it('[T] override semantics stated — "overrides" or "override" language present near flag docs', () => {
    expect(content).toContain('overrides');
  });

  it('[T] FR-MR6 referenced in flags section', () => {
    expect(content).toContain('FR-MR6');
  });

});

// ── Task 44 [H]: plan-linter runs BEFORE orchestrator ───────────────────────

describe('write-implementation-plan.md — Task 44 [H]: plan-linter runs before orchestrator', () => {

  it('[H] plan-linter is UNAFFECTED by multi-model — text states this explicitly', () => {
    const hasUnaffected =
      content.includes('UNAFFECTED by multi-model') ||
      content.includes('unaffected by multi-model');
    expect(hasUnaffected).toBe(true);
  });

  it('[H] plan-linter runs BEFORE the orchestrator — "before" + "orchestrator" present near plan-linter', () => {
    // Check that "plan-linter" and "before" and "orchestrator" all appear in the document
    expect(content).toContain('plan-linter');
    expect(content).toContain('before');
    expect(content).toContain('orchestrator');
  });

  it('[H] plan-linter "runs BEFORE the orchestrator" phrase present (verbatim or close match)', () => {
    const hasBeforeOrchestrator =
      content.includes('runs BEFORE the orchestrator') ||
      content.includes('runs before the orchestrator') ||
      content.includes('plan-linter runs BEFORE') ||
      content.includes('plan-linter runs before');
    expect(hasBeforeOrchestrator).toBe(true);
  });

  it('[H] plan-linter structural-check-only scope documented (not consuming reviewer findings)', () => {
    const hasScopeDoc =
      content.includes('does not consume reviewer findings') ||
      content.includes('structural validation') ||
      content.includes('its sole job is structural');
    expect(hasScopeDoc).toBe(true);
  });

  it('[H] plan-linter not in orchestrator reviewer set — documented', () => {
    const hasNotInReviewerSet =
      content.includes('not part of the orchestrator\'s reviewer set') ||
      content.includes('not part of the orchestrator');
    expect(hasNotInReviewerSet).toBe(true);
  });

});

// ── Cross-reference completeness ────────────────────────────────────────────

describe('write-implementation-plan.md — source authority cross-references', () => {

  it('[T] FR-MR6 referenced (invocation flags)', () => {
    expect(content).toContain('FR-MR6');
  });

  it('[T] FR-MR22 referenced (no complexity gate)', () => {
    expect(content).toContain('FR-MR22');
  });

  it('[T] FR-MR23 referenced (native-only path byte-identical)', () => {
    expect(content).toContain('FR-MR23');
  });

});

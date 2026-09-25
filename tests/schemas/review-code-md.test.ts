/**
 * Layer 1: Structural validation tests for the FR-MR21 decision framework
 * in plugins/synthex/commands/review-code.md.
 *
 * Validates all [T] acceptance criteria from Tasks 33a, 33b, 34, 35, 36:
 *   - FR-MR21 8-step decision order present
 *   - Both branch stubs/prose present
 *   - Complexity gate section (Task 34): thresholds, always_escalate_paths, D9 caching
 *   - Invocation flags section (Task 35): --multi-model, --no-multi-model, override semantics
 *   - D21 path-and-reason header spec (Task 36): 3 invariants, literal regex, 2 sub-formats, 6 PRD examples
 *   - Orchestrator invocation prose present (Task 33b): multi-model-review-orchestrator, command:, review-code
 *   - Standing Pool Discovery (Step 1b from multi-model-teams) STILL present (regression)
 *
 * Task 13 (FR-HM5, D17) repoint: review-code.md's Step 1b body, and FR-MR21
 * Steps 4-8 + the Complexity Gate, moved verbatim to
 * plugins/synthex/docs/standing-pool-routing.md and
 * plugins/synthex/docs/multi-model-decision.md respectively, replaced in
 * review-code.md by two-line D17 gates. Assertions on content that moved
 * now read the doc file it moved to instead of review-code.md's `content`.
 * Steps 1-3 (compact gate), the Invocation Flags (FR-MR6), and the D21
 * Path-and-Reason Header Spec all stay in review-code.md unmoved.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REVIEW_CODE_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'review-code.md'
);

const STANDING_POOL_ROUTING_DOC_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'docs', 'standing-pool-routing.md'
);

const MULTI_MODEL_DECISION_DOC_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'docs', 'multi-model-decision.md'
);

const content = readFileSync(REVIEW_CODE_MD_PATH, 'utf-8');
const routingDocContent = readFileSync(STANDING_POOL_ROUTING_DOC_PATH, 'utf-8');
const decisionDocContent = readFileSync(MULTI_MODEL_DECISION_DOC_PATH, 'utf-8');

// ── Regression: Standing Pool Discovery must still be present ────────────────

describe('review-code.md — Standing Pool Discovery regression (Step 1b from multi-model-teams)', () => {

  it('[regression] Step 1b header still present', () => {
    expect(content).toContain('Standing Pool Discovery and Routing (FR-MMT15)');
  });

  it('[regression] standing_pools.enabled conditional gate still documented', () => {
    expect(content).toContain('standing_pools.enabled');
  });

  it('[regression] standing-pool-cleanup agent reference still present (moved to docs/standing-pool-routing.md, Task 13)', () => {
    expect(routingDocContent).toContain('standing-pool-cleanup');
  });

  it('[regression] verbatim FR-MMT17 routing notification still present (moved to docs/standing-pool-routing.md, Task 13)', () => {
    expect(routingDocContent).toContain(
      "Routing to standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });

});

// ── Task 33a: FR-MR21 8-step decision order ──────────────────────────────────

describe('review-code.md — Tasks 33a: FR-MR21 8-step decision order', () => {

  it('[T] FR-MR21 decision framework section header present', () => {
    expect(content).toContain('Multi-Model Review Decision Framework (FR-MR21)');
  });

  it('[T] Steps 1-3: reads multi_model_review config (compact gate, Task 13)', () => {
    expect(content).toContain('Steps 1-3');
    expect(content).toContain('multi_model_review');
  });

  it('[T] Steps 1-3: resolves invocation flags with FR-MR6 reference (compact gate, Task 13)', () => {
    expect(content).toContain('Steps 1-3');
    expect(content).toContain('FR-MR6');
  });

  it('[T] Steps 1-3: native-only branch documented (compact gate, Task 13)', () => {
    expect(content).toContain('Steps 1-3');
    expect(content).toContain('native-only branch');
  });

  it('[T] Step 4: complexity gate referenced (moved to docs/multi-model-decision.md, Task 13)', () => {
    expect(decisionDocContent).toContain('Step 4');
    expect(decisionDocContent).toContain('complexity gate');
  });

  it('[T] Step 5: multi-model branch with orchestrator invocation (moved to docs/multi-model-decision.md, Task 13)', () => {
    expect(decisionDocContent).toContain('Step 5');
    expect(decisionDocContent).toContain('multi-model branch');
  });

  it('[T] Step 6: gate decision cached (D9) (moved to docs/multi-model-decision.md, Task 13)', () => {
    expect(decisionDocContent).toContain('Step 6');
    expect(decisionDocContent).toContain('cached');
    expect(decisionDocContent).toContain('D9');
  });

  it('[T] Step 7: path-and-reason header rendered (D21) (moved to docs/multi-model-decision.md, Task 13)', () => {
    expect(decisionDocContent).toContain('Step 7');
    expect(decisionDocContent).toContain('D21');
  });

  it('[T] Step 8: emit consolidated review (moved to docs/multi-model-decision.md, Task 13)', () => {
    expect(decisionDocContent).toContain('Step 8');
    expect(decisionDocContent).toContain('consolidated review');
  });

  it('[T] native-only branch stub (FR-MR23) present (stays in review-code.md, Task 13)', () => {
    // The native-only comment stub marks where the native path is documented
    expect(content).toContain('native-only path: today\'s review-code logic byte-identical to baseline (FR-MR23)');
  });

  it('[T] the gate that reads docs/multi-model-decision.md for Steps 4-8 is present (D17, Task 13)', () => {
    expect(content).toContain('${CLAUDE_PLUGIN_ROOT}/docs/multi-model-decision.md');
  });

});

// ── Task 33b: Orchestrator invocation prose (moved to docs/multi-model-decision.md, Task 13) ──

describe('review-code.md — Task 33b: orchestrator invocation prose in multi-model branch', () => {

  it('[T] multi-model-review-orchestrator agent referenced by name', () => {
    expect(decisionDocContent).toContain('multi-model-review-orchestrator');
  });

  it('[T] command: "review-code" present in orchestrator input contract', () => {
    expect(decisionDocContent).toContain('command: "review-code"');
  });

  it('[T] artifact_path field documented in orchestrator invocation', () => {
    expect(decisionDocContent).toContain('artifact_path');
  });

  it('[T] native_reviewers field documented in orchestrator invocation', () => {
    expect(decisionDocContent).toContain('native_reviewers');
  });

  it('[T] per_reviewer_timeout_seconds field documented', () => {
    expect(decisionDocContent).toContain('per_reviewer_timeout_seconds');
  });

  it('[T] orchestrator stub marker NOT present (replaced by actual invocation prose in Task 33b)', () => {
    // After Task 33b, the TODO stub must be replaced; assert it is gone
    expect(decisionDocContent).not.toContain('orchestrator invocation: TODO in Task 33b');
  });

  it('[T] FR-MR23 regression reference present (native-only byte-identical; stays in review-code.md, Task 13)', () => {
    expect(content).toContain('FR-MR23');
  });

});

// ── Task 34: Complexity Gate (FR-MR21a) — moved to docs/multi-model-decision.md, Task 13 ────

describe('review-code.md — Task 34: Complexity Gate (FR-MR21a)', () => {

  it('[T] Complexity Gate sub-section header present', () => {
    expect(decisionDocContent).toContain('Complexity Gate (FR-MR21a)');
  });

  it('[T] threshold_lines_changed config key documented', () => {
    expect(decisionDocContent).toContain('threshold_lines_changed');
  });

  it('[T] threshold_files_touched config key documented', () => {
    expect(decisionDocContent).toContain('threshold_files_touched');
  });

  it('[T] always_escalate_paths config key documented', () => {
    expect(decisionDocContent).toContain('always_escalate_paths');
  });

  it('[T] gate decision computed once ("cached") per invocation', () => {
    expect(decisionDocContent).toContain('cached');
  });

  it('[T] D9 reference present for gate-decision caching', () => {
    expect(decisionDocContent).toContain('D9');
  });

  it('[T] ESCALATE language for always_escalate_paths match', () => {
    expect(decisionDocContent).toContain('ESCALATE');
  });

});

// ── Task 35: Invocation Flags (FR-MR6) ──────────────────────────────────────

describe('review-code.md — Task 35: Invocation Flags (FR-MR6)', () => {

  it('[T] Invocation Flags sub-section header present', () => {
    expect(content).toContain('Invocation Flags (FR-MR6)');
  });

  it('[T] --multi-model flag documented', () => {
    expect(content).toContain('--multi-model');
  });

  it('[T] --no-multi-model flag documented', () => {
    expect(content).toContain('--no-multi-model');
  });

  it('[T] flags override master multi_model_review.enabled config', () => {
    expect(content).toContain('multi_model_review.enabled');
  });

  it('[T] flags override per-command config setting', () => {
    expect(content).toContain('multi_model_review.per_command.review_code.enabled');
  });

  it('[T] complexity gate bypassed when --multi-model flag is set', () => {
    // Language should indicate the gate is bypassed by the flag
    const hasGateBypass =
      content.includes('gate is bypassed') ||
      content.includes('gate bypassed') ||
      content.includes('bypass') ||
      content.includes('bypasses');
    expect(hasGateBypass).toBe(true);
  });

  it('[T] mutually exclusive flag semantics documented', () => {
    const hasMutuallyExclusive =
      content.includes('mutually exclusive') ||
      content.includes('two mutually exclusive');
    expect(hasMutuallyExclusive).toBe(true);
  });

});

// ── Task 36: D21 Path-and-Reason Header Spec ─────────────────────────────────

describe('review-code.md — Task 36: D21 path-and-reason header spec', () => {

  it('[T] Path-and-Reason Header Spec (D21) sub-section present', () => {
    expect(content).toContain('Path-and-Reason Header Spec (D21)');
  });

  it('[T] Invariant 1: begins "Review path:" documented', () => {
    expect(content).toContain('Begins `Review path:`');
  });

  it('[T] Invariant 2: parenthetical reason clause documented', () => {
    expect(content).toContain('Parenthetical reason clause');
  });

  it('[T] Invariant 3: reviewers: suffix documented', () => {
    expect(content).toContain('`reviewers:` suffix');
  });

  it('[T] literal D21 regex present verbatim', () => {
    expect(content).toContain(
      'Review path: [^()]+\\([^)]+; reviewers: \\d+ native(?:\\s*[+,]\\s*\\d+ external(?:\\s+\\w+)?)?\\)'
    );
  });

  it('[T] two sub-formats documented: with-externals and native-only', () => {
    expect(content).toContain('N native + M external');
    expect(content).toContain('N native');
  });

  it('[T] failed-externals variant qualifier documented', () => {
    expect(content).toContain('0 external succeeded');
  });

  // Six PRD example renderings (raw-string match)

  it('[T] PRD example 1: multi-model, above-threshold, 2+2', () => {
    expect(content).toContain(
      'Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)'
    );
  });

  it('[T] PRD example 2: multi-model, auth path escalated, 2+3', () => {
    expect(content).toContain(
      'Review path: multi-model (auth path escalated; reviewers: 2 native + 3 external)'
    );
  });

  it('[T] PRD example 3: multi-model, above-threshold, 1+2', () => {
    expect(content).toContain(
      'Review path: multi-model (above-threshold diff; reviewers: 1 native + 2 external)'
    );
  });

  it('[T] PRD example 4: native-only, below-threshold, 2 native', () => {
    expect(content).toContain(
      'Review path: native-only (below-threshold diff; reviewers: 2 native)'
    );
  });

  it('[T] PRD example 5: native-only, --no-multi-model flag, 2 native', () => {
    expect(content).toContain(
      'Review path: native-only (multi-model disabled by --no-multi-model flag; reviewers: 2 native)'
    );
  });

  it('[T] PRD example 6: multi-model, failed-externals variant', () => {
    expect(content).toContain(
      'Review path: multi-model (above-threshold diff; reviewers: 2 native, 0 external succeeded)'
    );
  });

});

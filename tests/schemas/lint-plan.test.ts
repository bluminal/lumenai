/**
 * Layer 1: Parity + retirement tests for Task 45 (FR-HM26).
 *
 * `plugins/synthex/scripts/lint-plan.mjs` replaces the retired `plan-linter`
 * Haiku sub-agent. Its rubric was reconciled from two sources that had never
 * been run against each other before this task:
 *
 *   - `agents/plan-linter.md`'s "Built-in Rubric" (never machine-checked)
 *   - `tests/schemas/implementation-plan.ts` (machine-checked, but only ever
 *     run against synthetic agent-output fixtures, never real docs/plans/*.md)
 *
 * This suite proves the two tools AGREE on every checkable dimension they
 * share, across every real plan in docs/plans/ (including
 * docs/plans/harness-modernization.md itself) plus any `# Implementation
 * Plan:`-shaped fixture under tests/fixtures/. See lint-plan.mjs's header
 * comment for the 14 numbered reconciliation decisions this test file
 * assumes.
 *
 * "Agreement" is checked at two levels:
 *   1. A structural SIGNATURE (top heading / Overview / Decisions / Open
 *      Questions / Phase / Milestone presence, plus Decisions/Open-Questions
 *      /task-table required-column coverage) computed identically from both
 *      tools' output and asserted equal, for every plan fixture — this is
 *      the literal "script and implementation-plan.ts agree" claim.
 *   2. docs/plans/harness-modernization.md specifically (named in the Task
 *      45 acceptance criterion) is asserted fully clean under BOTH tools'
 *      own pass criterion.
 *
 * The script's rubric additions implementation-plan.ts has no opinion on at
 * all (Acceptance Criteria blocks, dependency cross-references, generic
 * phrases) are proven separately via constructed fixtures, the same
 * "detector actually fires" pattern portable-scripts.test.ts and
 * implementation-plan.test.ts already use — there is nothing in the other
 * tool to "agree" or "disagree" with there.
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM26.
 * Plan: docs/plans/harness-modernization.md Task 45.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateImplementationPlanOutput, type ValidationResult } from './implementation-plan.js';
import { AGENT_COUNT } from '../compat/lib/inventory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');
const SCRIPT_PATH = join(PLUGIN_ROOT, 'scripts', 'lint-plan.mjs');
const PLANS_DIR = join(REPO_ROOT, 'docs', 'plans');
const FIXTURES_DIR = join(REPO_ROOT, 'tests', 'fixtures');

// ── Discover plan fixtures ───────────────────────────────────────────────

function isImplementationPlan(text: string): boolean {
  return /^#\s+Implementation Plan:/m.test(text);
}

function walkMarkdown(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
}

// Every docs/plans/*.md file, regardless of template compliance — the
// structural-signature comparison below is meaningful (both tools flag the
// same missing pieces) whether or not the file is actually compliant.
const docsPlansFiles = readdirSync(PLANS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => join(PLANS_DIR, f));

// Any fixture under tests/fixtures/ that is itself a full implementation
// plan document (as opposed to a fragment/snippet fixture).
const fixturePlanFiles: string[] = [];
{
  const candidates: string[] = [];
  walkMarkdown(FIXTURES_DIR, candidates);
  for (const f of candidates) {
    if (isImplementationPlan(readFileSync(f, 'utf8'))) fixturePlanFiles.push(f);
  }
}

const ALL_PLAN_FIXTURES = [...docsPlansFiles, ...fixturePlanFiles];

// ── Runners ───────────────────────────────────────────────────────────────

interface ScriptResult {
  status: number | null;
  report: {
    total_findings: number;
    counts: { CRITICAL: number; HIGH: number; MEDIUM: number };
    findings: Array<{ severity: string; title: string; location: string; rule: string; issue: string; fix: string }>;
    passed: boolean;
  };
}

function runScript(planPath: string): ScriptResult {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, planPath], { encoding: 'utf8' });
  return { status: result.status, report: JSON.parse(result.stdout) };
}

function runValidator(planPath: string): ValidationResult {
  return validateImplementationPlanOutput(readFileSync(planPath, 'utf8'));
}

// ── Structural signature (the shared-check subset) ──────────────────────

interface Signature {
  missingTopHeading: boolean;
  missingOverview: boolean;
  missingDecisions: boolean;
  missingOpenQuestions: boolean;
  missingPhase: boolean;
  missingMilestone: boolean;
  decisionsColumnMissing: boolean;
  openQuestionsColumnMissing: boolean;
  taskTableColumnMissing: boolean;
}

function signatureFromValidator(r: ValidationResult): Signature {
  const has = (pred: (e: string) => boolean) => r.errors.some(pred);
  return {
    missingTopHeading: has((e) => e.startsWith('Missing top heading')),
    missingOverview: has((e) => e === 'Missing required section: "Overview"'),
    missingDecisions: has((e) => e === 'Missing required section: "Decisions"'),
    missingOpenQuestions: has((e) => e === 'Missing required section: "Open Questions"'),
    missingPhase: has((e) => e.startsWith('Missing Phase section')),
    missingMilestone: has((e) => e.startsWith('Missing Milestone section')),
    decisionsColumnMissing: has((e) => e.startsWith('Decisions table missing column')),
    openQuestionsColumnMissing: has((e) => e.startsWith('Open Questions table missing column')),
    taskTableColumnMissing: has((e) => e.includes('Task table in') && e.includes('missing column')),
  };
}

function signatureFromScript(r: ScriptResult): Signature {
  const has = (pred: (f: ScriptResult['report']['findings'][number]) => boolean) => r.report.findings.some(pred);
  return {
    missingTopHeading: has((f) => f.title === 'Missing top-level heading'),
    missingOverview: has((f) => f.title === 'Missing Overview section'),
    missingDecisions: has((f) => f.title === 'Missing Decisions section'),
    missingOpenQuestions: has((f) => f.title === 'Missing Open Questions section'),
    missingPhase: has((f) => f.title === 'No Phase sections'),
    missingMilestone: has((f) => f.title === 'No Milestone sections'),
    decisionsColumnMissing: has((f) => f.rule === 'Cross-Referential: Decisions table column structure'),
    openQuestionsColumnMissing: has((f) => f.rule === 'Cross-Referential: Open Questions table column structure'),
    taskTableColumnMissing: has((f) => f.rule === 'Milestone-Level: task table column structure'),
  };
}

// ── Tier 1: structural-signature agreement across every plan fixture ───────

describe('lint-plan.mjs agrees with implementation-plan.ts (structural signature)', () => {
  it('discovers at least the docs/plans/*.md fixtures', () => {
    expect(docsPlansFiles.length).toBeGreaterThanOrEqual(5);
  });

  describe.each(ALL_PLAN_FIXTURES.map((p) => [p.replace(`${REPO_ROOT}/`, ''), p] as const))('%s', (_relPath, planPath) => {
    it('[T] script and implementation-plan.ts flag the same missing document/milestone/table structure', () => {
      const scriptResult = runScript(planPath);
      const validatorResult = runValidator(planPath);

      expect(signatureFromScript(scriptResult)).toEqual(signatureFromValidator(validatorResult));
    });

    it('produces well-formed JSON with the plan-linter report shape', () => {
      const { report } = runScript(planPath);
      expect(typeof report.total_findings).toBe('number');
      expect(report.total_findings).toBe(report.findings.length);
      expect(report.total_findings).toBe(report.counts.CRITICAL + report.counts.HIGH + report.counts.MEDIUM);
      expect(report.passed).toBe(report.counts.CRITICAL === 0 && report.counts.HIGH === 0);
      for (const f of report.findings) {
        expect(['CRITICAL', 'HIGH', 'MEDIUM']).toContain(f.severity);
        expect(typeof f.title).toBe('string');
        expect(typeof f.location).toBe('string');
        expect(typeof f.rule).toBe('string');
        expect(typeof f.issue).toBe('string');
        expect(typeof f.fix).toBe('string');
      }
    });

    it('exit code matches the CRITICAL/HIGH-findings scheme (0 clean, 2 findings)', () => {
      const { status, report } = runScript(planPath);
      const expected = report.counts.CRITICAL > 0 || report.counts.HIGH > 0 ? 2 : 0;
      expect(status).toBe(expected);
    });
  });
});

// ── Tier 2: docs/plans/harness-modernization.md is fully clean ─────────────

describe('lint-plan.mjs — docs/plans/harness-modernization.md (Task 45 acceptance criterion)', () => {
  const planPath = join(PLANS_DIR, 'harness-modernization.md');

  it('[T] implementation-plan.ts reports it valid (zero errors)', () => {
    const r = runValidator(planPath);
    expect(r.errors).toEqual([]);
  });

  it('[T] lint-plan.mjs reports zero findings and exits 0', () => {
    const { status, report } = runScript(planPath);
    expect(report.findings).toEqual([]);
    expect(status).toBe(0);
  });
});

// ── Known, documented divergence (reconciliation decision #14) ─────────────

describe('lint-plan.mjs — documented divergence: escaped-pipe table cells', () => {
  it('multi-model-review.md: both tools flag the SAME unescaped-pipe-garbled row (agreement on substance)', () => {
    const planPath = join(PLANS_DIR, 'multi-model-review.md');
    const { report } = runScript(planPath);
    const validatorResult = runValidator(planPath);

    const scriptHit = report.findings.find((f) => f.title.includes('invalid complexity'));
    const validatorHit = validatorResult.warnings.find((w) => w.includes('invalid complexity'));
    expect(scriptHit).toBeDefined();
    expect(validatorHit).toBeDefined();
    // Both point at the same garbled cell content (a literal, unescaped `|`
    // inside "superseded_by_verification: true|false" — a real markdown
    // authoring issue in the source plan, not a parser bug).
    expect(scriptHit!.title).toContain('verification_reasoning');
    expect(validatorHit).toContain('verification_reasoning');
  });

  it('harness-modernization.md: lint-plan.mjs correctly unescapes `\\|` where implementation-plan.ts does not (decision #14)', () => {
    const planPath = join(PLANS_DIR, 'harness-modernization.md');
    const { report } = runScript(planPath);
    const validatorResult = runValidator(planPath);

    // The script's escaped-pipe fix means it sees Task 56's real
    // Complexity value ("S") and raises nothing for this row.
    expect(report.findings.some((f) => f.title.includes('invalid complexity'))).toBe(false);
    // implementation-plan.ts's shared, unfixed helper still misreads the
    // same row — this is the one intentional, documented divergence.
    expect(validatorResult.warnings.some((w) => w.includes('invalid complexity'))).toBe(true);
  });
});

// ── Rubric extensions implementation-plan.ts has no equivalent for ─────────
// (ported from plan-linter; proven via constructed fixtures, not real-plan
// parity, since there is nothing in implementation-plan.ts to compare to.)

function withPlan(body: string): string {
  return [
    '# Implementation Plan: Fixture',
    '',
    '## Overview',
    'Fixture.',
    '',
    '## Decisions',
    '',
    '| # | Decision | Context | Rationale |',
    '|---|----------|---------|-----------|',
    '| D1 | x | y | z |',
    '',
    '## Open Questions',
    '',
    '| # | Question | Impact | Status |',
    '|---|----------|--------|--------|',
    '| Q1 | x | y | Open |',
    '',
    '## Phase 1: Example Phase',
    '',
    '### Milestone 1.1: Example Milestone',
    body,
  ].join('\n');
}

function lintText(text: string): ScriptResult['report'] {
  const dir = mkdtempSync(join(tmpdir(), 'lint-plan-fixture-'));
  const file = join(dir, 'plan.md');
  writeFileSync(file, text);
  const result = spawnSync(process.execPath, [SCRIPT_PATH, file], { encoding: 'utf8' });
  return JSON.parse(result.stdout);
}

describe('lint-plan.mjs rubric extensions (fixtures; no implementation-plan.ts equivalent)', () => {
  it('[T] flags a task with no Acceptance Criteria block at all (CRITICAL)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Do the thing | S | None | pending |',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(report.findings.some((f) => f.severity === 'CRITICAL' && f.title.includes('no Acceptance Criteria block'))).toBe(true);
  });

  it('[T] accepts a Task Acceptance Criteria block with at least one typed tag', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Do the thing | S | None | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[T]` The thing works.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(report.findings.some((f) => f.title.includes('Task 1'))).toBe(false);
  });

  it('[T] flags a forward dependency on a task appearing later in the plan (CRITICAL)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Depends on later task | S | Task 2 | pending |',
        '| 2 | Later task | S | None | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[T]` Works.',
        '**Task 2 Acceptance Criteria:** `[T]` Works.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(
      report.findings.some((f) => f.severity === 'CRITICAL' && f.title.includes('forward dependency on Task 2')),
    ).toBe(true);
  });

  it('[T] flags a dependency on a task that does not exist (HIGH)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Depends on nothing real | S | Task 99 | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[T]` Works.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(
      report.findings.some((f) => f.severity === 'HIGH' && f.title.includes('dependency on unknown Task 99')),
    ).toBe(true);
  });

  it('[T] flags a generic, non-specific acceptance criterion (HIGH)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Do the thing | S | None | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[T]` Works correctly.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(report.findings.some((f) => f.severity === 'HIGH' && f.title.includes('generic acceptance criterion'))).toBe(true);
  });

  it('[T] flags an `[O]` criterion placed inside a task block instead of Observational Outcomes (MEDIUM)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Do the thing | S | None | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[T]` Works. `[O]` Adoption improves.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(
      report.findings.some((f) => f.severity === 'MEDIUM' && f.title.includes('[O] criterion inside a task block')),
    ).toBe(true);
  });

  it('does not flag a legitimate all-`[H]` spike task for lacking a `[T]` criterion (decision #9)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Spike | S | None | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[H]` Findings recorded and approved.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Feasibility known.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(report.findings).toEqual([]);
  });

  it('[T] flags a single-value Complexity column that is not S/M/L (HIGH)', () => {
    const text = withPlan(
      [
        '| # | Task | Complexity | Dependencies | Status |',
        '|---|------|-----------|--------------|--------|',
        '| 1 | Do the thing | XL | None | pending |',
        '',
        '**Task 1 Acceptance Criteria:** `[T]` Works.',
        '',
        '**Parallelizable:** None.',
        '**Milestone Value:** Ships the thing.',
      ].join('\n'),
    );
    const report = lintText(text);
    expect(report.findings.some((f) => f.severity === 'HIGH' && f.title.includes('invalid complexity "XL"'))).toBe(true);
  });
});

// ── Retirement (agents −1) ───────────────────────────────────────────────

describe('plan-linter retirement (FR-HM26, Task 45)', () => {
  it('[T] plan-linter agent file no longer exists', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'agents', 'plan-linter.md'))).toBe(false);
  });

  it('[T] plan-linter is absent from plugin.json', () => {
    const pluginJson = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(pluginJson.agents).not.toContain('./agents/plan-linter.md');
    expect((pluginJson.agents as string[]).some((a) => a.includes('plan-linter'))).toBe(false);
  });

  it('[T] plan-linter has no portable-skill wrapper', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'portable-skills', 'plan-linter'))).toBe(false);
  });

  // Not pinned to an exact value: Task 46 (commit-message-author retirement)
  // was concurrent on a sibling branch and moved this further; Task 47
  // (FR-HM24, D11, Phase 6) then folded 3 pool agents in from synthex-plus,
  // raising the ceiling again. Upper bound only — see the coordination note
  // in Task 45's brief; inventory.mjs pins the exact current count.
  // multi-model-review Task 68 added grok-review-prompter (27) and Task 69
  // cursor-review-prompter (28).
  it('[T] agent count reflects the retirement (upper bound)', () => {
    expect(AGENT_COUNT).toBeLessThanOrEqual(28);
  });
});

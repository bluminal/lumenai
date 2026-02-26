/**
 * Layer 1: Schema validation tests for Synthex+ command outputs.
 *
 * Validates cost estimate displays, progress reports, and completion reports
 * against the canonical formats defined in:
 *   plugins/synthex-plus/docs/output-formats.md
 *
 * Tests use inline sample outputs that match the canonical templates.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCostEstimate,
  validateProgressReport,
  validateCompletionReport,
} from './command-output.js';

// ── Sample Outputs ───────────────────────────────────────────────

const VALID_COST_ESTIMATE = `Team cost estimate (approximate):
  Subagent approach (next-priority): ~120,000 tokens
  Team approach (team-implement):    ~888,000 tokens (~7.4x multiplier)

  Note: This is a prompt-based approximation. Actual usage varies
  based on task complexity, tool invocations, and review cycles.

  Proceed with team creation? [Y/n]`;

const VALID_PROGRESS_REPORT = `--- Progress Report ---
Team: milestone-1.2-impl (implementation template)
Tasks: 3/8 completed

Active:
  - Build user authentication flow [Frontend] (in progress)
  - Implement rate limiting middleware [Backend] (in progress)

Blocked:
  - Add payment integration [Backend]: Waiting for Stripe API key from ops team

Estimated remaining: 5 tasks, ~1.5 hours`;

const VALID_COMPLETION_REPORT = `--- Completion Report ---
Team: milestone-1.2-impl (implementation template)
Duration: 47 minutes
Tasks: 8/8 completed

Summary by role:
  Lead: Coordinated task assignment and resolved 2 blockers between Frontend and Backend
  Frontend: Built user auth flow, profile page, and settings components
  Backend: Implemented rate limiting, payment integration, and webhook handler
  Quality: Wrote 34 tests covering all new endpoints and components

Discovered work:
  - Rate limiter needs Redis backend for multi-instance deployments (added to plan)
  - Settings page accessibility audit needed (filed as follow-up)

Files modified:
  - src/components/Auth.tsx
  - src/components/Profile.tsx
  - src/components/Settings.tsx
  - src/middleware/rateLimit.ts
  - src/api/payments.ts
  - src/api/webhooks.ts
  - tests/api/payments.test.ts
  - tests/middleware/rateLimit.test.ts

Quality gates:
  - Code Review: PASS (no findings above medium)
  - Security Review: WARN (2 medium findings documented)
  - Test Coverage: PASS (92% line coverage, threshold 80%)`;

// ── Cost Estimate Tests ──────────────────────────────────────────

describe('Cost Estimate Schema', () => {
  it('passes full schema validation for canonical format', () => {
    const result = validateCostEstimate(VALID_COST_ESTIMATE);
    expect(result.errors, `Errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has zero warnings for canonical format', () => {
    const result = validateCostEstimate(VALID_COST_ESTIMATE);
    expect(result.warnings).toEqual([]);
  });

  it('detects approximate labeling', () => {
    const result = validateCostEstimate(VALID_COST_ESTIMATE);
    expect(result.errors.some(e => e.includes('approximate'))).toBe(false);
  });

  it('detects subagent approach line', () => {
    const result = validateCostEstimate(VALID_COST_ESTIMATE);
    expect(result.errors.some(e => e.includes('subagent'))).toBe(false);
  });

  it('detects team approach line with multiplier', () => {
    const result = validateCostEstimate(VALID_COST_ESTIMATE);
    expect(result.errors.some(e => e.includes('team approach'))).toBe(false);
    expect(result.errors.some(e => e.includes('multiplier'))).toBe(false);
  });

  it('detects user confirmation prompt', () => {
    const result = validateCostEstimate(VALID_COST_ESTIMATE);
    expect(result.errors.some(e => e.includes('confirmation'))).toBe(false);
  });

  it('rejects empty text', () => {
    const result = validateCostEstimate('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects text without header', () => {
    const bad = `Subagent approach (next-priority): ~120,000 tokens
Team approach (team-implement): ~888,000 tokens (~7.4x multiplier)
Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Team cost estimate'))).toBe(true);
  });

  it('rejects text without approximate labeling', () => {
    const bad = `Team cost estimate:
  Subagent approach (next-priority): ~120,000 tokens
  Team approach (team-implement): ~888,000 tokens (~7.4x multiplier)
  Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('approximate'))).toBe(true);
  });

  it('rejects text without subagent approach line', () => {
    const bad = `Team cost estimate (approximate):
  Team approach (team-implement): ~888,000 tokens (~7.4x multiplier)
  Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('subagent approach') || e.includes('Subagent approach'))).toBe(true);
  });

  it('rejects text without team approach line', () => {
    const bad = `Team cost estimate (approximate):
  Subagent approach (next-priority): ~120,000 tokens
  Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /team approach/i.test(e))).toBe(true);
  });

  it('rejects text without multiplier', () => {
    const bad = `Team cost estimate (approximate):
  Subagent approach (next-priority): ~120,000 tokens
  Team approach (team-implement): ~888,000 tokens
  Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('multiplier'))).toBe(true);
  });

  it('rejects text without confirmation prompt', () => {
    const bad = `Team cost estimate (approximate):
  Subagent approach (next-priority): ~120,000 tokens
  Team approach (team-implement): ~888,000 tokens (~7.4x multiplier)`;
    const result = validateCostEstimate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('confirmation'))).toBe(true);
  });

  it('warns when subagent command name is missing from parentheses', () => {
    const noCommandName = `Team cost estimate (approximate):
  Subagent approach: ~120,000 tokens
  Team approach (team-implement): ~888,000 tokens (~7.4x multiplier)
  Note: This is a prompt-based approximation. Actual usage varies.
  Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(noCommandName);
    expect(result.valid).toBe(true); // valid but with warnings
    expect(result.warnings.some(w => w.includes('fallback command'))).toBe(true);
  });

  it('accepts alternative confirmation prompt format', () => {
    const altPrompt = `Team cost estimate (approximate):
  Subagent approach (next-priority): ~120,000 tokens
  Team approach (team-implement): ~888,000 tokens (~7.4x multiplier)
  Note: This is a prompt-based approximation. Actual usage varies.
  Proceed with team creation?`;
    const result = validateCostEstimate(altPrompt);
    expect(result.valid).toBe(true);
  });

  it('accepts integer multiplier format (e.g., 3x)', () => {
    const intMultiplier = `Team cost estimate (approximate):
  Subagent approach (next-priority): ~60,000 tokens
  Team approach (team-implement): ~180,000 tokens (3x multiplier)
  Note: Actual usage varies.
  Proceed with team creation? [Y/n]`;
    const result = validateCostEstimate(intMultiplier);
    expect(result.valid).toBe(true);
  });
});

// ── Progress Report Tests ────────────────────────────────────────

describe('Progress Report Schema', () => {
  it('passes full schema validation for canonical format', () => {
    const result = validateProgressReport(VALID_PROGRESS_REPORT);
    expect(result.errors, `Errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has zero warnings for canonical format', () => {
    const result = validateProgressReport(VALID_PROGRESS_REPORT);
    expect(result.warnings).toEqual([]);
  });

  it('detects team identification', () => {
    const result = validateProgressReport(VALID_PROGRESS_REPORT);
    expect(result.errors.some(e => e.includes('team identification'))).toBe(false);
  });

  it('detects tasks summary', () => {
    const result = validateProgressReport(VALID_PROGRESS_REPORT);
    expect(result.errors.some(e => e.includes('tasks summary'))).toBe(false);
  });

  it('rejects empty text', () => {
    const result = validateProgressReport('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects text without Progress Report header', () => {
    const bad = `Team: test-team (implementation template)
Tasks: 2/5 completed
Active:
  - Some task [Backend] (in progress)`;
    const result = validateProgressReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Progress Report'))).toBe(true);
  });

  it('rejects text without team line', () => {
    const bad = `--- Progress Report ---
Tasks: 2/5 completed
Active:
  - Some task [Backend] (in progress)
Estimated remaining: 3 tasks`;
    const result = validateProgressReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('team identification'))).toBe(true);
  });

  it('rejects text without tasks summary', () => {
    const bad = `--- Progress Report ---
Team: test-team (implementation template)
Active:
  - Some task [Backend] (in progress)
Estimated remaining: 3 tasks`;
    const result = validateProgressReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tasks summary'))).toBe(true);
  });

  it('rejects tasks summary where completed exceeds total', () => {
    const bad = `--- Progress Report ---
Team: test-team (implementation template)
Tasks: 10/5 completed
Active:
  - Some task [Backend] (in progress)
Estimated remaining: none`;
    const result = validateProgressReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds total'))).toBe(true);
  });

  it('warns when template name is missing from team line', () => {
    const noTemplate = `--- Progress Report ---
Team: test-team
Tasks: 2/5 completed
Active:
  - Some task [Backend] (in progress)
Estimated remaining: 3 tasks`;
    const result = validateProgressReport(noTemplate);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('template name'))).toBe(true);
  });

  it('warns when Active section is missing', () => {
    const noActive = `--- Progress Report ---
Team: test-team (implementation template)
Tasks: 5/5 completed
Estimated remaining: none`;
    const result = validateProgressReport(noActive);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('Active'))).toBe(true);
  });

  it('warns when estimated remaining is missing', () => {
    const noEstimate = `--- Progress Report ---
Team: test-team (implementation template)
Tasks: 2/5 completed
Active:
  - Some task [Backend] (in progress)`;
    const result = validateProgressReport(noEstimate);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('Estimated remaining'))).toBe(true);
  });

  it('warns when role annotations are missing', () => {
    const noRoles = `--- Progress Report ---
Team: test-team (implementation template)
Tasks: 2/5 completed
Active:
  - Some task (in progress)
  - Another task (in progress)
Estimated remaining: 3 tasks`;
    const result = validateProgressReport(noRoles);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('role annotations'))).toBe(true);
  });

  it('accepts progress report without Blocked section (per display rules)', () => {
    const noBlocked = `--- Progress Report ---
Team: test-team (implementation template)
Tasks: 2/5 completed

Active:
  - Build auth [Frontend] (in progress)
  - Write tests [Quality] (in progress)

Estimated remaining: 3 tasks, ~1 hour`;
    const result = validateProgressReport(noBlocked);
    expect(result.valid).toBe(true);
    // No error for missing Blocked section -- it is optional
    expect(result.errors).toEqual([]);
  });

  it('validates Blocked section blocker reasons when present', () => {
    const blockedNoReason = `--- Progress Report ---
Team: test-team (implementation template)
Tasks: 2/5 completed

Active:
  - Build auth [Frontend] (in progress)

Blocked:
  - Payment integration (waiting)

Estimated remaining: 3 tasks`;
    const result = validateProgressReport(blockedNoReason);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('blocker reasons'))).toBe(true);
  });
});

// ── Completion Report Tests ──────────────────────────────────────

describe('Completion Report Schema', () => {
  it('passes full schema validation for canonical format', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.errors, `Errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has zero warnings for canonical format', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.warnings).toEqual([]);
  });

  it('detects Completion Report header', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.errors.some(e => e.includes('Completion Report'))).toBe(false);
  });

  it('detects team identification', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.errors.some(e => e.includes('team identification'))).toBe(false);
  });

  it('detects duration line', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.errors.some(e => e.includes('duration'))).toBe(false);
  });

  it('detects tasks summary', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.errors.some(e => e.includes('tasks summary'))).toBe(false);
  });

  it('detects summary by role section', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.errors.some(e => e.includes('Summary by role'))).toBe(false);
  });

  it('rejects empty text', () => {
    const result = validateCompletionReport('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects text without Completion Report header', () => {
    const bad = `Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Completion Report'))).toBe(true);
  });

  it('rejects text without team line', () => {
    const bad = `--- Completion Report ---
Duration: 30 minutes
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('team identification'))).toBe(true);
  });

  it('rejects text without duration line', () => {
    const bad = `--- Completion Report ---
Team: test-team (implementation template)
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('duration'))).toBe(true);
  });

  it('rejects text without tasks summary', () => {
    const bad = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tasks summary'))).toBe(true);
  });

  it('rejects tasks summary where completed exceeds total', () => {
    const bad = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 12/5 completed
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds total'))).toBe(true);
  });

  it('rejects text without summary by role section', () => {
    const bad = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 5/5 completed`;
    const result = validateCompletionReport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Summary by role'))).toBe(true);
  });

  it('warns when template name is missing from team line', () => {
    const noTemplate = `--- Completion Report ---
Team: test-team
Duration: 30 minutes
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(noTemplate);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('template name'))).toBe(true);
  });

  it('warns when files modified section is missing', () => {
    const noFiles = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything`;
    const result = validateCompletionReport(noFiles);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('Files modified'))).toBe(true);
  });

  it('accepts completion report without discovered work (per display rules)', () => {
    const noDiscoveredWork = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 5/5 completed

Summary by role:
  Lead: Coordinated everything
  Frontend: Built components

Files modified:
  - src/components/Auth.tsx`;
    const result = validateCompletionReport(noDiscoveredWork);
    expect(result.valid).toBe(true);
    // No error for missing Discovered work -- it is optional
    expect(result.errors).toEqual([]);
  });

  it('accepts completion report without quality gates (per display rules)', () => {
    const noGates = `--- Completion Report ---
Team: planning-sprint-3 (planning template)
Duration: 22 minutes
Tasks: 4/4 completed

Summary by role:
  Lead: Facilitated planning and resolved scope questions
  PM: Drafted requirements and acceptance criteria

Files modified:
  - docs/reqs/sprint-3.md
  - docs/plans/sprint-3.md`;
    const result = validateCompletionReport(noGates);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validates quality gate verdicts when present', () => {
    const badGates = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything
Quality gates:
  - Code Review: looks good
  - Security Review: no issues`;
    const result = validateCompletionReport(badGates);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('verdict') && w.includes('PASS/WARN/FAIL'))).toBe(true);
  });

  it('warns when discovered work section is present but empty', () => {
    const emptyDiscovered = `--- Completion Report ---
Team: test-team (implementation template)
Duration: 30 minutes
Tasks: 5/5 completed
Summary by role:
  Lead: Coordinated everything
Discovered work:
Files modified:
  - src/index.ts`;
    const result = validateCompletionReport(emptyDiscovered);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('Discovered work') && w.includes('no items'))).toBe(true);
  });

  it('validates full completion report with all optional sections', () => {
    const result = validateCompletionReport(VALID_COMPLETION_REPORT);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// ── Cross-cutting Tests ──────────────────────────────────────────

describe('Cross-cutting validation', () => {
  it('all validators reject completely unrelated text', () => {
    const unrelated = 'The quick brown fox jumps over the lazy dog.';
    expect(validateCostEstimate(unrelated).valid).toBe(false);
    expect(validateProgressReport(unrelated).valid).toBe(false);
    expect(validateCompletionReport(unrelated).valid).toBe(false);
  });

  it('validators do not crash on undefined-like input', () => {
    const weirdInputs = ['', '   ', '\n\n\n', '---'];
    for (const input of weirdInputs) {
      expect(() => validateCostEstimate(input)).not.toThrow();
      expect(() => validateProgressReport(input)).not.toThrow();
      expect(() => validateCompletionReport(input)).not.toThrow();
    }
  });

  it('cost estimate validator does not false-positive on progress report', () => {
    const result = validateCostEstimate(VALID_PROGRESS_REPORT);
    expect(result.valid).toBe(false);
  });

  it('progress report validator does not false-positive on completion report', () => {
    // Completion report has "Team:" and "Tasks:" which might partially match,
    // but it lacks "Progress Report" header, so it should fail
    const result = validateProgressReport(VALID_COMPLETION_REPORT);
    expect(result.valid).toBe(false);
  });

  it('completion report validator does not false-positive on progress report', () => {
    // Progress report lacks "Completion Report", "Duration:", and "Summary by role"
    const result = validateCompletionReport(VALID_PROGRESS_REPORT);
    expect(result.valid).toBe(false);
  });
});

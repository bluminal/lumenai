/**
 * Layer 1: Schema validation tests for Retrospective Facilitator output.
 *
 * Validates structural compliance against the Retrospective Document
 * format defined in retrospective-facilitator.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateRetrospectiveOutput } from './retrospective-facilitator.js';
import {
  parseMarkdownOutput,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadRetroSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('retrospective-facilitator--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('retrospective-facilitator--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Retrospective Facilitator Schema', () => {
  const snapshots = loadRetroSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateRetrospectiveOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('contains retrospective-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('retrospective') ||
            lower.includes('improvement') ||
            lower.includes('retro')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Retrospective output parser', () => {
  const sampleOutput = `## Retrospective: Phase 1 — Foundation

### Date: 2026-02-14
### Scope: Phase 1, Milestones 1.1-1.3 (Jan 15 - Feb 14)

---

### Previous Improvement Items Follow-Up

| Improvement Item | Owner | Due Date | Status | Notes |
|-----------------|-------|----------|--------|-------|
| Add pre-commit hooks for linting | Tech Lead | Feb 1 | Done | Husky + lint-staged configured |
| Create test factories for user data | Quality Engineer | Feb 7 | In Progress | 60% complete, factory for orders still missing |
| Document API error codes | Technical Writer | Feb 14 | Not Started | Deprioritized due to scope change |

**Follow-through rate:** 1 of 3 items completed (33%)

⚠️ **Recurring unaddressed items:** "Document API error codes" has appeared in 2 consecutive retrospectives without resolution.

---

### Planned vs. Actual Analysis

#### Execution Summary
| Metric | Planned | Actual | Variance |
|--------|---------|--------|----------|
| Tasks completed | 12 | 10 | -2 |
| Milestone on schedule | Yes | Late by 3 days | Late |
| Unplanned work | 0 | 3 | Discovery: 2 tasks added during implementation |

#### Estimation Accuracy
| Complexity Grade | Count | Accurate | Underestimated | Overestimated |
|-----------------|-------|----------|---------------|--------------|
| S (Small) | 5 | 4 | 1 | 0 |
| M (Medium) | 5 | 2 | 3 | 0 |
| L (Large) | 2 | 1 | 1 | 0 |

#### Blocked Tasks
| Task | Blocker | Duration Blocked | Resolution |
|------|---------|-----------------|------------|
| Implement OAuth2 | Missing API credentials from provider | 4 days | Escalated to PM, credentials obtained |
| Database migration | Schema conflict with another team | 2 days | Resolved via coordination meeting |

---

### Start / Stop / Continue

### Start (things we should begin doing)
| Item | Why | Priority |
|------|-----|----------|
| Add performance budgets to CI | Bundle size grew 40% this phase without detection | P2 |
| Run integration tests before merging | Two integration issues caught after merge | P1 |

### Stop (things we should stop doing)
| Item | Why | Priority |
|------|-----|----------|
| Manual deployment to staging | Error-prone, took 30 min each time, caused 2 staging outages | P1 |
| Skipping code review for "small changes" | Two bugs this phase were in "small" unreviewed changes | P2 |

### Continue (things we should keep doing)
| Item | Why | Evidence |
|------|-----|---------|
| Pair programming on complex tasks | Led to better designs and fewer bugs in auth module | Zero rework on paired tasks vs 3 rework cycles on solo tasks |
| Weekly architecture sync | Caught the schema conflict early (2 days blocked vs. potentially weeks) | Conflict detected in week 2 of 4 |

---

### Quantitative Insights
DORA metrics for this phase (from Metrics Analyst):
- Deployment frequency: 3.2/week (up from 2.1)
- Lead time: 3.5 days (down from 5.2)
- Change failure rate: 15% (stable)
- MTTR: 4 hours (down from 8)

---

### Pattern Recognition

#### Recurring Themes
| Theme | Occurrences | Trend | Root Cause Hypothesis |
|-------|------------|-------|---------------------|
| Medium tasks underestimated | 3 retros | Worsening | "Medium" is being used as a default; tasks should be broken down further |
| Blocked by external dependencies | 2 retros | Stable | No standard process for requesting external access/credentials |

#### Systemic Issues
The estimation accuracy pattern for Medium tasks suggests the team needs better task decomposition practices. A "Medium" that hides 3 sub-tasks is actually a Large.

---

### Improvement Items

#### Improvement 1: Automate Staging Deployment
- **Action:** Set up CI/CD pipeline for automated staging deployment on merge to develop branch
- **Owner:** Tech Lead
- **Due date:** End of Phase 2, Milestone 2.1
- **Success metric:** Zero manual staging deployments; deployment time < 5 minutes
- **Priority:** P1

#### Improvement 2: Break Down Medium Tasks
- **Action:** Add a "decomposition check" step to planning: any task estimated as M must be broken into 2+ sub-tasks with individual estimates. If sub-tasks add up to > M, re-estimate as L.
- **Owner:** Product Manager + Tech Lead
- **Due date:** Start of Phase 2 planning
- **Success metric:** Medium task estimation accuracy improves from 40% to 70%
- **Priority:** P2

---

### Celebration
- Successfully shipped the full authentication module with zero security findings from the Security Reviewer
- The team's first fully automated test suite — 97% coverage on the epoch conversion logic is impressive for a new project`;

  it('detects retrospective content', () => {
    expect(sampleOutput).toMatch(/retrospective/i);
  });

  it('has Previous Improvement Items section with table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Previous Improvement Items');
    expect(section).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('previous') ||
      t.sectionTitle.toLowerCase().includes('follow')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Status');
  });

  it('has follow-through rate', () => {
    expect(sampleOutput).toMatch(/follow-through rate.*\d+.*of.*\d+/i);
  });

  it('has Planned vs. Actual section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Planned vs. Actual')).toBeDefined();
  });

  it('has Start/Stop/Continue format sections', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Start')).toBeDefined();
    expect(findSection(parsed.sections, 'Stop')).toBeDefined();
    expect(findSection(parsed.sections, 'Continue')).toBeDefined();
  });

  it('has Improvement Items section with max 3 items', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Improvement Items');
    expect(section).toBeDefined();
    expect(section!.subsections.length).toBeLessThanOrEqual(3);
  });

  it('improvement items have required fields', () => {
    expect(sampleOutput).toMatch(/\*\*Action:\*\*/);
    expect(sampleOutput).toMatch(/\*\*Owner:\*\*/);
    expect(sampleOutput).toMatch(/\*\*Due date:\*\*/);
    expect(sampleOutput).toMatch(/\*\*Success metric:\*\*/);
  });

  it('has Celebration section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Celebration')).toBeDefined();
  });

  it('has Pattern Recognition section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Pattern Recognition')).toBeDefined();
  });

  it('flags recurring unaddressed items', () => {
    expect(sampleOutput).toMatch(/recurring unaddressed items/i);
  });

  it('uses blameless language', () => {
    const blamePatterns = /\b(he|she)\s+(failed|forgot|missed|should have)\b/i;
    expect(blamePatterns.test(sampleOutput)).toBe(false);
  });

  it('passes schema validation', () => {
    const result = validateRetrospectiveOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

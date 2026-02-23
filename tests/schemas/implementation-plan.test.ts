/**
 * Layer 1: Schema validation tests for Implementation Plan output.
 *
 * Validates structural compliance against the template defined in
 * product-manager.md and write-implementation-plan.md (lines 212-251).
 */

import { describe, it, expect } from 'vitest';
import { validateImplementationPlanOutput } from './implementation-plan.js';
import { parseMarkdownOutput, findSection } from './helpers.js';

// ── Unit tests with inline sample ────────────────────────────────

describe('Implementation Plan Schema', () => {
  const samplePlan = `# Implementation Plan: API Key Manager

## Overview
A CLI tool for managing API keys across AWS, GCP, and Azure. Based on the PRD at docs/reqs/main.md.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | TypeScript for CLI | Team expertise and type safety | Existing Node.js tooling, strong type system for API contracts |
| D2 | SQLite for local storage | Need local key metadata storage | Zero-config, no external dependencies, portable |
| D3 | Plugin architecture for providers | Multiple cloud providers needed | Allows adding providers without modifying core |

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | Should we support custom providers? | Affects plugin API design | Open |
| Q2 | What encryption algorithm for at-rest storage? | Security architecture | Open |

## Phase 1: Foundation — Delivers Core CLI and Single Provider

### Milestone 1.1: Project Scaffolding
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 1 | Initialize TypeScript project with ESLint, Prettier | S | None | pending |
| 2 | Set up CLI framework (Commander.js) | S | None | pending |
| 3 | Create SQLite storage layer | M | None | pending |
| 4 | Design provider plugin interface | M | None | pending |

**Parallelizable:** Tasks 1-4 can all run concurrently.
**Milestone Value:** Developer can run the CLI and see help output. Storage and plugin interfaces are defined.

### Milestone 1.2: AWS Provider
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 5 | Implement AWS IAM key listing | M | Task 4 | pending |
| 6 | Implement AWS key rotation | L | Task 5 | pending |
| 7 | Add rotation scheduling | M | Task 3, Task 6 | pending |

**Parallelizable:** Task 5 depends on Task 4. Tasks 6 and 7 are sequential.
**Milestone Value:** User can list, rotate, and schedule rotation for AWS IAM keys.

## Phase 2: Multi-Provider — Delivers GCP and Azure Support

### Milestone 2.1: GCP Provider
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 8 | Implement GCP service account key management | L | Task 4 | pending |
| 9 | Add GCP-specific rotation policies | M | Task 8 | pending |

**Parallelizable:** Tasks 8-9 are sequential but independent of Phase 1 Milestone 1.2 tasks.
**Milestone Value:** User can manage GCP service account keys alongside AWS keys.`;

  it('passes full schema validation', () => {
    const result = validateImplementationPlanOutput(samplePlan);
    expect(result.errors, `Errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has correct top-level heading', () => {
    expect(samplePlan).toMatch(/^# Implementation Plan:/m);
  });

  it('has Overview section', () => {
    const parsed = parseMarkdownOutput(samplePlan);
    expect(findSection(parsed.sections, 'Overview')).toBeDefined();
  });

  it('has Decisions section with table', () => {
    const parsed = parseMarkdownOutput(samplePlan);
    const decisionsSection = findSection(parsed.sections, 'Decisions');
    expect(decisionsSection).toBeDefined();

    const decisionsTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('decisions')
    );
    expect(decisionsTable).toBeDefined();
    expect(decisionsTable!.headers).toContain('#');
    expect(decisionsTable!.headers).toContain('Decision');
    expect(decisionsTable!.headers).toContain('Context');
    expect(decisionsTable!.headers).toContain('Rationale');
    expect(decisionsTable!.rows.length).toBeGreaterThan(0);
  });

  it('has Open Questions section with table', () => {
    const parsed = parseMarkdownOutput(samplePlan);
    const questionsSection = findSection(parsed.sections, 'Open Questions');
    expect(questionsSection).toBeDefined();

    const questionsTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('open questions')
    );
    expect(questionsTable).toBeDefined();
    expect(questionsTable!.headers).toContain('#');
    expect(questionsTable!.headers).toContain('Question');
    expect(questionsTable!.headers).toContain('Impact');
    expect(questionsTable!.headers).toContain('Status');
  });

  it('has Phase sections', () => {
    expect(samplePlan).toMatch(/^## Phase \d+/m);
  });

  it('has Milestone sections', () => {
    expect(samplePlan).toMatch(/^### Milestone \d+\.\d+/m);
  });

  it('task tables have correct columns', () => {
    const parsed = parseMarkdownOutput(samplePlan);
    const taskTables = parsed.tables.filter(t =>
      t.sectionTitle.toLowerCase().includes('milestone')
    );
    expect(taskTables.length).toBeGreaterThan(0);

    for (const table of taskTables) {
      expect(table.headers).toContain('#');
      expect(table.headers).toContain('Task');
      expect(table.headers).toContain('Complexity');
      expect(table.headers).toContain('Dependencies');
      expect(table.headers).toContain('Status');
    }
  });

  it('complexity values are S, M, or L', () => {
    const parsed = parseMarkdownOutput(samplePlan);
    const taskTables = parsed.tables.filter(t =>
      t.sectionTitle.toLowerCase().includes('milestone')
    );

    for (const table of taskTables) {
      const complexityIdx = table.headers.indexOf('Complexity');
      expect(complexityIdx).toBeGreaterThanOrEqual(0);

      for (const row of table.rows) {
        expect(['S', 'M', 'L']).toContain(row[complexityIdx].trim());
      }
    }
  });

  it('has Parallelizable callouts', () => {
    expect(samplePlan).toContain('**Parallelizable:**');
  });

  it('has Milestone Value callouts', () => {
    expect(samplePlan).toContain('**Milestone Value:**');
  });
});

// ── Negative tests (invalid plans) ──────────────────────────────

describe('Implementation Plan Schema — invalid inputs', () => {
  it('rejects output without top heading', () => {
    const bad = `## Overview\nSome text\n## Phase 1: Stuff\n### Milestone 1.1: Things`;
    const result = validateImplementationPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing top heading: expected "# Implementation Plan: [Product Name]"');
  });

  it('rejects output without Decisions section', () => {
    const bad = `# Implementation Plan: Test\n## Overview\nText\n## Open Questions\n| # | Question | Impact | Status |\n|---|----------|--------|--------|\n## Phase 1: X\n### Milestone 1.1: Y\n| # | Task | Complexity | Dependencies | Status |\n|---|------|-----------|--------------|--------|\n| 1 | Do thing | S | None | pending |\n**Parallelizable:** None\n**Milestone Value:** Something`;
    const result = validateImplementationPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Decisions'))).toBe(true);
  });

  it('rejects output without Phase sections', () => {
    const bad = `# Implementation Plan: Test\n## Overview\nText\n## Decisions\n| # | Decision | Context | Rationale |\n|---|----------|---------|----------|\n## Open Questions\n| # | Question | Impact | Status |\n|---|----------|--------|--------|`;
    const result = validateImplementationPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Phase'))).toBe(true);
  });
});

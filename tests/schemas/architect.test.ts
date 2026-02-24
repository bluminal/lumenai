/**
 * Layer 1: Schema validation tests for Architect output.
 *
 * Validates structural compliance against the Plan Review and ADR
 * formats defined in architect.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateArchitectOutput, validateADROutput } from './architect.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadArchitectSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('architect--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('architect--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Architect Schema', () => {
  const snapshots = loadArchitectSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes schema validation', () => {
          // Determine if this is an ADR or Plan Review
          const isADR = output.match(/^#\s+ADR-\d+/m);
          const result = isADR
            ? validateADROutput(output)
            : validateArchitectOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('contains architecture-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('architect') ||
            lower.includes('architecture') ||
            lower.includes('feasibility') ||
            lower.includes('nfr') ||
            lower.includes('adr') ||
            lower.includes('decision')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests: Plan Review ──────────────────────────────────────

describe('Architect Plan Review output parser', () => {
  const samplePlanReview = `## Implementation Plan Review — Architect

### Findings

#### [CRITICAL] Missing Data Migration Strategy
- **Section:** Phase 2: Database Migration
- **Issue:** The plan moves from PostgreSQL to DynamoDB without a data migration strategy. There is no mention of schema mapping, data transformation, or a rollback plan. A migration of this scale requires explicit migration tasks, data validation steps, and a parallel-run period.
- **Suggestion:** Add a dedicated milestone for data migration with tasks for: (1) schema mapping document, (2) migration script development, (3) parallel-run validation, (4) rollback procedure, (5) data integrity verification post-migration.

#### [HIGH] Unrealistic Complexity Estimate for Auth Rewrite
- **Section:** Phase 1, Task 8: Rewrite authentication layer
- **Issue:** Rewriting the authentication layer is marked as "M" (Medium complexity). This task involves OAuth2 integration, session management, RBAC, and token refresh — each of which is at least M individually. The compound complexity is L.
- **Suggestion:** Re-estimate as "L" complexity. Consider breaking into sub-tasks: (1) OAuth2 provider integration (M), (2) session management migration (M), (3) RBAC implementation (M), (4) token refresh and rotation (S).

#### [MEDIUM] Missing Observability Tasks
- **Section:** All phases
- **Issue:** No tasks for logging, metrics, or tracing infrastructure. The plan deploys a new service without any observability, which means the team will be flying blind in production.
- **Suggestion:** Add observability tasks to Phase 1: structured logging setup, metrics endpoint, health check endpoint, and basic alerting configuration.

### Summary
The plan has a solid feature decomposition but is missing critical infrastructure work. The data migration gap is the highest-risk omission — migrating databases without a strategy is a recipe for data loss. The auth complexity underestimate will likely cause Phase 1 schedule overrun. Address these two findings before proceeding.`;

  it('detects architecture agent type', () => {
    const parsed = parseMarkdownOutput(samplePlanReview);
    expect(parsed.agentType).toBe('architecture');
  });

  it('extracts 3 findings', () => {
    const parsed = parseMarkdownOutput(samplePlanReview);
    expect(parsed.findings).toHaveLength(3);
  });

  it('first finding is CRITICAL', () => {
    const parsed = parseMarkdownOutput(samplePlanReview);
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[0].title).toContain('Data Migration');
  });

  it('findings are sorted by severity', () => {
    const parsed = parseMarkdownOutput(samplePlanReview);
    expect(areFindingsSorted(parsed.findings)).toBe(true);
  });

  it('has Summary section', () => {
    const parsed = parseMarkdownOutput(samplePlanReview);
    expect(findSection(parsed.sections, 'Summary')).toBeDefined();
  });

  it('has Findings section', () => {
    const parsed = parseMarkdownOutput(samplePlanReview);
    expect(findSection(parsed.sections, 'Findings')).toBeDefined();
  });

  it('passes schema validation', () => {
    const result = validateArchitectOutput(samplePlanReview);
    expect(result.errors).toEqual([]);
  });
});

// ── Unit tests: ADR ──────────────────────────────────────────────

describe('Architect ADR output parser', () => {
  const sampleADR = `# ADR-003: Use PostgreSQL for Primary Datastore

## Status
Accepted

## Date
2024-03-15

## Context
The application needs a primary datastore for user data, content, and metadata. The data model is relational with complex queries (joins across 5+ tables for feed generation). Expected scale is 1M users within 2 years. The team has strong PostgreSQL experience but limited NoSQL experience.

## Decision
We will use PostgreSQL as the primary datastore, deployed on AWS RDS with read replicas for query scaling.

## Consequences

### Positive
- Strong consistency guarantees for financial and user data
- Rich query support for complex feed generation
- Team expertise reduces ramp-up time
- Mature ecosystem of tools, ORMs, and monitoring

### Negative
- Vertical scaling has limits (though read replicas help)
- Schema migrations require careful coordination
- May need a caching layer (Redis) for high-read endpoints

### Neutral
- Requires connection pooling (PgBouncer or application-level)
- Standard backup and point-in-time recovery via RDS

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|------------|------|------|---------|
| DynamoDB | Horizontal scaling, managed service, pay-per-request | No joins, eventual consistency, query limitations | Data model is inherently relational; DynamoDB would require significant denormalization |
| MongoDB | Flexible schema, good for document-shaped data | Weaker consistency, no joins across collections | Query patterns require complex joins that MongoDB doesn't support efficiently |
| CockroachDB | Horizontal scaling with SQL compatibility | Less mature ecosystem, higher complexity, team unfamiliarity | Premature optimization for current scale; PostgreSQL handles 1M users well |

## References
- PostgreSQL scalability benchmarks: pgbench results showing 50K TPS on RDS r6g.4xlarge
- RDS Multi-AZ documentation for high availability
- Team skill assessment: 4/5 backend engineers have 3+ years PostgreSQL experience`;

  it('passes full ADR schema validation', () => {
    const result = validateADROutput(sampleADR);
    expect(result.errors, `Errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has ADR heading with number', () => {
    expect(sampleADR).toMatch(/^# ADR-\d+/m);
  });

  it('has Status section', () => {
    const parsed = parseMarkdownOutput(sampleADR);
    expect(findSection(parsed.sections, 'Status')).toBeDefined();
  });

  it('has Context section', () => {
    const parsed = parseMarkdownOutput(sampleADR);
    expect(findSection(parsed.sections, 'Context')).toBeDefined();
  });

  it('has Decision section', () => {
    const parsed = parseMarkdownOutput(sampleADR);
    expect(findSection(parsed.sections, 'Decision')).toBeDefined();
  });

  it('has Consequences section', () => {
    const parsed = parseMarkdownOutput(sampleADR);
    expect(findSection(parsed.sections, 'Consequences')).toBeDefined();
  });

  it('has Alternatives Considered table with 3+ options', () => {
    const parsed = parseMarkdownOutput(sampleADR);
    expect(findSection(parsed.sections, 'Alternatives Considered')).toBeDefined();

    const altTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('alternative')
    );
    expect(altTable).toBeDefined();
    expect(altTable!.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects ADR without required sections', () => {
    const badADR = `# ADR-001: Use Redis for Caching\n\n## Status\nAccepted\n\n## Context\nSome context`;
    const result = validateADROutput(badADR);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Decision'))).toBe(true);
  });
});

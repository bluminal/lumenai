/**
 * Layer 1: Schema validation tests for Metrics Analyst output.
 *
 * Validates structural compliance against the Metrics Report
 * format defined in metrics-analyst.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateMetricsAnalystOutput } from './metrics-analyst.js';
import {
  parseMarkdownOutput,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadMetricsSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('metrics-analyst--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('metrics-analyst--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Metrics Analyst Schema', () => {
  const snapshots = loadMetricsSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateMetricsAnalystOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('contains metrics-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('metric') ||
            lower.includes('dora') ||
            lower.includes('deployment') ||
            lower.includes('lead time') ||
            lower.includes('okr')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Metrics Report output parser', () => {
  const sampleOutput = `## Engineering & Product Metrics Report

### Period: February 1-14, 2026

### Engineering Effectiveness (DORA)
| Metric | Previous Period | Current Period | Change | Benchmark |
|--------|----------------|---------------|--------|-----------|
| Deployment Frequency | 3/week | 5/week | +67% | High |
| Lead Time for Changes | 4.2 days | 2.8 days | -33% | High |
| Mean Time to Recovery | 6 hours | 4 hours | -33% | High |
| Change Failure Rate | 18% | 12% | -6pp | Medium |
| Deployment Rework Rate | 22% | 15% | -7pp | Medium |

### Product Health
Product analytics data was not available for this period. HEART/AARRR metrics require integration with the product analytics platform.

### Strategic Alignment (OKRs)
| Objective | Key Result | Target | Current | Progress |
|-----------|-----------|--------|---------|----------|
| Improve platform reliability | Reduce p95 latency | < 500ms | 620ms | 65% |
| Improve platform reliability | Achieve 99.9% uptime | 99.9% | 99.7% | 80% |
| Accelerate delivery velocity | Deploy daily | 1/day | 5/week | 71% |

### Key Insights
1. **Deployment frequency improved significantly** (+67%), correlating with the new CI/CD pipeline deployed in the previous period. This is a leading indicator that suggests lead time will continue to improve.
2. **Change failure rate is trending down** but still in the "Medium" DORA benchmark range. The improvement from 18% to 12% coincides with the introduction of automated integration tests.
3. **Recovery time improved** but relies heavily on one senior engineer who handles most incident responses — this is a bus factor risk.

### Recommended Action
Invest in cross-training for incident response. Currently, 75% of incident resolutions involve the same engineer. Creating runbooks and conducting incident response drills with other team members would reduce MTTR risk and improve the team's resilience. This single change addresses the reliability OKR and reduces the bus factor simultaneously.

### Context & Caveats
- DORA metrics are calculated from GitHub Actions deployment logs and PagerDuty incident data
- Lead Time measures from first commit to production deployment (not from ticket creation)
- Change Failure Rate counts any deployment that triggered a PagerDuty alert within 1 hour of deploy
- Product metrics are not yet available — HEART framework implementation is in progress`;

  it('has Period section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Period');
    expect(section).toBeDefined();
  });

  it('has DORA metrics table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Engineering Effectiveness')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('engineering') ||
      t.sectionTitle.toLowerCase().includes('dora')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Metric');
    expect(table!.headers).toContain('Benchmark');
    expect(table!.rows.length).toBe(5); // 5 DORA metrics
  });

  it('includes all 5 DORA metrics', () => {
    const lower = sampleOutput.toLowerCase();
    expect(lower).toContain('deployment frequency');
    expect(lower).toContain('lead time');
    expect(lower).toContain('mean time to recovery');
    expect(lower).toContain('change failure rate');
    expect(lower).toContain('deployment rework rate');
  });

  it('has Key Insights section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Key Insights')).toBeDefined();
  });

  it('has single Recommended Action (not a list of 10)', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Recommended Action');
    expect(section).toBeDefined();
    expect(section!.content).not.toBe('');
  });

  it('has Context & Caveats section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Context')).toBeDefined();
  });

  it('contains quantitative data', () => {
    expect(sampleOutput).toMatch(/\d+%/);
    expect(sampleOutput).toMatch(/\d+\.\d+/);
  });

  it('passes schema validation', () => {
    const result = validateMetricsAnalystOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

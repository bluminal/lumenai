/**
 * Layer 1: Schema validation tests for Performance Engineer output.
 *
 * Validates structural compliance against the Performance Analysis
 * Report format defined in performance-engineer.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validatePerformanceEngineerOutput } from './performance-engineer.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadPerformanceSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('performance-engineer--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('performance-engineer--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Performance Engineer Schema', () => {
  const snapshots = loadPerformanceSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validatePerformanceEngineerOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('contains performance-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('performance') ||
            lower.includes('bundle') ||
            lower.includes('latency') ||
            lower.includes('core web vitals') ||
            lower.includes('optimization')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Performance Analysis output parser', () => {
  const sampleOutput = `## Performance Analysis

### Summary
Performance audit identifies critical N+1 query pattern and oversized JavaScript bundle. Performance budget is failing on 3 of 7 metrics.

### Performance Budget
| Metric | Budget | Current | Status | Priority |
|--------|--------|---------|--------|----------|
| JS bundle (main, gzipped) | < 150KB | 287KB | FAIL | P1 |
| CSS (total, gzipped) | < 50KB | 32KB | PASS | — |
| LCP (target) | < 2.5s | 3.8s (estimated) | FAIL | P1 |
| INP (target) | < 200ms | 120ms (estimated) | PASS | — |
| CLS (target) | < 0.1 | 0.05 (estimated) | PASS | — |
| API p95 latency | < 500ms | 1.2s (estimated) | FAIL | P1 |
| Initial page weight | < 1MB | 850KB | PASS | — |

### Findings

#### [CRITICAL] N+1 Query in Order List Endpoint
- **Category:** Database
- **Impact:** Executes 47 queries instead of 2 for a typical order list (adds ~800ms to API response)
- **Location:** src/api/orders.ts:28-31
- **Root Cause:** Product lookup inside a loop — each order item triggers an individual database query instead of a batch query.
- **Remediation:** Use \`findMany\` with \`where: { id: { in: productIds } }\` to batch the product lookup into a single query.
- **Effort:** S
- **Expected Improvement:** Reduces query count from N+1 to 2, estimated ~750ms latency improvement

#### [HIGH] Oversized JavaScript Bundle
- **Category:** Bundle
- **Impact:** Main bundle is 287KB gzipped (budget: 150KB), adding ~1.3s to page load on 3G
- **Location:** package.json, webpack.config.js
- **Root Cause:** moment.js (65KB gzipped) and lodash (24KB gzipped) included as full packages instead of targeted imports
- **Remediation:** Replace moment.js with dayjs (2KB) and use lodash-es with tree shaking or cherry-pick imports
- **Effort:** M
- **Expected Improvement:** Reduces bundle by ~87KB gzipped (moment: 63KB saved, lodash: 24KB saved)

#### [MEDIUM] Missing Cache Headers on Static Assets
- **Category:** Caching
- **Impact:** Static assets re-downloaded on every visit (~200KB unnecessary transfer per return visit)
- **Location:** server.ts:12 (Express static middleware)
- **Root Cause:** No Cache-Control headers set on static file responses
- **Remediation:** Add \`Cache-Control: public, max-age=31536000, immutable\` for hashed assets
- **Effort:** S
- **Expected Improvement:** Eliminates ~200KB transfer on return visits, improving repeat LCP by ~400ms on 3G

### Optimization Opportunities
1. **Code splitting by route** — Split vendor chunks per route to reduce initial download (est. 40-60KB savings)
2. **Image optimization** — Convert PNG hero images to WebP (est. 30-50% size reduction)
3. **API response compression** — Enable Brotli compression for JSON responses (est. 20-30% payload reduction)

### Performance Budget Recommendations
Current budget is reasonable for a content-heavy application. Consider adding:
- Time to Interactive (TTI) < 3.5s target
- Server response time (TTFB) < 200ms target`;

  it('detects performance agent type', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.agentType).toBe('performance');
  });

  it('extracts 3 findings', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings).toHaveLength(3);
  });

  it('first finding is CRITICAL', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[0].title).toContain('N+1');
  });

  it('findings are sorted by severity', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(areFindingsSorted(parsed.findings)).toBe(true);
  });

  it('has Performance Budget table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Performance Budget');
    expect(section).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('budget') ||
      t.sectionTitle.toLowerCase().includes('performance')
    );
    expect(table).toBeDefined();
    expect(table!.rows.length).toBeGreaterThan(0);
  });

  it('budget table has Status column', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('budget')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Status');
  });

  it('has Optimization Opportunities section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Optimization Opportunities')).toBeDefined();
  });

  it('findings include quantified impact', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    for (const finding of parsed.findings) {
      const impact = finding.fields['Impact'] || '';
      expect(
        impact.match(/\d+\s*(ms|KB|MB|queries|%|s)/i),
        `Finding "${finding.title}" should have quantified impact`
      ).not.toBeNull();
    }
  });

  it('passes schema validation', () => {
    const result = validatePerformanceEngineerOutput(sampleOutput);
    expect(result.errors).toEqual([]);
  });
});

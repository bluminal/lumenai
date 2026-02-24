/**
 * Layer 1: Schema validation tests for SRE Agent output.
 *
 * Validates structural compliance against the Reliability Review
 * format defined in sre-agent.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateSREAgentOutput } from './sre-agent.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadSRESnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('sre-agent--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('sre-agent--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('SRE Agent Schema', () => {
  const snapshots = loadSRESnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateSREAgentOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('contains reliability-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('reliability') ||
            lower.includes('slo') ||
            lower.includes('observability') ||
            lower.includes('runbook') ||
            lower.includes('deployment')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Reliability Review output parser', () => {
  const sampleOutput = `## Reliability Review

### Summary
Overall operational readiness assessment: NOT READY — critical gaps in observability and runbook coverage. No SLOs defined, no alerting configured, deployment has no rollback capability.

### SLO Coverage
| User Journey | SLI Defined | SLO Set | Alerting Configured | Status |
|-------------|------------|---------|-------------------|--------|
| User Login | No | — | No | gap |
| Order Placement | No | — | No | gap |
| Product Search | No | — | No | gap |
| Checkout Flow | No | — | No | gap |

### Findings

#### [CRITICAL] No Observability Infrastructure
- **Category:** Observability
- **Risk:** Production issues will not be detected until users report them. Mean Time to Detection (MTTD) is effectively unlimited — the team cannot see what's happening in production.
- **Recommendation:** Implement minimum viable observability: (1) structured logging with request IDs, (2) error rate and latency metrics via Prometheus/Datadog, (3) health check endpoint at /healthz, (4) error alerting to Slack/PagerDuty when error rate exceeds 1% for 5 minutes.

#### [CRITICAL] No Rollback Strategy
- **Category:** Deployment
- **Risk:** If a deployment introduces a critical bug, there is no documented or automated way to revert. Recovery requires manual intervention under pressure, increasing Mean Time to Recovery (MTTR).
- **Recommendation:** Implement blue-green or rolling deployment with automatic rollback on health check failure. Document rollback procedure in a runbook. Target: rollback within 5 minutes of detection.

#### [HIGH] No SLOs Defined
- **Category:** Availability
- **Risk:** Without SLOs, there is no shared understanding of "reliable enough." The team cannot make informed trade-offs between feature velocity and reliability work.
- **Recommendation:** Define SLOs for the top 3 user journeys: (1) Login success rate > 99.9%, (2) Order placement success rate > 99.95%, (3) Search p95 latency < 500ms. Use a 30-day rolling window.

#### [MEDIUM] No Runbooks
- **Category:** Recovery
- **Risk:** When an incident occurs at 3 AM, the on-call engineer has no documented procedures. Recovery depends on tribal knowledge and luck.
- **Recommendation:** Create runbooks for the top 3 failure scenarios: (1) database connection failure, (2) payment gateway timeout, (3) high error rate. Each runbook should include exact diagnosis commands and mitigation steps.

### Observability Assessment
| Signal | Coverage | Gaps |
|--------|----------|------|
| Metrics | 0% | No metrics collection configured |
| Logs | 20% | Console.log only, no structured logging, no request IDs |
| Traces | 0% | No distributed tracing |
| Alerts | 0% | No alerting rules configured |

### Deployment Assessment
- **Deployment strategy:** Big-bang (replace all instances at once)
- **Rollback capability:** No — no documented or automated rollback
- **Progressive delivery:** None — no feature flags or canary deployments
- **Health checks:** Missing — no /healthz endpoint

### Runbook Coverage
| Failure Scenario | Runbook Exists | Last Updated | Status |
|-----------------|---------------|-------------|--------|
| Database connection failure | No | — | missing |
| Payment gateway timeout | No | — | missing |
| High error rate | No | — | missing |
| Disk space exhaustion | No | — | missing |

### Recommendations
1. **P1:** Implement minimum viable observability (structured logging + error alerting) — 2-3 days effort
2. **P1:** Add rollback capability to deployment pipeline — 1-2 days effort
3. **P2:** Define SLOs for top 3 user journeys — 1 day effort
4. **P2:** Create runbooks for top 3 failure scenarios — 2 days effort
5. **P3:** Implement distributed tracing — 3-5 days effort`;

  it('detects reliability agent type', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.agentType).toBe('reliability');
  });

  it('detects readiness verdict (NOT READY)', () => {
    expect(sampleOutput).toMatch(/NOT READY/i);
  });

  it('extracts 4 findings', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings).toHaveLength(4);
  });

  it('first two findings are CRITICAL', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[1].severity).toBe('CRITICAL');
  });

  it('findings are sorted by severity', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(areFindingsSorted(parsed.findings)).toBe(true);
  });

  it('has SLO Coverage table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'SLO Coverage')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('slo')
    );
    expect(table).toBeDefined();
    expect(table!.rows.length).toBeGreaterThan(0);
  });

  it('has Observability Assessment table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Observability Assessment')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('observability')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Signal');
  });

  it('has Deployment Assessment section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Deployment Assessment');
    expect(section).toBeDefined();
    expect(section!.content).toContain('Rollback');
  });

  it('has Runbook Coverage table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Runbook Coverage')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('runbook')
    );
    expect(table).toBeDefined();
  });

  it('passes schema validation', () => {
    const result = validateSREAgentOutput(sampleOutput);
    expect(result.errors).toEqual([]);
  });
});

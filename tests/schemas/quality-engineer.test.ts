/**
 * Layer 1: Schema validation tests for Quality Engineer output.
 *
 * Validates structural compliance against the Coverage Analysis
 * format defined in quality-engineer.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateQualityEngineerOutput } from './quality-engineer.js';
import {
  parseMarkdownOutput,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadQualitySnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('quality-engineer--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('quality-engineer--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Quality Engineer Schema', () => {
  const snapshots = loadQualitySnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateQualityEngineerOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('contains testing-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('test') ||
            lower.includes('coverage') ||
            lower.includes('quality') ||
            lower.includes('gap')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Coverage Analysis output parser', () => {
  const sampleOutput = `## Test Coverage Analysis

### Summary
Overall coverage is 62% line, 45% branch. Critical auth and payment modules have dangerously low coverage (28% and 15% respectively). Test quality is mixed — some tests verify behavior, others test implementation details.

### Coverage Report
| Module / Component | Line % | Branch % | Risk Level | Priority |
|-------------------|--------|----------|------------|----------|
| src/auth/ | 28% | 18% | HIGH | P1 |
| src/payments/ | 15% | 10% | HIGH | P1 |
| src/api/orders.ts | 45% | 30% | HIGH | P2 |
| src/utils/ | 92% | 85% | LOW | P3 |
| src/components/ | 78% | 60% | MEDIUM | P2 |

### Gap Analysis

#### P1 Gap: Authentication Module Has No Integration Tests
- **Location:** src/auth/
- **What's untested:** Login flow, token refresh, session expiry, OAuth callback handling, RBAC permission checks
- **Risk:** Authentication regressions could allow unauthorized access or lock out legitimate users
- **Recommended tests:** (1) Login with valid credentials returns token, (2) Login with invalid credentials returns 401, (3) Expired token triggers refresh, (4) User with 'admin' role can access admin endpoints, (5) User without 'admin' role gets 403

#### P1 Gap: Payment Processing Untested
- **Location:** src/payments/
- **What's untested:** Successful payment flow, payment failure handling, refund processing, webhook signature verification
- **Risk:** Payment bugs could cause double-charging, lost payments, or failed refunds — direct revenue impact
- **Recommended tests:** (1) Successful payment creates order, (2) Failed payment does not create order, (3) Stripe webhook with valid signature processes event, (4) Stripe webhook with invalid signature returns 400

#### P2 Gap: Order API Error Paths
- **Location:** src/api/orders.ts
- **What's untested:** Invalid product ID handling, insufficient inventory, concurrent order conflicts
- **Risk:** Unhandled errors cause 500 responses and poor UX

### Test Quality Assessment
- **Behavior vs. implementation:** 60% of tests verify behavior, 40% test implementation details (mocking internal functions, asserting on private state). The implementation-coupled tests should be refactored.
- **Test independence:** Tests are independent and order-agnostic ✓
- **Test setup:** Significant duplication in beforeEach blocks across auth tests — should extract to fixtures/factories
- **Test names:** Mostly descriptive, but some generic names like "it works" and "handles edge case"
- **Edge cases:** Error paths are consistently under-tested across all modules
- **Error paths:** Only 20% of error branches have test coverage

### Test Strategy Recommendations
1. **Immediate priority:** Add integration tests for auth and payment modules (P1 gaps)
2. **Test pyramid rebalancing:** Current ratio is 30% unit / 60% integration / 10% E2E — should be closer to 60/30/10
3. **Fixture extraction:** Create a test factory for user/order/payment test data to reduce beforeEach duplication
4. **Coverage threshold:** Set CI to block PRs that drop coverage below 60% line / 40% branch (current baseline)`;

  it('detects coverage analysis content', () => {
    expect(sampleOutput).toMatch(/test coverage analysis/i);
  });

  it('has Summary section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Summary')).toBeDefined();
  });

  it('has Coverage Report table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Coverage Report')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('coverage')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Line %');
    expect(table!.rows.length).toBeGreaterThan(0);
  });

  it('has Gap Analysis with prioritized entries', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const gapSection = findSection(parsed.sections, 'Gap Analysis');
    expect(gapSection).toBeDefined();

    // Check for P1/P2 priority levels in subsection titles
    const content = sampleOutput.toLowerCase();
    expect(content).toContain('p1');
    expect(content).toContain('p2');
  });

  it('has Test Quality Assessment section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Test Quality Assessment')).toBeDefined();
  });

  it('has Test Strategy Recommendations section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Test Strategy Recommendations')).toBeDefined();
  });

  it('passes schema validation', () => {
    const result = validateQualityEngineerOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

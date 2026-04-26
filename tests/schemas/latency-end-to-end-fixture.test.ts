/**
 * Layer 2: End-to-end NFR-MMT3 latency fixture tests (Task 34a).
 *
 * Validates fixture.json structure and asserts that all projected latency values
 * are within NFR-MMT3 budgets. Does NOT execute live wall-clock measurements —
 * that is Task 34a-pre's role (discovery-latency-smoke.test.ts).
 *
 * Acceptance criteria covered:
 *   [AC1]  nfr_mmt3.discovery_budget_ms === 100
 *   [AC2]  nfr_mmt3.end_to_end_budget_ms === 500
 *   [AC3]  Exactly 3 sub-cases present covering pool counts 0, 1, 10
 *   [AC4]  Each sub-case: expected.discovery_p95_ms < 100 ms (within budget)
 *   [AC5]  Each sub-case: expected.end_to_end_p95_ms < 500 ms (within budget)
 *   [AC6]  zero-pools sub-case has routing_decision: "fell-back-no-pool"
 *   [AC7]  one-pool-match and ten-pools sub-cases have routing_decision: "routed-to-pool"
 *   [AC8]  docs/specs/multi-model-teams/routing.md contains "NFR-MMT3"
 *   [AC9]  docs/specs/multi-model-teams/routing.md contains "100 ms" or "100ms"
 *   [AC10] methodology.ci_stable === true
 *   [AC11] ten-pools sub-case has exactly 10 entries in index_json.pools
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndToEndLatencyFixture, SubCase } from '../fixtures/multi-model-teams/routing/latency/end-to-end/assertions.js';
import {
  assertFixtureValid,
  assertDiscoveryWithinBudget,
  assertEndToEndWithinBudget,
  assertPoolCountConsistency,
} from '../fixtures/multi-model-teams/routing/latency/end-to-end/assertions.js';

// ── Paths ──────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_PATH = resolve(
  __dirname,
  '../fixtures/multi-model-teams/routing/latency/end-to-end/fixture.json'
);

const ROUTING_MD_PATH = resolve(
  __dirname,
  '../../docs/specs/multi-model-teams/routing.md'
);

// ── Fixture load ───────────────────────────────────────────────────────────────

let fixture: EndToEndLatencyFixture;

beforeAll(() => {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  fixture = JSON.parse(raw) as EndToEndLatencyFixture;
});

// ── Helper: find a sub-case by name ───────────────────────────────────────────

function getSubCase(name: string): SubCase {
  const sc = fixture.sub_cases.find((c) => c.name === name);
  if (!sc) throw new Error(`Sub-case "${name}" not found in fixture`);
  return sc;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('End-to-end NFR-MMT3 latency fixture (Task 34a)', () => {

  // ── [AC1] Discovery budget constant ────────────────────────────────────────

  it('[AC1] nfr_mmt3.discovery_budget_ms === 100', () => {
    expect(fixture.nfr_mmt3.discovery_budget_ms).toBe(100);
  });

  // ── [AC2] End-to-end budget constant ───────────────────────────────────────

  it('[AC2] nfr_mmt3.end_to_end_budget_ms === 500', () => {
    expect(fixture.nfr_mmt3.end_to_end_budget_ms).toBe(500);
  });

  // ── [AC3] Sub-case count and pool-count coverage ───────────────────────────

  it('[AC3] exactly 3 sub-cases are present', () => {
    expect(fixture.sub_cases).toHaveLength(3);
  });

  it('[AC3] sub-cases cover pool counts 0, 1, 10', () => {
    const poolCounts = fixture.sub_cases.map((sc) => sc.pool_count);
    expect(poolCounts).toContain(0);
    expect(poolCounts).toContain(1);
    expect(poolCounts).toContain(10);
  });

  it('[AC3] nfr_mmt3.pool_count_tested includes 0, 1, 10', () => {
    expect(fixture.nfr_mmt3.pool_count_tested).toContain(0);
    expect(fixture.nfr_mmt3.pool_count_tested).toContain(1);
    expect(fixture.nfr_mmt3.pool_count_tested).toContain(10);
  });

  // ── [AC4] Per-sub-case: discovery_p95_ms within budget ─────────────────────

  describe('[AC4] Each sub-case: discovery_p95_ms < 100 ms', () => {
    it('zero-pools: discovery_p95_ms < 100', () => {
      const sc = getSubCase('zero-pools');
      const result = assertDiscoveryWithinBudget(sc, fixture.nfr_mmt3.discovery_budget_ms);
      expect(result.valid, result.errors.join('; ')).toBe(true);
      expect(sc.expected.discovery_p95_ms).toBeLessThan(100);
    });

    it('one-pool-match: discovery_p95_ms < 100', () => {
      const sc = getSubCase('one-pool-match');
      const result = assertDiscoveryWithinBudget(sc, fixture.nfr_mmt3.discovery_budget_ms);
      expect(result.valid, result.errors.join('; ')).toBe(true);
      expect(sc.expected.discovery_p95_ms).toBeLessThan(100);
    });

    it('ten-pools: discovery_p95_ms < 100', () => {
      const sc = getSubCase('ten-pools');
      const result = assertDiscoveryWithinBudget(sc, fixture.nfr_mmt3.discovery_budget_ms);
      expect(result.valid, result.errors.join('; ')).toBe(true);
      expect(sc.expected.discovery_p95_ms).toBeLessThan(100);
    });
  });

  // ── [AC5] Per-sub-case: end_to_end_p95_ms within budget ────────────────────

  describe('[AC5] Each sub-case: end_to_end_p95_ms < 500 ms', () => {
    it('zero-pools: end_to_end_p95_ms < 500', () => {
      const sc = getSubCase('zero-pools');
      const result = assertEndToEndWithinBudget(sc, fixture.nfr_mmt3.end_to_end_budget_ms);
      expect(result.valid, result.errors.join('; ')).toBe(true);
      expect(sc.expected.end_to_end_p95_ms).toBeLessThan(500);
    });

    it('one-pool-match: end_to_end_p95_ms < 500', () => {
      const sc = getSubCase('one-pool-match');
      const result = assertEndToEndWithinBudget(sc, fixture.nfr_mmt3.end_to_end_budget_ms);
      expect(result.valid, result.errors.join('; ')).toBe(true);
      expect(sc.expected.end_to_end_p95_ms).toBeLessThan(500);
    });

    it('ten-pools: end_to_end_p95_ms < 500', () => {
      const sc = getSubCase('ten-pools');
      const result = assertEndToEndWithinBudget(sc, fixture.nfr_mmt3.end_to_end_budget_ms);
      expect(result.valid, result.errors.join('; ')).toBe(true);
      expect(sc.expected.end_to_end_p95_ms).toBeLessThan(500);
    });
  });

  // ── [AC6] zero-pools routing decision ──────────────────────────────────────

  it('[AC6] zero-pools sub-case has routing_decision: "fell-back-no-pool"', () => {
    const sc = getSubCase('zero-pools');
    expect(sc.expected.routing_decision).toBe('fell-back-no-pool');
  });

  // ── [AC7] one-pool-match and ten-pools routing decisions ───────────────────

  it('[AC7] one-pool-match sub-case has routing_decision: "routed-to-pool"', () => {
    const sc = getSubCase('one-pool-match');
    expect(sc.expected.routing_decision).toBe('routed-to-pool');
  });

  it('[AC7] ten-pools sub-case has routing_decision: "routed-to-pool"', () => {
    const sc = getSubCase('ten-pools');
    expect(sc.expected.routing_decision).toBe('routed-to-pool');
  });

  // ── [AC8] routing.md contains "NFR-MMT3" ───────────────────────────────────

  it('[AC8] docs/specs/multi-model-teams/routing.md contains "NFR-MMT3"', () => {
    const content = readFileSync(ROUTING_MD_PATH, 'utf-8');
    expect(content).toContain('NFR-MMT3');
  });

  // ── [AC9] routing.md documents the 100 ms budget ───────────────────────────

  it('[AC9] docs/specs/multi-model-teams/routing.md contains "100 ms" or "100ms"', () => {
    const content = readFileSync(ROUTING_MD_PATH, 'utf-8');
    const hasbudget = content.includes('100 ms') || content.includes('100ms');
    expect(hasbudget, 'routing.md must document the 100 ms discovery budget').toBe(true);
  });

  // ── [AC10] CI stable flag ──────────────────────────────────────────────────

  it('[AC10] methodology.ci_stable === true', () => {
    expect(fixture.methodology.ci_stable).toBe(true);
  });

  // ── [AC11] ten-pools pool count consistency ────────────────────────────────

  it('[AC11] ten-pools sub-case has exactly 10 entries in index_json.pools', () => {
    const sc = getSubCase('ten-pools');
    expect(sc.index_json.pools).toHaveLength(10);
    const result = assertPoolCountConsistency(sc);
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  // ── Full fixture structural validation (composite) ─────────────────────────

  it('full fixture passes assertFixtureValid() composite check', () => {
    const result = assertFixtureValid(fixture);
    expect(result.valid, `assertFixtureValid errors:\n${result.errors.join('\n')}`).toBe(true);
  });
});

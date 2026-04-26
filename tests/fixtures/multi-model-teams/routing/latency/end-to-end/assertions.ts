/**
 * Typed assertion helpers for the end-to-end NFR-MMT3 latency fixture (Task 34a).
 *
 * These helpers validate the structural and budget-compliance properties of
 * fixture.json sub-cases. They are consumed by:
 *   tests/schemas/latency-end-to-end-fixture.test.ts
 *
 * They are NOT live latency measurements — the fixture documents projected
 * values (ci_stable: true). See scenario.md for methodology.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type RoutingDecision =
  | 'routed-to-pool'
  | 'fell-back-no-pool'
  | 'fell-back-roster-mismatch'
  | 'fell-back-pool-draining'
  | 'fell-back-pool-stale'
  | 'fell-back-timeout'
  | 'skipped-routing-mode-explicit';

export interface PoolEntry {
  name: string;
  roster: string[];
  pool_state: string;
  multi_model: boolean;
  last_active_at: string;
  ttl_minutes: number;
}

export interface IndexJson {
  pools: PoolEntry[];
}

export interface SubCaseExpected {
  routing_decision: RoutingDecision;
  discovery_p95_ms: number;
  end_to_end_p95_ms: number;
}

export interface SubCase {
  name: string;
  pool_count: number;
  index_json: IndexJson;
  expected: SubCaseExpected;
}

export interface NfrMmt3 {
  discovery_budget_ms: number;
  end_to_end_budget_ms: number;
  pool_count_tested: number[];
}

export interface Methodology {
  measurement: string;
  runs: string;
  env: string;
  ci_stable: boolean;
  note: string;
}

export interface EndToEndLatencyFixture {
  scenario: string;
  description: string;
  nfr_mmt3: NfrMmt3;
  sub_cases: SubCase[];
  methodology: Methodology;
}

// ── Validation result ──────────────────────────────────────────────────────────

export interface AssertionResult {
  valid: boolean;
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROUTING_DECISION_VALUES = new Set<string>([
  'routed-to-pool',
  'fell-back-no-pool',
  'fell-back-roster-mismatch',
  'fell-back-pool-draining',
  'fell-back-pool-stale',
  'fell-back-timeout',
  'skipped-routing-mode-explicit',
]);

/**
 * Assert that a sub-case's projected discovery_p95_ms is within the NFR-MMT3
 * discovery budget.
 */
export function assertDiscoveryWithinBudget(
  subCase: SubCase,
  budgetMs: number
): AssertionResult {
  const errors: string[] = [];
  if (subCase.expected.discovery_p95_ms >= budgetMs) {
    errors.push(
      `Sub-case "${subCase.name}": discovery_p95_ms (${subCase.expected.discovery_p95_ms}) ` +
        `must be < ${budgetMs} ms (NFR-MMT3 discovery budget)`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Assert that a sub-case's projected end_to_end_p95_ms is within the NFR-MMT3
 * end-to-end budget.
 */
export function assertEndToEndWithinBudget(
  subCase: SubCase,
  budgetMs: number
): AssertionResult {
  const errors: string[] = [];
  if (subCase.expected.end_to_end_p95_ms >= budgetMs) {
    errors.push(
      `Sub-case "${subCase.name}": end_to_end_p95_ms (${subCase.expected.end_to_end_p95_ms}) ` +
        `must be < ${budgetMs} ms (NFR-MMT3 end-to-end budget)`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Assert that a sub-case's routing_decision is one of the seven valid enum values.
 */
export function assertValidRoutingDecision(subCase: SubCase): AssertionResult {
  const errors: string[] = [];
  if (!ROUTING_DECISION_VALUES.has(subCase.expected.routing_decision)) {
    errors.push(
      `Sub-case "${subCase.name}": routing_decision "${subCase.expected.routing_decision}" ` +
        `is not a valid RoutingDecision value`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Assert that a sub-case's index_json.pools length matches pool_count.
 */
export function assertPoolCountConsistency(subCase: SubCase): AssertionResult {
  const errors: string[] = [];
  const actual = subCase.index_json.pools.length;
  if (actual !== subCase.pool_count) {
    errors.push(
      `Sub-case "${subCase.name}": index_json.pools has ${actual} entries ` +
        `but pool_count is ${subCase.pool_count}`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Assert that the fixture covers the required pool_count values: [0, 1, 10].
 */
export function assertRequiredPoolCounts(fixture: EndToEndLatencyFixture): AssertionResult {
  const errors: string[] = [];
  const required = [0, 1, 10];
  const tested = fixture.nfr_mmt3.pool_count_tested;
  for (const count of required) {
    if (!tested.includes(count)) {
      errors.push(`nfr_mmt3.pool_count_tested must include ${count}`);
    }
  }
  if (fixture.sub_cases.length !== 3) {
    errors.push(
      `Expected exactly 3 sub_cases (0, 1, 10 pools); got ${fixture.sub_cases.length}`
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Run all structural assertions on the fixture and return a combined result.
 */
export function assertFixtureValid(fixture: EndToEndLatencyFixture): AssertionResult {
  const errors: string[] = [];

  // Top-level budget constants
  if (fixture.nfr_mmt3.discovery_budget_ms !== 100) {
    errors.push(
      `nfr_mmt3.discovery_budget_ms must be 100; got ${fixture.nfr_mmt3.discovery_budget_ms}`
    );
  }
  if (fixture.nfr_mmt3.end_to_end_budget_ms !== 500) {
    errors.push(
      `nfr_mmt3.end_to_end_budget_ms must be 500; got ${fixture.nfr_mmt3.end_to_end_budget_ms}`
    );
  }

  // Pool count coverage
  const countResult = assertRequiredPoolCounts(fixture);
  errors.push(...countResult.errors);

  // CI stable flag
  if (fixture.methodology.ci_stable !== true) {
    errors.push('methodology.ci_stable must be true');
  }

  // Per-sub-case assertions
  for (const subCase of fixture.sub_cases) {
    const routingResult = assertValidRoutingDecision(subCase);
    errors.push(...routingResult.errors);

    const discoveryResult = assertDiscoveryWithinBudget(
      subCase,
      fixture.nfr_mmt3.discovery_budget_ms
    );
    errors.push(...discoveryResult.errors);

    const e2eResult = assertEndToEndWithinBudget(
      subCase,
      fixture.nfr_mmt3.end_to_end_budget_ms
    );
    errors.push(...e2eResult.errors);

    const consistencyResult = assertPoolCountConsistency(subCase);
    errors.push(...consistencyResult.errors);
  }

  return { valid: errors.length === 0, errors };
}

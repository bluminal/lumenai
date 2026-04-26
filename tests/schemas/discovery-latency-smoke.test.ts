/**
 * Layer 1: Discovery latency smoke test (Task 34a-pre).
 *
 * Purpose: Catch NFR-MMT3 regressions at the discovery-primitive layer by verifying
 * that the Bash subprocess reading a 10-pool index.json and emitting inline-discovery
 * output JSON completes in P95 < 100 ms on a local filesystem.
 *
 * What is tested: subprocess wall-clock latency + correctness of emitted JSON.
 * What is NOT tested: consumer commands (/review-code, /performance-audit — Tasks 54/57),
 *   LLM invocations, or agent orchestration.
 *
 * Methodology:
 *   - N=20 iterations; discard first 2 as warmup (amortizes cold filesystem cache).
 *   - Compute P50, P95, P99, max from remaining 18 samples.
 *   - Assert P95 < 100 ms.
 *   - All percentiles printed via console.log for CI log visibility.
 *
 * Acceptance criteria covered:
 *   [T1] Smoke fixture exercises Bash subprocess reading synthetic 10-pool index.json
 *        and emitting inline-discovery output per Task 34 schema.
 *   [T2] Subprocess P95 < 100 ms across multiple runs.
 *   [T3] Methodology documented in fixture README (this file records it programmatically).
 *   [T4] Independent of Tasks 54/57: no consumer command invoked; no LLM; no agent.
 *
 * Schema note: InlineDiscoveryOutput shape (from Task 34 spec — reproduced inline here
 * because Task 34's validator module is in a parallel PR and must not be imported):
 *   {
 *     routing_decision: "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch"
 *                     | "fell-back-pool-draining" | "fell-back-pool-stale"
 *                     | "fell-back-timeout" | "skipped-routing-mode-explicit",
 *     pool_name?: string,      // required when routed-to-pool / fell-back-pool-draining / fell-back-pool-stale
 *     multi_model?: boolean,   // required when routed-to-pool
 *     match_rationale?: string // required when routed-to-pool
 *   }
 *
 * Future: Once Task 34's validator ships, import and reuse validateInlineDiscoveryOutput()
 * in place of the inline ROUTING_DECISION_VALUES check below.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = resolve(
  __dirname,
  '../fixtures/multi-model-teams/routing/latency-smoke'
);
const GENERATE_SCRIPT = resolve(FIXTURE_DIR, 'generate-fixture.sh');
const PRIMITIVE_SCRIPT = resolve(FIXTURE_DIR, 'discovery-primitive.sh');
const TMP_DIR = resolve(FIXTURE_DIR, 'tmp');
const INDEX_PATH = resolve(TMP_DIR, 'index.json');

// ── Inline-discovery output schema constants ──────────────────────────────────

const ROUTING_DECISION_VALUES = new Set([
  'routed-to-pool',
  'fell-back-no-pool',
  'fell-back-roster-mismatch',
  'fell-back-pool-draining',
  'fell-back-pool-stale',
  'fell-back-timeout',
  'skipped-routing-mode-explicit',
] as const);

// ── Percentile helper ─────────────────────────────────────────────────────────

/**
 * Compute the p-th percentile (0–100) of a sorted numeric array.
 * Uses the nearest-rank method (ceiling) for integer-index selection.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
  // Remove and recreate tmp dir for hermeticity
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
  mkdirSync(TMP_DIR, { recursive: true });

  // Generate the synthetic 10-pool index.json
  const gen = spawnSync('bash', [GENERATE_SCRIPT, INDEX_PATH], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (gen.status !== 0) {
    throw new Error(
      `generate-fixture.sh failed (exit ${gen.status}):\n${gen.stderr}`
    );
  }
});

afterAll(() => {
  // Clean up tmp dir
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('[T1] + [T4] Discovery primitive: subprocess output correctness', () => {
  it('emits valid JSON with a routing_decision field (covers mode, matched)', () => {
    const result = spawnSync(
      'bash',
      [PRIMITIVE_SCRIPT, INDEX_PATH, 'code-reviewer,security-reviewer', 'covers', '60'],
      { encoding: 'utf-8', timeout: 5_000 }
    );
    expect(result.status, `Script exited ${result.status}: ${result.stderr}`).toBe(0);

    let parsed: unknown;
    expect(() => { parsed = JSON.parse(result.stdout.trim()); }, 'stdout must be valid JSON').not.toThrow();

    const output = parsed as Record<string, unknown>;
    expect(output).toHaveProperty('routing_decision');
    expect(ROUTING_DECISION_VALUES.has(output.routing_decision as string)).toBe(true);
    // With covers mode and code-reviewer+security-reviewer, review-pool-01 should match
    expect(output.routing_decision).toBe('routed-to-pool');
    expect(output).toHaveProperty('pool_name');
    expect(typeof output.pool_name).toBe('string');
    expect(output).toHaveProperty('multi_model');
    expect(output).toHaveProperty('match_rationale');
  });

  it('emits routed-to-pool with exact match (exact mode)', () => {
    const result = spawnSync(
      'bash',
      [PRIMITIVE_SCRIPT, INDEX_PATH, 'performance-engineer', 'exact', '60'],
      { encoding: 'utf-8', timeout: 5_000 }
    );
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(output.routing_decision).toBe('routed-to-pool');
    expect(output.pool_name).toBe('review-pool-08'); // first by name sort
  });

  it('emits fell-back-no-pool when no pool matches required set', () => {
    const result = spawnSync(
      'bash',
      [PRIMITIVE_SCRIPT, INDEX_PATH, 'sre-agent', 'covers', '60'],
      { encoding: 'utf-8', timeout: 5_000 }
    );
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(output.routing_decision).toBe('fell-back-no-pool');
  });

  it('picks first match by name sort order (covers mode — pool-01 before pool-05)', () => {
    // pools 01-04 have [code-reviewer, security-reviewer]
    // pools 05-07 have [code-reviewer, security-reviewer, design-system-agent] (also covers)
    // sort order should yield review-pool-01 first
    const result = spawnSync(
      'bash',
      [PRIMITIVE_SCRIPT, INDEX_PATH, 'code-reviewer,security-reviewer', 'covers', '60'],
      { encoding: 'utf-8', timeout: 5_000 }
    );
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(output.routing_decision).toBe('routed-to-pool');
    expect(output.pool_name).toBe('review-pool-01');
  });

  it('exact mode does NOT match a superset pool', () => {
    // review-pool-05 has [code-reviewer, security-reviewer, design-system-agent]
    // exact match for [code-reviewer, security-reviewer] should NOT pick it;
    // should instead pick review-pool-01 which is exact
    const result = spawnSync(
      'bash',
      [PRIMITIVE_SCRIPT, INDEX_PATH, 'code-reviewer,security-reviewer', 'exact', '60'],
      { encoding: 'utf-8', timeout: 5_000 }
    );
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(output.routing_decision).toBe('routed-to-pool');
    // pool-01 is exact match; pool-05 has extra design-system-agent so must be excluded
    expect(output.pool_name).toBe('review-pool-01');
  });

  it('routing_decision value is one of the seven enum values', () => {
    const result = spawnSync(
      'bash',
      [PRIMITIVE_SCRIPT, INDEX_PATH, 'code-reviewer,security-reviewer', 'covers', '60'],
      { encoding: 'utf-8', timeout: 5_000 }
    );
    const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(ROUTING_DECISION_VALUES.has(output.routing_decision as string)).toBe(true);
  });
});

describe('[T2] NFR-MMT3 latency budget: P95 < 100 ms', () => {
  // Test parameters (documented in README.md methodology)
  const N_ITERATIONS = 20;
  const N_WARMUP = 2;
  const P95_THRESHOLD_MS = 100;

  it(`P95 subprocess wall-clock < ${P95_THRESHOLD_MS} ms over ${N_ITERATIONS - N_WARMUP} measured iterations (${N_WARMUP} warmup discarded)`, () => {
    const allMs: number[] = [];

    for (let i = 0; i < N_ITERATIONS; i++) {
      const t0 = performance.now();
      const result = spawnSync(
        'bash',
        [PRIMITIVE_SCRIPT, INDEX_PATH, 'code-reviewer,security-reviewer', 'covers', '60'],
        { encoding: 'utf-8', timeout: 5_000 }
      );
      const t1 = performance.now();

      expect(result.status, `Iteration ${i} failed: ${result.stderr}`).toBe(0);
      allMs.push(t1 - t0);
    }

    // Discard warmup iterations
    const measured = allMs.slice(N_WARMUP).sort((a, b) => a - b);

    const p50 = percentile(measured, 50);
    const p95 = percentile(measured, 95);
    const p99 = percentile(measured, 99);
    const max = measured[measured.length - 1];

    // Print all percentiles for CI log visibility
    console.log(
      `\n  Discovery primitive latency (N=${measured.length} measured, ${N_WARMUP} warmup discarded):\n` +
      `    P50 = ${p50.toFixed(2)} ms\n` +
      `    P95 = ${p95.toFixed(2)} ms  [budget: < ${P95_THRESHOLD_MS} ms]\n` +
      `    P99 = ${p99.toFixed(2)} ms\n` +
      `    max = ${max.toFixed(2)} ms`
    );

    // The core NFR-MMT3 assertion
    expect(
      p95,
      `P95 (${p95.toFixed(2)} ms) exceeded the NFR-MMT3 discovery-primitive budget of ${P95_THRESHOLD_MS} ms. ` +
      `Full distribution (ms): ${measured.map((v) => v.toFixed(1)).join(', ')}`
    ).toBeLessThan(P95_THRESHOLD_MS);
  });
});

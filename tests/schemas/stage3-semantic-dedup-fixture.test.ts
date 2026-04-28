/**
 * Layer 2: Stage 3 Embedding-Based Semantic Dedup fixture tests.
 *
 * Verifies:
 *   - Fixture integrity and canonical-finding schema compliance
 *   - Planted semantic duplicates are merged at Stage 3 (cosine ≥ 0.85)
 *   - Truly distinct findings remain separate (cosine below 0.7 floor)
 *   - Host-session embedding source used (D23 fallback)
 *   - D18 cap unaffected (0 Stage 4 calls dispatched)
 *   - Orchestrator .md contains required Stage 3 prose (cross-file checks)
 *   - Plan contains D23 row and Q1 marked Resolved → D23
 *
 * Fixture: tests/fixtures/multi-model-review/consolidation/stage3-semantic-dedup/fixture.json
 * Orchestrator: plugins/synthex/agents/multi-model-review-orchestrator.md
 * Plan: docs/plans/multi-model-review.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateCanonicalFinding } from './canonical-finding.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  '../fixtures/multi-model-review/consolidation/stage3-semantic-dedup/fixture.json'
);

const ORCHESTRATOR_MD = path.join(
  __dirname,
  '../../plugins/synthex/agents/multi-model-review-orchestrator.md'
);

const PLAN_MD = path.join(
  __dirname,
  '../../docs/plans/multi-model-review.md'
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface MergedPair {
  indices: [number, number];
  cosine: number;
  merged_severity: string;
}

interface Stage3Outcome {
  merged_pairs: MergedPair[];
  forwarded_to_stage4: unknown[];
  left_unmerged: unknown[];
  final_findings_count: number;
  stage3_calls_dispatched: number;
}

interface Fixture {
  scenario: string;
  description: string;
  input_findings: unknown[];
  config: {
    stage3_embedding_threshold: number;
    stage3_stage4_floor: number;
    stage4_max_calls_per_consolidation: number;
  };
  simulated_cosine_similarities: Record<string, number>;
  embedding_source_used: string;
  expected_stage3_outcome: Stage3Outcome;
}

// ── Load fixtures ─────────────────────────────────────────────────────────────

let fixture: Fixture;
let orchestratorMd: string;
let planMd: string;

beforeAll(() => {
  fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
  orchestratorMd = fs.readFileSync(ORCHESTRATOR_MD, 'utf8');
  planMd = fs.readFileSync(PLAN_MD, 'utf8');
});

// ── Fixture file existence ────────────────────────────────────────────────────

describe('Stage 3 fixture — file existence', () => {
  it('fixture.json exists', () => {
    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
  });

  it('scenario.md exists', () => {
    const scenarioPath = path.join(
      __dirname,
      '../fixtures/multi-model-review/consolidation/stage3-semantic-dedup/scenario.md'
    );
    expect(fs.existsSync(scenarioPath)).toBe(true);
  });
});

// ── Input findings: canonical-finding schema compliance ───────────────────────

describe('Stage 3 fixture — input_findings canonical schema compliance', () => {
  it('input_findings array has exactly 3 entries', () => {
    expect(fixture.input_findings).toHaveLength(3);
  });

  it('each input finding passes validateCanonicalFinding', () => {
    for (const finding of fixture.input_findings) {
      const result = validateCanonicalFinding(finding);
      expect(result.valid, `Finding failed validation: ${result.errors.join('; ')}`).toBe(true);
    }
  });
});

// ── Merged pairs: planted semantic duplicates merge ───────────────────────────

describe('Stage 3 fixture — merged pairs (semantic duplicates merge at cosine ≥ 0.85)', () => {
  it('exactly one merged pair', () => {
    expect(fixture.expected_stage3_outcome.merged_pairs).toHaveLength(1);
  });

  it('merged pair indices are [0, 1]', () => {
    const pair = fixture.expected_stage3_outcome.merged_pairs[0];
    expect(pair.indices).toEqual([0, 1]);
  });

  it('merged pair cosine is 0.91 (≥ 0.85 auto-merge threshold)', () => {
    const pair = fixture.expected_stage3_outcome.merged_pairs[0];
    expect(pair.cosine).toBe(0.91);
    expect(pair.cosine).toBeGreaterThanOrEqual(fixture.config.stage3_embedding_threshold);
  });

  it('merged severity is "high" (max of medium + high)', () => {
    const pair = fixture.expected_stage3_outcome.merged_pairs[0];
    expect(pair.merged_severity).toBe('high');
  });
});

// ── Final finding count: 3 input → 2 after Stage 3 ───────────────────────────

describe('Stage 3 fixture — final findings count', () => {
  it('final_findings_count === 2 (3 input findings reduced by 1 merge)', () => {
    expect(fixture.expected_stage3_outcome.final_findings_count).toBe(2);
  });
});

// ── Stage 4 forwarding: truly distinct findings NOT forwarded ─────────────────

describe('Stage 3 fixture — Stage 4 forwarding gate', () => {
  it('forwarded_to_stage4 is empty (no pairs in [0.7, 0.85) window)', () => {
    expect(fixture.expected_stage3_outcome.forwarded_to_stage4).toHaveLength(0);
  });

  it('cross-bucket cosine similarities are both below 0.7 floor', () => {
    expect(fixture.simulated_cosine_similarities['finding_0_vs_finding_2']).toBeLessThan(
      fixture.config.stage3_stage4_floor
    );
    expect(fixture.simulated_cosine_similarities['finding_1_vs_finding_2']).toBeLessThan(
      fixture.config.stage3_stage4_floor
    );
  });
});

// ── Embedding source: host-session (D23 fallback) ────────────────────────────

describe('Stage 3 fixture — embedding source (D23)', () => {
  it('embedding_source_used === "host-session"', () => {
    expect(fixture.embedding_source_used).toBe('host-session');
  });
});

// ── D18 cap: Stage 4 calls dispatched ────────────────────────────────────────

describe('Stage 3 fixture — D18 cap (Stage 4 calls)', () => {
  it('stage3_calls_dispatched === 1 (one host-session bucket computation)', () => {
    expect(fixture.expected_stage3_outcome.stage3_calls_dispatched).toBe(1);
  });
});

// ── Cross-file: orchestrator.md contains required Stage 3 prose ───────────────

describe('Stage 3 cross-file checks — orchestrator.md', () => {
  it('orchestrator.md contains "Stage 3"', () => {
    expect(orchestratorMd).toContain('Stage 3');
  });

  it('orchestrator.md contains "embedding"', () => {
    expect(orchestratorMd).toContain('embedding');
  });

  it('orchestrator.md contains "0.85" (auto-merge threshold)', () => {
    expect(orchestratorMd).toContain('0.85');
  });

  it('orchestrator.md contains "D23"', () => {
    expect(orchestratorMd).toContain('D23');
  });

  it('orchestrator.md contains "host-session" (D23 fallback path)', () => {
    expect(orchestratorMd).toContain('host-session');
  });

  it('orchestrator.md documents stage3_embedding_threshold config key', () => {
    expect(orchestratorMd).toContain('stage3_embedding_threshold');
  });

  it('orchestrator.md documents stage3_stage4_floor config key', () => {
    expect(orchestratorMd).toContain('stage3_stage4_floor');
  });

  it('Stage 3 step appears between Stage 2 and Stage 4 in pipeline order', () => {
    const stage2Pos = orchestratorMd.indexOf('Step 8b');
    const stage3Pos = orchestratorMd.indexOf('Step 8b-2');
    const stage4Pos = orchestratorMd.indexOf('Step 8c');
    expect(stage2Pos).toBeGreaterThan(-1);
    expect(stage3Pos).toBeGreaterThan(-1);
    expect(stage4Pos).toBeGreaterThan(-1);
    expect(stage3Pos).toBeGreaterThan(stage2Pos);
    expect(stage3Pos).toBeLessThan(stage4Pos);
  });

  it('D18 max-calls cap still applies at Stage 4 (documented in Step 8b-2)', () => {
    const stage3Section = orchestratorMd.slice(
      orchestratorMd.indexOf('Step 8b-2'),
      orchestratorMd.indexOf('Step 8c')
    );
    expect(stage3Section).toContain('D18 max-calls cap');
  });
});

// ── Cross-file: plan.md contains D23 row ─────────────────────────────────────

describe('Stage 3 cross-file checks — docs/plans/multi-model-review.md', () => {
  it('plan contains D23 row in Decisions table', () => {
    expect(planMd).toContain('D23');
  });

  it('D23 row mentions "host-session"', () => {
    const d23Start = planMd.indexOf('D23');
    expect(d23Start).toBeGreaterThan(-1);
    const d23Row = planMd.slice(d23Start, d23Start + 600);
    expect(d23Row).toContain('host-session');
  });

  it('D23 row mentions "llm embed"', () => {
    const d23Start = planMd.indexOf('D23');
    expect(d23Start).toBeGreaterThan(-1);
    const d23Row = planMd.slice(d23Start, d23Start + 600);
    expect(d23Row).toContain('llm embed');
  });

  it('Q1 is marked as Resolved → D23', () => {
    expect(planMd).toContain('Resolved → D23');
  });
});

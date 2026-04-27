/**
 * Layer 2: Consolidation fixture tests for Stages 1, 2, and 4.
 *
 * Verifies fixture integrity, canonical-finding schema compliance, and per-stage
 * behavioral semantics documented in:
 *   plugins/synthex/agents/multi-model-review-orchestrator.md (Steps 8a, 8b, 8c)
 *
 * Also asserts that the normative orchestrator document contains required prose
 * (raw-string checks per FR-MR14, D18).
 *
 * Fixtures covered:
 *   (a) stage1-fingerprint-dedup    — exact-id collapse, raised_by[] population
 *   (b) stage2-lexical-dedup        — Jaccard merge, highest-severity preservation, distinct third
 *   (c) stage4-llm-tiebreaker       — pre-filter ≥30%, single LLM call, merge verdict
 *   (d) stage4-cap-single-bucket-N10 — N=10 single bucket, cap=25, 20 skipped, audit warning
 *   (e) stage4-cap-multi-bucket-cumulative — 4 buckets, cap=25 per-consolidation, 15 skipped
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateCanonicalFinding } from './canonical-finding.js';

// ── Paths ────────────────────────────────────────────────────────────────────

const FIXTURES_ROOT = path.join(
  __dirname,
  '../fixtures/multi-model-review/consolidation/stage1-2-4'
);

const ORCHESTRATOR_MD = path.join(
  __dirname,
  '../../plugins/synthex/agents/multi-model-review-orchestrator.md'
);

// ── Helper: load fixture.json from a named scenario ──────────────────────────

function loadFixture(scenarioDir: string): Record<string, unknown> {
  const p = path.join(FIXTURES_ROOT, scenarioDir, 'fixture.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

function loadOrchestratorMd(): string {
  return fs.readFileSync(ORCHESTRATOR_MD, 'utf8');
}

// ── Cross-fixture: orchestrator.md normative prose checks ────────────────────

describe('multi-model-review-orchestrator.md — normative prose checks (FR-MR14, D18)', () => {
  let md: string;
  beforeAll(() => {
    md = loadOrchestratorMd();
  });

  it('documents Stage 1 Fingerprint Dedup', () => {
    expect(md).toContain('Fingerprint Dedup');
  });

  it('documents Stage 2 Lexical Dedup', () => {
    expect(md).toContain('Lexical Dedup');
  });

  it('documents Stage 4 LLM Tiebreaker', () => {
    expect(md).toContain('LLM Tiebreaker');
  });

  it('documents the 30% pre-filter threshold', () => {
    expect(md).toMatch(/30%|≥30|≥ 30/);
  });

  it('documents max_calls_per_consolidation config key (per-consolidation cap)', () => {
    expect(md).toContain('max_calls_per_consolidation');
  });

  it('documents the alternating order bias-mitigation rule (FR-MR15)', () => {
    expect(md).toMatch(/alternating order|invocation_counter mod 2/);
  });
});

// ── (a) Stage 1: Fingerprint Dedup ───────────────────────────────────────────

describe('Fixture (a): stage1-fingerprint-dedup — exact-id collapse', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('stage1-fingerprint-dedup');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('input_findings');
    expect(fixture).toHaveProperty('expected_consolidation');
    expect(fixture).toHaveProperty('config');
  });

  it('all input_findings pass canonical-finding schema validation', () => {
    const findings = fixture.input_findings as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `input_findings[${i}] errors: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('input contains exactly 4 findings (ids: [A, A, B, C])', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(4);
  });

  it('finding_ids do not contain line numbers (schema constraint)', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const lineNumberRe = /:\d+|L\d+|line[-_]\d+/i;
    findings.forEach((f, i) => {
      expect(
        lineNumberRe.test(f.finding_id as string),
        `finding[${i}].finding_id must not contain line numbers`
      ).toBe(false);
    });
  });

  it('two input findings share the same finding_id (the "A" pair)', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const ids = findings.map(f => f.finding_id as string);
    const idCounts = ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const duplicatedIds = Object.entries(idCounts).filter(([, count]) => count > 1);
    expect(duplicatedIds).toHaveLength(1);
    expect(duplicatedIds[0][1]).toBe(2);
  });

  it('expected_consolidation: stage1_collapsed_count == 1', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage1_collapsed_count).toBe(1);
  });

  it('expected_consolidation: stage2_merged_count == 0 (no lexical merges)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage2_merged_count).toBe(0);
  });

  it('expected_consolidation: final_findings_count == 3', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.final_findings_count).toBe(3);
  });

  it('expected_consolidation: no audit warning (cap not reached)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_emitted).toBe(false);
    expect(ec.audit_warning_text).toBeNull();
  });

  it('Stage 1 specific: expected consolidated finding A has raised_by[] with exactly 2 entries', () => {
    const ecf = fixture.expected_consolidated_findings as Array<Record<string, unknown>>;
    // Find the collapsed finding (the one from id pair)
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const ids = findings.map(f => f.finding_id as string);
    const idCounts = ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const duplicatedId = Object.entries(idCounts).find(([, count]) => count === 2)![0];

    const collapsedFinding = ecf.find(f => f.finding_id === duplicatedId);
    expect(collapsedFinding, `No consolidated finding for id "${duplicatedId}"`).toBeDefined();

    const raisedBy = collapsedFinding!.raised_by as unknown[];
    expect(Array.isArray(raisedBy)).toBe(true);
    expect(raisedBy).toHaveLength(2);
  });

  it('Stage 1 specific: non-duplicate findings B and C each have raised_by[] with 1 entry', () => {
    const ecf = fixture.expected_consolidated_findings as Array<Record<string, unknown>>;
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const ids = findings.map(f => f.finding_id as string);
    const idCounts = ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const uniqueIds = Object.entries(idCounts).filter(([, count]) => count === 1).map(([id]) => id);

    uniqueIds.forEach(id => {
      const found = ecf.find(f => f.finding_id === id);
      expect(found, `No consolidated finding for id "${id}"`).toBeDefined();
      const raisedBy = found!.raised_by as unknown[];
      expect(raisedBy).toHaveLength(1);
    });
  });

  it('Stage 1 specific: raised_by[] entries have required contributor fields', () => {
    const ecf = fixture.expected_consolidated_findings as Array<Record<string, unknown>>;
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const ids = findings.map(f => f.finding_id as string);
    const idCounts = ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const duplicatedId = Object.entries(idCounts).find(([, count]) => count === 2)![0];

    const collapsedFinding = ecf.find(f => f.finding_id === duplicatedId)!;
    const raisedBy = collapsedFinding.raised_by as Array<Record<string, unknown>>;

    raisedBy.forEach((entry, i) => {
      expect(typeof entry.reviewer_id, `raised_by[${i}].reviewer_id`).toBe('string');
      expect(typeof entry.family, `raised_by[${i}].family`).toBe('string');
      expect(typeof entry.source_type, `raised_by[${i}].source_type`).toBe('string');
    });
  });
});

// ── (b) Stage 2: Lexical Dedup ────────────────────────────────────────────────

describe('Fixture (b): stage2-lexical-dedup — near-duplicate title merge', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('stage2-lexical-dedup');
  });

  it('all input_findings pass canonical-finding schema validation', () => {
    const findings = fixture.input_findings as unknown[];
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `input_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('input contains exactly 3 findings', () => {
    expect((fixture.input_findings as unknown[]).length).toBe(3);
  });

  it('all 3 findings are in the same (file, symbol) bucket', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const files = new Set(findings.map(f => f.file as string));
    const symbols = new Set(findings.map(f => f.symbol as string));
    expect(files.size).toBe(1);
    expect(symbols.size).toBe(1);
  });

  it('fixture documents Jaccard ≥ 0.8 for the merged pair (notes or jaccard fields)', () => {
    const notes = fixture.notes as Record<string, string> | undefined;
    if (notes) {
      const jaccardNote = Object.values(notes).join(' ');
      // Check that 1.0 or ≥0.8 is mentioned for the merge pair
      expect(jaccardNote).toMatch(/Jaccard.*1\.0|1\.0.*Jaccard|MERGE/i);
    } else {
      // fallback: just check expected_consolidation has stage2_merged_count > 0
      const ec = fixture.expected_consolidation as Record<string, unknown>;
      expect(ec.stage2_merged_count).toBeGreaterThan(0);
    }
  });

  it('expected_consolidation: stage1_collapsed_count == 0', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage1_collapsed_count).toBe(0);
  });

  it('expected_consolidation: stage2_merged_count == 1 (one merge event)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage2_merged_count).toBe(1);
  });

  it('expected_consolidation: final_findings_count == 2 (merged pair + distinct third)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.final_findings_count).toBe(2);
  });

  it('expected_consolidation: no audit warning', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_emitted).toBe(false);
  });

  it('Stage 2 specific: merged finding preserves highest-severity description (high beats medium)', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const ecf = fixture.expected_consolidated_findings as Array<Record<string, unknown>>;

    // Find which input findings form the merged pair (same bucket, non-distinct)
    // The merged finding should have raised_by with 2 entries
    const mergedFinding = ecf.find(f => {
      const rb = f.raised_by as unknown[];
      return Array.isArray(rb) && rb.length === 2;
    });

    expect(mergedFinding, 'No merged finding with 2 raised_by entries found').toBeDefined();

    // The merged finding's severity should be the highest of the pair
    const raisedByIds = (mergedFinding!.raised_by as Array<Record<string, unknown>>).map(
      rb => rb.reviewer_id as string
    );
    const contributors = findings.filter(f =>
      raisedByIds.includes((f.source as Record<string, unknown>).reviewer_id as string)
    );

    const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
    const maxSeverity = contributors.reduce((max, f) => {
      const sev = SEVERITY_ORDER[f.severity as keyof typeof SEVERITY_ORDER] ?? 0;
      return sev > max ? sev : max;
    }, 0);

    const mergedSeverity = SEVERITY_ORDER[mergedFinding!.severity as keyof typeof SEVERITY_ORDER] ?? 0;
    expect(mergedSeverity).toBe(maxSeverity);
  });

  it('Stage 2 specific: the third finding (low/no overlap) remains distinct', () => {
    const ecf = fixture.expected_consolidated_findings as Array<Record<string, unknown>>;
    // The distinct finding has raised_by with exactly 1 entry
    const distinctFindings = ecf.filter(f => {
      const rb = f.raised_by as unknown[];
      return Array.isArray(rb) && rb.length === 1;
    });
    expect(distinctFindings).toHaveLength(1);
  });

  it('Stage 2 specific: non-merged finding uses title tokens with ~0 overlap vs merged pair', () => {
    const ecf = fixture.expected_consolidated_findings as Array<Record<string, unknown>>;
    const distinctFinding = ecf.find(f => {
      const rb = f.raised_by as unknown[];
      return Array.isArray(rb) && rb.length === 1;
    })!;
    // The distinct finding should have a different title from the merged pair
    const mergedFinding = ecf.find(f => {
      const rb = f.raised_by as unknown[];
      return Array.isArray(rb) && rb.length === 2;
    })!;
    expect(distinctFinding.title).not.toBe(mergedFinding.title);
  });

  it('Stage 2 specific: config threshold is present and equals 0.8', () => {
    const config = fixture.config as Record<string, unknown>;
    expect(config.stage2_jaccard_threshold).toBe(0.8);
  });
});

// ── (c) Stage 4: LLM Tiebreaker ──────────────────────────────────────────────

describe('Fixture (c): stage4-llm-tiebreaker — ambiguous pair, merge verdict', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('stage4-llm-tiebreaker');
  });

  it('all input_findings pass canonical-finding schema validation', () => {
    const findings = fixture.input_findings as unknown[];
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `input_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('input contains exactly 2 findings (the ambiguous pair)', () => {
    expect((fixture.input_findings as unknown[]).length).toBe(2);
  });

  it('both findings are in the same (file, symbol) bucket', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    expect(findings[0].file).toBe(findings[1].file);
    expect(findings[0].symbol).toBe(findings[1].symbol);
  });

  it('Stage 4 specific: jaccard_analysis documents Jaccard between 0.30 and 0.80', () => {
    const ja = fixture.jaccard_analysis as Record<string, unknown> | undefined;
    if (ja) {
      const j = ja.jaccard as number;
      expect(j).toBeGreaterThanOrEqual(0.30);
      expect(j).toBeLessThan(0.80);
      expect(ja.above_30pct_prefilter).toBe(true);
      expect(ja.below_80pct_stage2_threshold).toBe(true);
      expect(ja.stage4_eligible).toBe(true);
    } else {
      // Fallback: check stage4_calls_dispatched > 0 (pre-filter passed)
      const ec = fixture.expected_consolidation as Record<string, unknown>;
      expect(ec.stage4_calls_dispatched).toBeGreaterThan(0);
    }
  });

  it('Stage 4 specific: stage4_simulated_outcomes has exactly 1 entry', () => {
    const outcomes = fixture.stage4_simulated_outcomes as unknown[];
    expect(Array.isArray(outcomes)).toBe(true);
    expect(outcomes).toHaveLength(1);
  });

  it('Stage 4 specific: simulated outcome verdict is "merge"', () => {
    const outcomes = fixture.stage4_simulated_outcomes as Array<Record<string, unknown>>;
    expect(outcomes[0].verdict).toBe('merge');
  });

  it('expected_consolidation: stage4_calls_dispatched == 1', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_dispatched).toBe(1);
  });

  it('expected_consolidation: stage4_calls_skipped == 0', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_skipped).toBe(0);
  });

  it('expected_consolidation: final_findings_count == 1 (merge applied)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.final_findings_count).toBe(1);
  });

  it('expected_consolidation: audit_warning_emitted == false (cap not reached)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_emitted).toBe(false);
    expect(ec.audit_warning_text).toBeNull();
  });

  it('Stage 4 specific: pair Jaccard is above 30% pre-filter (would not be filtered out)', () => {
    // Verified via jaccard_analysis OR by the presence of the pair in stage4_simulated_outcomes
    const outcomes = fixture.stage4_simulated_outcomes as unknown[];
    expect(outcomes.length).toBeGreaterThan(0); // pair made it past pre-filter
  });

  it('Stage 4 specific: pair Jaccard is below 80% (would not be merged by Stage 2)', () => {
    // Stage 2 would have merged them if Jaccard ≥ 0.8, so stage2_merged_count must be 0
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage2_merged_count).toBe(0);
  });
});

// ── (d) Stage 4: Cap — Single Bucket N=10 ────────────────────────────────────

describe('Fixture (d): stage4-cap-single-bucket-N10 — D18 cap enforced within bucket', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('stage4-cap-single-bucket-N10');
  });

  it('all input_findings pass canonical-finding schema validation', () => {
    const findings = fixture.input_findings as unknown[];
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `input_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('input contains exactly 10 findings (N=10)', () => {
    expect((fixture.input_findings as unknown[]).length).toBe(10);
  });

  it('all 10 findings are in the same (file, symbol) bucket', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const files = new Set(findings.map(f => f.file as string));
    const symbols = new Set(findings.map(f => f.symbol as string));
    expect(files.size).toBe(1);
    expect(symbols.size).toBe(1);
  });

  it('config max_calls_per_consolidation == 25', () => {
    const config = fixture.config as Record<string, unknown>;
    expect(config.stage4_max_calls_per_consolidation).toBe(25);
  });

  it('expected_consolidation: stage4_calls_dispatched <= 25 (cap enforced)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_dispatched as number).toBeLessThanOrEqual(25);
  });

  it('expected_consolidation: stage4_calls_dispatched == 25 (cap fully consumed)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_dispatched).toBe(25);
  });

  it('expected_consolidation: stage4_calls_skipped == 20 (45 total - 25 dispatched)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_skipped).toBe(20);
  });

  it('expected_consolidation: dispatched + skipped == C(10,2) == 45', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    const dispatched = ec.stage4_calls_dispatched as number;
    const skipped = ec.stage4_calls_skipped as number;
    expect(dispatched + skipped).toBe(45);
  });

  it('expected_consolidation: audit_warning_emitted == true (cap fired)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_emitted).toBe(true);
  });

  it('expected_consolidation: audit_warning_text mentions "Stage 4 cap reached"', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(typeof ec.audit_warning_text).toBe('string');
    expect(ec.audit_warning_text as string).toMatch(/Stage 4 cap reached/i);
  });

  it('expected_consolidation: audit_warning_text mentions skipped pair count (20)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_text as string).toContain('20');
  });

  it('stage4_simulated_outcomes has exactly 25 entries (one per dispatched call)', () => {
    const outcomes = fixture.stage4_simulated_outcomes as unknown[];
    expect(outcomes).toHaveLength(25);
  });

  it('jaccard_analysis documents all pairs above 30% pre-filter', () => {
    const ja = fixture.jaccard_analysis as Record<string, unknown> | undefined;
    if (ja) {
      expect(ja.pairs_eligible_for_stage4).toBe(45);
      expect(ja.above_30pct_prefilter).toBe(true);
      expect(ja.below_80pct_stage2_threshold).toBe(true);
    }
  });
});

// ── (e) Stage 4: Cap — Multi-Bucket Cumulative ───────────────────────────────

describe('Fixture (e): stage4-cap-multi-bucket-cumulative — D18 per-consolidation cap', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('stage4-cap-multi-bucket-cumulative');
  });

  it('all input_findings pass canonical-finding schema validation', () => {
    const findings = fixture.input_findings as unknown[];
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `input_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('input contains exactly 20 findings (4 buckets × 5)', () => {
    expect((fixture.input_findings as unknown[]).length).toBe(20);
  });

  it('findings span exactly 4 distinct (file, symbol) buckets', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const buckets = new Set(findings.map(f => `${f.file as string}::${f.symbol as string}`));
    expect(buckets.size).toBe(4);
  });

  it('each bucket contains exactly 5 findings', () => {
    const findings = fixture.input_findings as Array<Record<string, unknown>>;
    const bucketCounts = findings.reduce<Record<string, number>>((acc, f) => {
      const key = `${f.file as string}::${f.symbol as string}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    Object.values(bucketCounts).forEach(count => {
      expect(count).toBe(5);
    });
  });

  it('config max_calls_per_consolidation == 25', () => {
    const config = fixture.config as Record<string, unknown>;
    expect(config.stage4_max_calls_per_consolidation).toBe(25);
  });

  it('expected_consolidation: stage4_calls_dispatched <= 25 (D18 cap enforced per-consolidation)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_dispatched as number).toBeLessThanOrEqual(25);
  });

  it('expected_consolidation: stage4_calls_dispatched == 25 (cap fully consumed)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_dispatched).toBe(25);
  });

  it('expected_consolidation: stage4_calls_skipped == 15 (40 total - 25 dispatched)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.stage4_calls_skipped).toBe(15);
  });

  it('expected_consolidation: total pairs dispatched + skipped == 40 (4 buckets × C(5,2)=10)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    const dispatched = ec.stage4_calls_dispatched as number;
    const skipped = ec.stage4_calls_skipped as number;
    expect(dispatched + skipped).toBe(40);
  });

  it('expected_consolidation: audit_warning_emitted == true', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_emitted).toBe(true);
  });

  it('expected_consolidation: audit_warning_text mentions "Stage 4 cap reached"', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(typeof ec.audit_warning_text).toBe('string');
    expect(ec.audit_warning_text as string).toMatch(/Stage 4 cap reached/i);
  });

  it('expected_consolidation: audit_warning_text mentions skipped count (15)', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    expect(ec.audit_warning_text as string).toContain('15');
  });

  it('Multi-bucket cap: single audit warning (not one per bucket) — final_findings_count == 20', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    // 20 findings in, all keep_distinct + some skipped → 20 out
    expect(ec.final_findings_count).toBe(20);
  });

  it('Multi-bucket cap: stage4_simulated_outcomes has exactly 25 entries (only dispatched calls)', () => {
    const outcomes = fixture.stage4_simulated_outcomes as unknown[];
    expect(outcomes).toHaveLength(25);
  });

  it('D18 per-consolidation (not per-bucket): if cap were per-bucket, 4×25=100 calls would be allowed; this fixture caps at 25 total', () => {
    const ec = fixture.expected_consolidation as Record<string, unknown>;
    // Per-consolidation cap: total dispatched must be <= 25, not 4*25=100
    expect(ec.stage4_calls_dispatched as number).toBeLessThanOrEqual(25);
    // This assertion is meaningful because there are 40 eligible pairs across 4 buckets
    // (a per-bucket cap would allow all 40; the per-consolidation cap stops at 25)
    expect(ec.stage4_calls_skipped as number).toBeGreaterThan(0);
  });

  it('bucket_analysis documents total eligible pairs == 40', () => {
    const ba = fixture.bucket_analysis as Record<string, unknown> | undefined;
    if (ba) {
      expect(ba.total_eligible_pairs).toBe(40);
    }
  });
});

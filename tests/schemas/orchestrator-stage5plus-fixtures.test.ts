/**
 * Task 32: Layer 2 fixtures for Stages 5, 5b, 6 + external aggregator.
 *
 * Verifies fixture integrity, canonical-finding schema compliance, and per-stage
 * behavioral semantics documented in:
 *   plugins/synthex/agents/multi-model-review-orchestrator.md (Steps 8d–8g)
 *
 * Also asserts that the normative orchestrator document contains required prose
 * (raw-string checks per FR-MR14a, FR-MR14b, FR-MR15).
 *
 * Fixtures covered:
 *   (a) severity-one-level-diff          — max + range, no judge step
 *   (b) severity-two-level-diff          — judge step triggered with reasoning
 *   (c) contradiction-cove-adjudicated   — 29a detects pair; 29b CoVe marks loser
 *   (c2) contradiction-29a-boundary      — boundary: same-symbol, within-5, 7+-apart
 *   (d) minority-of-one-security-not-demoted — security exemption from demotion
 *   (e) minority-of-one-non-security-demoted — standard one-level demotion
 *   (f) external-aggregator-judge-mode   — judge_mode_prompt in adapter Task call
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateCanonicalFinding } from './canonical-finding.js';

// ── Paths ────────────────────────────────────────────────────────────────────

const FIXTURES_ROOT = path.join(
  __dirname,
  '../fixtures/multi-model-review/consolidation/stage5-5b-6'
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

function loadRecordedTaskCall(scenarioDir: string): Record<string, unknown> {
  const p = path.join(FIXTURES_ROOT, scenarioDir, 'recorded-task-call.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

function loadOrchestratorMd(): string {
  return fs.readFileSync(ORCHESTRATOR_MD, 'utf8');
}

// ── Cross-fixture: orchestrator.md normative prose checks (Steps 8d–8g) ──────

describe('multi-model-review-orchestrator.md — Stage 5/5b/6 normative prose checks', () => {
  let md: string;

  beforeAll(() => {
    md = loadOrchestratorMd();
  });

  it('documents Stage 5 severity reconciliation (FR-MR14a)', () => {
    expect(md).toMatch(/Stage 5|severity reconcil/i);
  });

  it('documents one-level diff max rule (no judge step)', () => {
    expect(md).toMatch(/One-level diff|one.level/i);
  });

  it('documents two-or-more level diff triggering judge step', () => {
    expect(md).toMatch(/Two.or.more level diff|two.level/i);
  });

  it('documents severity_range field', () => {
    expect(md).toContain('severity_range');
  });

  it('documents severity_reasoning field', () => {
    expect(md).toContain('severity_reasoning');
  });

  it('documents Stage 5b contradiction scan (FR-MR14)', () => {
    expect(md).toMatch(/Stage 5b|contradiction/i);
  });

  it('documents 5-line proximity threshold for no-symbol findings', () => {
    expect(md).toMatch(/5 lines|within 5/i);
  });

  it('documents superseded_by_verification field (Stage 5b CoVe output)', () => {
    expect(md).toContain('superseded_by_verification');
  });

  it('documents verification_reasoning field (Stage 5b CoVe output)', () => {
    expect(md).toContain('verification_reasoning');
  });

  it('documents Stage 6 minority-of-one demotion (FR-MR14b)', () => {
    expect(md).toMatch(/Stage 6|minority.of.one/i);
  });

  it('documents security category exemption from minority-of-one demotion', () => {
    expect(md).toMatch(/category.*security.*DO NOT demote|security.*exempt/i);
  });

  it('documents judge_mode_prompt for external-aggregator path (FR-MR15, Step 8g)', () => {
    expect(md).toContain('judge_mode_prompt');
  });

  it('documents external-aggregator path (D17 + Step 8g)', () => {
    expect(md).toMatch(/external.*adapter|external-aggregator/i);
  });

  it('documents findings are NEVER dropped (behavioral rule)', () => {
    expect(md).toMatch(/NEVER dropped|never dropped/i);
  });
});

// ── (a) Severity: One-Level Diff ──────────────────────────────────────────────

describe('Fixture (a): severity-one-level-diff — max + range, no judge step', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('severity-one-level-diff');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings');
    expect(fixture).toHaveProperty('expected_stage5_output');
    expect(fixture).toHaveProperty('config');
  });

  it('consolidated_findings pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}] errors: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('exactly 1 consolidated finding with 2 raised_by entries (2 reviewers)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(1);
    const rb = findings[0].raised_by as unknown[];
    expect(Array.isArray(rb)).toBe(true);
    expect(rb).toHaveLength(2);
  });

  it('per_reviewer_severities has 2 entries with one-level gap (high vs medium)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    const severities = findings[0].per_reviewer_severities as Array<Record<string, unknown>>;
    expect(Array.isArray(severities)).toBe(true);
    expect(severities).toHaveLength(2);
    const sevValues = severities.map(s => s.severity as string);
    expect(sevValues).toContain('high');
    expect(sevValues).toContain('medium');
  });

  it('expected_stage5_output.severity == "high" (max wins)', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    expect(expected.severity).toBe('high');
  });

  it('expected_stage5_output.severity_range.min == "medium"', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    const range = expected.severity_range as Record<string, unknown>;
    expect(range).toBeDefined();
    expect(range.min).toBe('medium');
  });

  it('expected_stage5_output.severity_range.max == "high"', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    const range = expected.severity_range as Record<string, unknown>;
    expect(range.max).toBe('high');
  });

  it('expected_stage5_output.severity_reasoning == null (no judge step for 1-level gap)', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    expect(expected.severity_reasoning).toBeNull();
  });

  it('expected_stage5_output.judge_step_triggered == false', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    expect(expected.judge_step_triggered).toBe(false);
  });

  it('gap is exactly 1 level (verifies fixture math)', () => {
    const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    const severities = (findings[0].per_reviewer_severities as Array<Record<string, unknown>>)
      .map(s => SEVERITY_ORDER[s.severity as string] ?? 0);
    const gap = Math.abs(severities[0] - severities[1]);
    expect(gap).toBe(1);
  });
});

// ── (b) Severity: Two-Level Diff ──────────────────────────────────────────────

describe('Fixture (b): severity-two-level-diff — judge step triggered with reasoning', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('severity-two-level-diff');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings');
    expect(fixture).toHaveProperty('expected_stage5_output');
    expect(fixture).toHaveProperty('stage5_simulated_judge_verdict');
    expect(fixture).toHaveProperty('config');
  });

  it('consolidated_findings pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings as unknown[];
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('per_reviewer_severities has critical and low (>= 2-level gap)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    const severities = (findings[0].per_reviewer_severities as Array<Record<string, unknown>>)
      .map(s => s.severity as string);
    expect(severities).toContain('critical');
    expect(severities).toContain('low');
  });

  it('gap is >= 2 levels (verifies fixture triggers judge step)', () => {
    const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    const severities = (findings[0].per_reviewer_severities as Array<Record<string, unknown>>)
      .map(s => SEVERITY_ORDER[s.severity as string] ?? 0);
    const gap = Math.abs(severities[0] - severities[1]);
    expect(gap).toBeGreaterThanOrEqual(2);
  });

  it('expected_stage5_output.judge_step_triggered == true', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    expect(expected.judge_step_triggered).toBe(true);
  });

  it('expected_stage5_output.severity is the judge verdict (medium)', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    expect(expected.severity).toBe('medium');
  });

  it('expected_stage5_output.severity_range.min == "low"', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    const range = expected.severity_range as Record<string, unknown>;
    expect(range).toBeDefined();
    expect(range.min).toBe('low');
  });

  it('expected_stage5_output.severity_range.max == "critical"', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    const range = expected.severity_range as Record<string, unknown>;
    expect(range.max).toBe('critical');
  });

  it('expected_stage5_output.severity_reasoning is a non-empty string', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    expect(typeof expected.severity_reasoning).toBe('string');
    expect((expected.severity_reasoning as string).length).toBeGreaterThan(0);
  });

  it('simulated judge verdict matches expected severity', () => {
    const expected = fixture.expected_stage5_output as Record<string, unknown>;
    const verdict = fixture.stage5_simulated_judge_verdict as Record<string, unknown>;
    expect(expected.severity).toBe(verdict.verdict_severity);
  });

  it('simulated judge verdict has non-empty reasoning', () => {
    const verdict = fixture.stage5_simulated_judge_verdict as Record<string, unknown>;
    expect(typeof verdict.reasoning).toBe('string');
    expect((verdict.reasoning as string).length).toBeGreaterThan(0);
  });
});

// ── (c) Contradiction: CoVe Adjudicated ──────────────────────────────────────

describe('Fixture (c): contradiction-cove-adjudicated — 29a detects pair, 29b marks loser', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('contradiction-cove-adjudicated');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings');
    expect(fixture).toHaveProperty('stage5b_29a_detection');
    expect(fixture).toHaveProperty('stage5b_29b_cove_adjudication');
    expect(fixture).toHaveProperty('expected_stage5b_output');
  });

  it('all consolidated_findings pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('exactly 2 findings in same file + same symbol (contradiction pair)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(2);
    expect(findings[0].file).toBe(findings[1].file);
    expect(findings[0].symbol).toBe(findings[1].symbol);
    expect(findings[0].symbol).not.toBeNull();
  });

  it('stage5b_29a_detection detects 1 contradiction pair', () => {
    const detection = fixture.stage5b_29a_detection as Record<string, unknown>;
    const pairs = detection.contradiction_pairs_found as unknown[];
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs).toHaveLength(1);
  });

  it('detected pair has detection_reason == "same_file_same_symbol"', () => {
    const detection = fixture.stage5b_29a_detection as Record<string, unknown>;
    const pairs = detection.contradiction_pairs_found as Array<Record<string, unknown>>;
    expect(pairs[0].detection_reason).toBe('same_file_same_symbol');
  });

  it('29b CoVe adjudication names a winner and a loser', () => {
    const adjudication = fixture.stage5b_29b_cove_adjudication as Record<string, unknown>;
    expect(typeof adjudication.winner_finding_id).toBe('string');
    expect(typeof adjudication.loser_finding_id).toBe('string');
    expect(adjudication.winner_finding_id).not.toBe(adjudication.loser_finding_id);
  });

  it('29b CoVe adjudication has non-empty reasoning', () => {
    const adjudication = fixture.stage5b_29b_cove_adjudication as Record<string, unknown>;
    expect(typeof adjudication.cove_reasoning).toBe('string');
    expect((adjudication.cove_reasoning as string).length).toBeGreaterThan(0);
  });

  it('expected output: both findings remain (findings_count == 2)', () => {
    const expected = fixture.expected_stage5b_output as Record<string, unknown>;
    expect(expected.findings_count).toBe(2);
  });

  it('expected output: winner has superseded_by_verification == false', () => {
    const expected = fixture.expected_stage5b_output as Record<string, unknown>;
    const winner = expected.winner as Record<string, unknown>;
    expect(winner).toBeDefined();
    expect(winner.superseded_by_verification).toBe(false);
  });

  it('expected output: loser has superseded_by_verification == true', () => {
    const expected = fixture.expected_stage5b_output as Record<string, unknown>;
    const loser = expected.loser as Record<string, unknown>;
    expect(loser).toBeDefined();
    expect(loser.superseded_by_verification).toBe(true);
  });

  it('expected output: loser has non-empty verification_reasoning', () => {
    const expected = fixture.expected_stage5b_output as Record<string, unknown>;
    const loser = expected.loser as Record<string, unknown>;
    expect(typeof loser.verification_reasoning).toBe('string');
    expect((loser.verification_reasoning as string).length).toBeGreaterThan(0);
  });

  it('winner finding_id matches 29b adjudication winner', () => {
    const expected = fixture.expected_stage5b_output as Record<string, unknown>;
    const adjudication = fixture.stage5b_29b_cove_adjudication as Record<string, unknown>;
    const winner = expected.winner as Record<string, unknown>;
    expect(winner.finding_id).toBe(adjudication.winner_finding_id);
  });

  it('loser finding_id matches 29b adjudication loser', () => {
    const expected = fixture.expected_stage5b_output as Record<string, unknown>;
    const adjudication = fixture.stage5b_29b_cove_adjudication as Record<string, unknown>;
    const loser = expected.loser as Record<string, unknown>;
    expect(loser.finding_id).toBe(adjudication.loser_finding_id);
  });
});

// ── (c2) Contradiction: 29a Boundary Check ───────────────────────────────────

describe('Fixture (c2): contradiction-29a-boundary — same-symbol detected, within-5 detected, 7+-apart NOT', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('contradiction-29a-boundary');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings');
    expect(fixture).toHaveProperty('finding_groups');
    expect(fixture).toHaveProperty('expected_stage5b_29a_output');
    expect(fixture).toHaveProperty('config');
  });

  it('all 6 consolidated_findings pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings as unknown[];
    expect(findings).toHaveLength(6);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('config.stage5b_proximity_line_threshold == 5', () => {
    const config = fixture.config as Record<string, unknown>;
    expect(config.stage5b_proximity_line_threshold).toBe(5);
  });

  it('expected 29a output: exactly 2 candidate pairs', () => {
    const expected = fixture.expected_stage5b_29a_output as Record<string, unknown>;
    expect(expected.total_candidate_pairs).toBe(2);
    const pairs = expected.contradiction_candidate_pairs as unknown[];
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs).toHaveLength(2);
  });

  it('Group F1+F2: same file + same symbol → candidate with reason "same_file_same_symbol"', () => {
    const expected = fixture.expected_stage5b_29a_output as Record<string, unknown>;
    const pairs = expected.contradiction_candidate_pairs as Array<Record<string, unknown>>;
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g12 = groups.group_F1_F2 as Record<string, unknown>;
    const f1f2Ids = g12.finding_ids as string[];

    const f1f2Pair = pairs.find(p =>
      (p.finding_a_id === f1f2Ids[0] && p.finding_b_id === f1f2Ids[1]) ||
      (p.finding_a_id === f1f2Ids[1] && p.finding_b_id === f1f2Ids[0])
    );
    expect(f1f2Pair, 'F1+F2 pair not found in contradiction_candidate_pairs').toBeDefined();
    expect(f1f2Pair!.detection_reason).toBe('same_file_same_symbol');
  });

  it('Group F3+F4: same file + no symbol + within-5-line range → candidate with reason "same_file_no_symbol_proximity"', () => {
    const expected = fixture.expected_stage5b_29a_output as Record<string, unknown>;
    const pairs = expected.contradiction_candidate_pairs as Array<Record<string, unknown>>;
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g34 = groups.group_F3_F4 as Record<string, unknown>;
    const f3f4Ids = g34.finding_ids as string[];

    const f3f4Pair = pairs.find(p =>
      (p.finding_a_id === f3f4Ids[0] && p.finding_b_id === f3f4Ids[1]) ||
      (p.finding_a_id === f3f4Ids[1] && p.finding_b_id === f3f4Ids[0])
    );
    expect(f3f4Pair, 'F3+F4 pair not found in contradiction_candidate_pairs').toBeDefined();
    expect(f3f4Pair!.detection_reason).toBe('same_file_no_symbol_proximity');
  });

  it('Group F5+F6: same file + no symbol + 7+ lines apart → NOT a candidate (boundary)', () => {
    const expected = fixture.expected_stage5b_29a_output as Record<string, unknown>;
    const pairs = expected.contradiction_candidate_pairs as Array<Record<string, unknown>>;
    const nonCandidates = expected.non_candidate_pairs as Array<Record<string, unknown>>;
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g56 = groups.group_F5_F6 as Record<string, unknown>;
    const f5f6Ids = g56.finding_ids as string[];

    // F5+F6 must NOT be in candidate pairs
    const f5f6InCandidates = pairs.some(p =>
      (p.finding_a_id === f5f6Ids[0] && p.finding_b_id === f5f6Ids[1]) ||
      (p.finding_a_id === f5f6Ids[1] && p.finding_b_id === f5f6Ids[0])
    );
    expect(f5f6InCandidates, 'F5+F6 must NOT appear in contradiction_candidate_pairs (too far apart)').toBe(false);

    // F5+F6 must be in non_candidate_pairs
    const f5f6NotCandidate = nonCandidates.find(p =>
      (p.finding_a_id === f5f6Ids[0] && p.finding_b_id === f5f6Ids[1]) ||
      (p.finding_a_id === f5f6Ids[1] && p.finding_b_id === f5f6Ids[0])
    );
    expect(f5f6NotCandidate, 'F5+F6 should be listed in non_candidate_pairs').toBeDefined();
  });

  it('F5+F6 non-candidate reason documents distance > threshold', () => {
    const expected = fixture.expected_stage5b_29a_output as Record<string, unknown>;
    const nonCandidates = expected.non_candidate_pairs as Array<Record<string, unknown>>;
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g56 = groups.group_F5_F6 as Record<string, unknown>;
    const f5f6Ids = g56.finding_ids as string[];

    const f5f6Entry = nonCandidates.find(p =>
      (p.finding_a_id === f5f6Ids[0] && p.finding_b_id === f5f6Ids[1]) ||
      (p.finding_a_id === f5f6Ids[1] && p.finding_b_id === f5f6Ids[0])
    )!;
    const calculatedDistance = f5f6Entry.calculated_distance as number;
    const threshold = f5f6Entry.threshold as number;
    expect(calculatedDistance).toBeGreaterThan(threshold);
  });

  it('boundary: proximity threshold is 5 lines; F3+F4 within threshold, F5+F6 exceeds it', () => {
    const expected = fixture.expected_stage5b_29a_output as Record<string, unknown>;
    const nonCandidates = expected.non_candidate_pairs as Array<Record<string, unknown>>;
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g56 = groups.group_F5_F6 as Record<string, unknown>;
    const f5f6Ids = g56.finding_ids as string[];

    const f5f6Entry = nonCandidates.find(p =>
      (p.finding_a_id === f5f6Ids[0] && p.finding_b_id === f5f6Ids[1]) ||
      (p.finding_a_id === f5f6Ids[1] && p.finding_b_id === f5f6Ids[0])
    )!;
    // Exact boundary from fixture: F5 ends at 18, F6 starts at 60 → distance 42
    expect(f5f6Entry.calculated_distance).toBeGreaterThan(5);
    expect(f5f6Entry.threshold).toBe(5);
  });

  it('group_F1_F2 expected_candidate == true', () => {
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g12 = groups.group_F1_F2 as Record<string, unknown>;
    expect(g12.expected_candidate).toBe(true);
  });

  it('group_F3_F4 expected_candidate == true', () => {
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g34 = groups.group_F3_F4 as Record<string, unknown>;
    expect(g34.expected_candidate).toBe(true);
  });

  it('group_F5_F6 expected_candidate == false', () => {
    const groups = fixture.finding_groups as Record<string, unknown>;
    const g56 = groups.group_F5_F6 as Record<string, unknown>;
    expect(g56.expected_candidate).toBe(false);
  });
});

// ── (d) Minority-of-One: Security Not Demoted ────────────────────────────────

describe('Fixture (d): minority-of-one-security-not-demoted — security exemption', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('minority-of-one-security-not-demoted');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings');
    expect(fixture).toHaveProperty('expected_stage6_output');
    expect(fixture).toHaveProperty('config');
  });

  it('consolidated_findings pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('exactly 1 finding raised by exactly 1 reviewer (minority-of-one)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(1);
    const rb = findings[0].raised_by as unknown[];
    expect(Array.isArray(rb)).toBe(true);
    expect(rb).toHaveLength(1);
  });

  it('finding category is "security"', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings[0].category).toBe('security');
  });

  it('finding severity is "high" (pre-demotion)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings[0].severity).toBe('high');
  });

  it('expected_stage6_output.minority_of_one == true', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.minority_of_one).toBe(true);
  });

  it('expected_stage6_output.severity == "high" (NOT demoted — security exemption)', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.severity).toBe('high');
  });

  it('expected_stage6_output.severity_demoted == false', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.severity_demoted).toBe(false);
  });

  it('expected_stage6_output.exemption_applied == "security_category_exemption"', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.exemption_applied).toBe('security_category_exemption');
  });

  it('config.stage6_security_exemption == true', () => {
    const config = fixture.config as Record<string, unknown>;
    expect(config.stage6_security_exemption).toBe(true);
  });
});

// ── (e) Minority-of-One: Non-Security Demoted ────────────────────────────────

describe('Fixture (e): minority-of-one-non-security-demoted — standard one-level demotion', () => {
  let fixture: Record<string, unknown>;

  beforeAll(() => {
    fixture = loadFixture('minority-of-one-non-security-demoted');
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings');
    expect(fixture).toHaveProperty('expected_stage6_output');
    expect(fixture).toHaveProperty('config');
  });

  it('consolidated_findings pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('exactly 1 finding raised by exactly 1 reviewer (minority-of-one)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(1);
    const rb = findings[0].raised_by as unknown[];
    expect(Array.isArray(rb)).toBe(true);
    expect(rb).toHaveLength(1);
  });

  it('finding category is NOT "security"', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings[0].category).not.toBe('security');
  });

  it('finding original severity is "high" (pre-demotion)', () => {
    const findings = fixture.consolidated_findings as Array<Record<string, unknown>>;
    expect(findings[0].severity).toBe('high');
  });

  it('expected_stage6_output.minority_of_one == true', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.minority_of_one).toBe(true);
  });

  it('expected_stage6_output.severity == "medium" (demoted one level from high)', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.severity).toBe('medium');
  });

  it('expected_stage6_output.severity_demoted == true', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.severity_demoted).toBe(true);
  });

  it('expected_stage6_output.original_severity == "high"', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.original_severity).toBe('high');
  });

  it('expected_stage6_output.demoted_from == "high", demoted_to == "medium"', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.demoted_from).toBe('high');
    expect(expected.demoted_to).toBe('medium');
  });

  it('expected_stage6_output.exemption_applied == null (no exemption for correctness)', () => {
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    expect(expected.exemption_applied).toBeNull();
  });

  it('demotion is exactly one level (high → medium)', () => {
    const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const expected = fixture.expected_stage6_output as Record<string, unknown>;
    const origRank = SEVERITY_ORDER[expected.original_severity as string] ?? 0;
    const demotedRank = SEVERITY_ORDER[expected.severity as string] ?? 0;
    expect(origRank - demotedRank).toBe(1);
  });
});

// ── (f) External Aggregator: Judge-Mode Prompt Embedded ──────────────────────

describe('Fixture (f): external-aggregator-judge-mode — judge_mode_prompt in adapter Task call', () => {
  let fixture: Record<string, unknown>;
  let recordedTaskCall: Record<string, unknown>;
  let orchestratorMd: string;

  const EXPECTED_JUDGE_MODE_PROMPT =
    'You are acting as an impartial judge consolidating findings from multiple reviewers. Evaluate each finding on its merits, free of attribution bias. Position randomization has been applied to the input.';

  beforeAll(() => {
    fixture = loadFixture('external-aggregator-judge-mode');
    recordedTaskCall = loadRecordedTaskCall('external-aggregator-judge-mode');
    orchestratorMd = loadOrchestratorMd();
  });

  it('fixture.json is valid JSON with required top-level keys', () => {
    expect(fixture).toHaveProperty('consolidated_findings_ready_for_aggregation');
    expect(fixture).toHaveProperty('aggregator_resolution');
    expect(fixture).toHaveProperty('expected_assertions');
    expect(fixture).toHaveProperty('orchestrator_input');
  });

  it('all consolidated_findings_ready_for_aggregation pass canonical-finding schema validation', () => {
    const findings = fixture.consolidated_findings_ready_for_aggregation as unknown[];
    expect(Array.isArray(findings)).toBe(true);
    expect(findings).toHaveLength(4);
    findings.forEach((f, i) => {
      const result = validateCanonicalFinding(f);
      expect(result.errors, `consolidated_findings[${i}]: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  it('aggregator_resolution.name == "codex-review-prompter"', () => {
    const resolution = fixture.aggregator_resolution as Record<string, unknown>;
    expect(resolution.name).toBe('codex-review-prompter');
  });

  it('aggregator_resolution.source == "configured"', () => {
    const resolution = fixture.aggregator_resolution as Record<string, unknown>;
    expect(resolution.source).toBe('configured');
  });

  it('recorded-task-call.json exists and is valid JSON', () => {
    expect(typeof recordedTaskCall).toBe('object');
    expect(recordedTaskCall).not.toBeNull();
  });

  it('recorded Task call targets codex-review-prompter agent', () => {
    const taskCall = recordedTaskCall.task_call as Record<string, unknown>;
    expect(taskCall.agent).toBe('codex-review-prompter');
  });

  it('recorded Task call input.config.judge_mode_prompt is present', () => {
    const taskCall = recordedTaskCall.task_call as Record<string, unknown>;
    const input = taskCall.input as Record<string, unknown>;
    const config = input.config as Record<string, unknown>;
    expect(config).toHaveProperty('judge_mode_prompt');
  });

  it('recorded Task call input.config.judge_mode_prompt is non-empty', () => {
    const taskCall = recordedTaskCall.task_call as Record<string, unknown>;
    const input = taskCall.input as Record<string, unknown>;
    const config = input.config as Record<string, unknown>;
    const prompt = config.judge_mode_prompt as string;
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('recorded Task call judge_mode_prompt matches expected exact text (raw-string match)', () => {
    const taskCall = recordedTaskCall.task_call as Record<string, unknown>;
    const input = taskCall.input as Record<string, unknown>;
    const config = input.config as Record<string, unknown>;
    expect(config.judge_mode_prompt).toBe(EXPECTED_JUDGE_MODE_PROMPT);
  });

  it('orchestrator.md documents the judge_mode_prompt literal (raw-string check)', () => {
    expect(orchestratorMd).toContain('judge_mode_prompt');
  });

  it('orchestrator.md contains the exact judge_mode_prompt text from the spec', () => {
    expect(orchestratorMd).toContain(EXPECTED_JUDGE_MODE_PROMPT);
  });

  it('orchestrator.md documents external-aggregator path packaging of judge_mode_prompt', () => {
    // Must mention external adapter path for judge_mode_prompt injection
    expect(orchestratorMd).toMatch(/external.*adapter|external-aggregator/i);
  });

  it('fixture expected_assertions.judge_mode_prompt_in_config == true', () => {
    const assertions = fixture.expected_assertions as Record<string, unknown>;
    expect(assertions.judge_mode_prompt_in_config).toBe(true);
  });

  it('fixture expected_assertions.judge_mode_prompt_exact_text matches spec', () => {
    const assertions = fixture.expected_assertions as Record<string, unknown>;
    expect(assertions.judge_mode_prompt_exact_text).toBe(EXPECTED_JUDGE_MODE_PROMPT);
  });

  it('recorded Task call config has model and family fields (standard FR-MR9 envelope)', () => {
    const taskCall = recordedTaskCall.task_call as Record<string, unknown>;
    const input = taskCall.input as Record<string, unknown>;
    const config = input.config as Record<string, unknown>;
    expect(typeof config.model).toBe('string');
    expect(typeof config.family).toBe('string');
  });
});

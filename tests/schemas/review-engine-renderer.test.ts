/**
 * Task 57 (FR-HM16, D4): review-engine-renderer.test.ts.
 *
 * Validates the [T] acceptance criterion: "review-engine-renderer.test.ts
 * snapshot-matches the current review-code output template, via the pure
 * render and dedupe functions. Also cover dedupe and verdict-aggregation
 * units."
 *
 * Imports plugins/synthex/workflows/lib/review-engine.mjs directly under
 * Node/Vitest — no Workflow runtime involved. That module is the single
 * source of truth for the dedupe, verdict-aggregation, path-header, and
 * render logic the FR-HM16 Workflow engine (plugins/synthex/workflows/
 * review-code-engine.js) also carries, inlined, between a pair of sync markers;
 * tests/schemas/review-engine-sync.test.ts guards the two copies against
 * drift, so this suite only needs the standalone module.
 *
 * The render snapshot is checked against the fixed markdown template
 * embedded in plugins/synthex/commands/review-code.md's Step 5
 * ("## Code Review Report" through "### Summary") and the D21
 * path-and-reason header spec in the same file's "Path-and-Reason Header
 * Spec (D21)" section.
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateVerdict,
  countsBySeverity,
  dedupeFindings,
  jaccardSimilarity,
  normalizeTitleTokens,
  PATH_HEADER_REGEX,
  renderPathHeader,
  renderReport,
  severityRank,
  sortFindingsBySeverity,
  stampReviewerSource,
} from '../../plugins/synthex/workflows/lib/review-engine.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────

function finding(overrides = {}) {
  return {
    finding_id: 'f-1',
    severity: 'high',
    category: 'correctness',
    title: 'Missing null check',
    description: 'foo can be null before use',
    file: 'src/foo.js',
    source: { reviewer_id: 'code-reviewer', family: 'anthropic', source_type: 'native-team' },
    ...overrides,
  };
}

// ── Dedupe ───────────────────────────────────────────────────────────────

describe('Task 57 (FR-HM16): dedupeFindings', () => {
  it('Stage 1: collapses findings sharing an exact finding_id', () => {
    const { findings, duplicatesMerged, stage1Merged } = dedupeFindings([
      finding({ finding_id: 'dup-1' }),
      finding({ finding_id: 'dup-1', source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' } }),
      finding({ finding_id: 'other-1', title: 'SQL injection via string concatenation', file: 'src/other.js' }),
    ]);
    expect(findings).toHaveLength(2);
    expect(duplicatesMerged).toBe(1);
    expect(stage1Merged).toBe(1);
    const merged = findings.find((f) => f.finding_id === 'dup-1');
    expect(merged.raised_by).toHaveLength(2);
    expect(merged.raised_by.map((r) => r.reviewer_id).sort()).toEqual(['code-reviewer', 'security-reviewer']);
  });

  it('Stage 2: merges near-duplicate titles in the same file via Jaccard similarity', () => {
    const { findings, stage2Merged } = dedupeFindings([
      finding({ finding_id: 'cr-1', title: 'Missing null check on foo before dereference' }),
      finding({
        finding_id: 'sr-1',
        title: 'Missing null check on foo before dereference use',
        source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(stage2Merged).toBe(1);
    expect(findings[0].raised_by).toHaveLength(2);
  });

  it('does not merge findings in different files even with identical titles', () => {
    const { findings } = dedupeFindings([
      finding({ finding_id: 'cr-1', file: 'src/a.js' }),
      finding({ finding_id: 'sr-1', file: 'src/b.js' }),
    ]);
    expect(findings).toHaveLength(2);
  });

  it('does not merge dissimilar titles in the same file', () => {
    const { findings } = dedupeFindings([
      finding({ finding_id: 'cr-1', title: 'Missing null check' }),
      finding({ finding_id: 'sr-1', title: 'SQL injection via string concatenation' }),
    ]);
    expect(findings).toHaveLength(2);
  });

  it('merged findings carry the highest severity seen and flag disagreement', () => {
    const { findings } = dedupeFindings([
      finding({ finding_id: 'dup-2', severity: 'medium' }),
      finding({ finding_id: 'dup-2', severity: 'critical', source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' } }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].severity_disagreement).toBe(true);
  });

  it('never drops a finding — total raised_by attributions are conserved', () => {
    const input = [
      finding({ finding_id: 'a' }),
      finding({ finding_id: 'a', source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' } }),
      finding({ finding_id: 'b', title: 'SQL injection via string concatenation', file: 'src/other.js' }),
    ];
    const { findings } = dedupeFindings(input);
    const totalAttributions = findings.reduce((sum, f) => sum + f.raised_by.length, 0);
    expect(totalAttributions).toBe(3);
  });

  it('handles an empty input', () => {
    const { findings, duplicatesMerged } = dedupeFindings([]);
    expect(findings).toEqual([]);
    expect(duplicatesMerged).toBe(0);
  });

  it('handles findings with no finding_id without throwing (falls through to Stage 2 only)', () => {
    const { findings } = dedupeFindings([
      finding({ finding_id: undefined, title: 'Alpha issue' }),
      finding({ finding_id: undefined, title: 'Totally unrelated beta problem' }),
    ]);
    expect(findings).toHaveLength(2);
  });
});

// ── Live-run defect 3: cross-reviewer duplicates at the same location ────
//
// A Task 57 [H] live run showed code-reviewer and security-reviewer both
// reporting the same 4 issues in a planted-issue diff, with different
// finding_id, title, and category on every pair — the pre-fix dedupe
// (Stage 2 gated only on a >=0.8 title Jaccard, regardless of location)
// merged none of them, rendering 8 CRITICAL/HIGH entries instead of 4.
describe('Task 57 (live-run defect 3): cross-reviewer duplicates at the same location', () => {
  it('merges two findings at an overlapping location with only a moderate title match, even with different finding_id/title/category', () => {
    // Real titles from the live run: different word order/phrasing
    // (Jaccard 0.667 — below the 0.8 strong-match threshold) but the same
    // symbol and overlapping line_range.
    const a = finding({
      finding_id: 'users-js-getuser-sql-injection',
      category: 'Correctness',
      title: 'getUser regressed from parameterized query to string-concatenated SQL (SQL injection)',
      symbol: 'getUser',
      line_range: { start: 3, end: 5 },
    });
    const b = finding({
      finding_id: 'SEC-SQLI-GETUSER-STRING-CONCAT',
      category: 'Input Validation & Injection Prevention',
      title: 'SQL injection in getUser via string-concatenated query',
      symbol: 'getUser',
      line_range: { start: 5, end: 8 },
      source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
    });
    const { findings } = dedupeFindings([a, b]);
    expect(findings).toHaveLength(1);
    expect(findings[0].raised_by.map((r) => r.reviewer_id).sort()).toEqual(['code-reviewer', 'security-reviewer']);
  });

  it('does NOT merge two genuinely different issues at the same location and same symbol (disjoint titles)', () => {
    // Real case from the live run: code-reviewer filed two DIFFERENT
    // retryFetch issues at the identical line_range {8,15} — location
    // overlap alone must not be sufficient to merge them.
    const swallowsErrors = finding({
      finding_id: 'users-js-retryfetch-swallows-errors',
      title: 'retryFetch silently swallows all errors and can return undefined without signaling failure',
      symbol: 'retryFetch',
      line_range: { start: 8, end: 15 },
    });
    const secretLeaked = finding({
      finding_id: 'users-js-retryfetch-secret-leaked-to-arbitrary-url',
      title: 'Secret API key attached as Authorization header to an arbitrary, caller-supplied URL',
      symbol: 'retryFetch',
      line_range: { start: 8, end: 15 },
    });
    const { findings } = dedupeFindings([swallowsErrors, secretLeaked]);
    expect(findings).toHaveLength(2);
  });

  it('matches the real 8-finding live-run fixture: collapses to exactly 4, each attributed to both reviewers', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const fixturePath = fileURLToPath(
      new URL('../fixtures/review-engine/live-run-t57-cross-reviewer-duplicates.json', import.meta.url),
    );
    const rawFindings = JSON.parse(await readFile(fixturePath, 'utf8'));
    expect(rawFindings).toHaveLength(8);

    const { findings, duplicatesMerged } = dedupeFindings(rawFindings);

    expect(findings).toHaveLength(4);
    expect(duplicatesMerged).toBe(4);
    for (const f of findings) {
      const reviewerIds = f.raised_by.map((r) => r.reviewer_id).sort();
      expect(reviewerIds, `finding "${f.title}" should be attributed to both reviewers`).toEqual([
        'code-reviewer',
        'security-reviewer',
      ]);
    }
    // No CRITICAL/HIGH finding silently vanished — every consolidated
    // finding's severity is still CRITICAL or HIGH.
    for (const f of findings) {
      expect(['critical', 'high']).toContain(f.severity);
    }
  });
});

// ── Live-run defect 5 (category half): a merged finding must keep BOTH
// reviewers' categories, not silently drop one on a severity tie ────────
describe('Task 57 (live-run defect 5): merged findings preserve every contributing category', () => {
  it('keeps both categories, joined, when two reviewers file the same issue under different categories', () => {
    // Real case from the live run: the hardcoded secret was CRITICAL for
    // both reviewers (a severity tie), so the old tie-break silently kept
    // only the first-seen (code-reviewer's "Correctness"), discarding
    // security-reviewer's "Secrets & Sensitive Data Leakage".
    const a = finding({ finding_id: 'cr-1', category: 'Correctness', severity: 'critical' });
    const b = finding({
      finding_id: 'sr-1',
      category: 'Secrets & Sensitive Data Leakage',
      severity: 'critical',
      source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
    });
    const { findings } = dedupeFindings([a, b]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('Correctness / Secrets & Sensitive Data Leakage');
  });

  it('does not duplicate a category both reviewers happened to agree on', () => {
    const a = finding({ finding_id: 'cr-1', category: 'Correctness', severity: 'high' });
    const b = finding({
      finding_id: 'sr-1',
      category: 'Correctness',
      severity: 'high',
      source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
    });
    const { findings } = dedupeFindings([a, b]);
    expect(findings[0].category).toBe('Correctness');
  });

  it('still defaults to "uncategorized" at render time only when every contributing finding truly had none', () => {
    const a = finding({ finding_id: 'cr-1', category: undefined, severity: 'high' });
    const report = renderReport({
      pathHeader: renderPathHeader({ mode: 'native-only', reason: 'x', nativeCount: 1 }),
      reviewed: 'x',
      date: '2026-09-30',
      reviewerTable: [],
      findings: [a],
      positives: [],
      summary: 's',
    });
    expect(report).toContain('- **Category:** uncategorized');
  });
});

// ── Live-run defect 4: "Raised by: unknown" on every finding ────────────
//
// The forced reviewer envelope schema does not require `source`, and
// reviewer agents reliably omit it — the Task 57 live run rendered
// "Raised by: unknown" on every finding. The script stamps `source` from
// the reviewer it knows it just invoked; this is the pure function that
// does that stamping, tested independently of the script's orchestration.
describe('Task 57 (live-run defect 4): stampReviewerSource', () => {
  it('sets source.reviewer_id on findings that have no source at all', () => {
    const raw = [
      { finding_id: 'f-1', severity: 'high', category: 'c', title: 't', description: 'd', file: 'src/x.js' },
    ];
    const stamped = stampReviewerSource(raw, { reviewer_id: 'code-reviewer', family: 'anthropic', source_type: 'native-team' });
    expect(stamped[0].source).toEqual({ reviewer_id: 'code-reviewer', family: 'anthropic', source_type: 'native-team' });
  });

  it('overwrites a self-reported source rather than trusting it — the script call site is authoritative', () => {
    const raw = [
      { finding_id: 'f-1', severity: 'high', category: 'c', title: 't', description: 'd', file: 'src/x.js', source: { reviewer_id: 'wrong-name', family: 'anthropic', source_type: 'native-team' } },
    ];
    const stamped = stampReviewerSource(raw, { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' });
    expect(stamped[0].source.reviewer_id).toBe('security-reviewer');
  });

  it('end-to-end: an unstamped finding no longer renders "Raised by: unknown" after stamping + dedupe + render', () => {
    const raw = stampReviewerSource(
      [{ finding_id: 'f-1', severity: 'high', category: 'c', title: 't', description: 'd', file: 'src/x.js' }],
      { reviewer_id: 'code-reviewer', family: 'anthropic', source_type: 'native-team' },
    );
    const { findings } = dedupeFindings(raw);
    const report = renderReport({
      pathHeader: renderPathHeader({ mode: 'native-only', reason: 'x', nativeCount: 1 }),
      reviewed: 'x',
      date: '2026-09-30',
      reviewerTable: [],
      findings,
      positives: [],
      summary: 's',
    });
    expect(report).not.toContain('Raised by: unknown');
    expect(report).toContain('- **Raised by:** code-reviewer (anthropic)');
  });

  it('drops null/undefined entries and preserves array order', () => {
    const raw = [{ finding_id: 'a' }, null, { finding_id: 'b' }];
    const stamped = stampReviewerSource(raw, { reviewer_id: 'code-reviewer', family: 'anthropic', source_type: 'native-team' });
    expect(stamped.map((f) => f.finding_id)).toEqual(['a', 'b']);
  });
});

describe('Task 57: dedupe helpers (jaccardSimilarity, normalizeTitleTokens, severityRank)', () => {
  it('jaccardSimilarity is 1 for identical token sets and 0 for disjoint sets', () => {
    const a = normalizeTitleTokens('Missing null check on foo');
    expect(jaccardSimilarity(a, a)).toBe(1);
    const b = normalizeTitleTokens('SQL injection in query builder');
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('normalizeTitleTokens lowercases, strips punctuation, and drops stopwords', () => {
    const tokens = normalizeTitleTokens('The Missing Null-Check on the Foo!');
    expect(tokens.has('missing')).toBe(true);
    expect(tokens.has('null')).toBe(true);
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('on')).toBe(false);
  });

  it('severityRank orders critical > high > medium > low', () => {
    expect(severityRank('critical')).toBeGreaterThan(severityRank('high'));
    expect(severityRank('high')).toBeGreaterThan(severityRank('medium'));
    expect(severityRank('medium')).toBeGreaterThan(severityRank('low'));
    expect(severityRank('unknown')).toBe(0);
  });
});

// ── Verdict aggregation ──────────────────────────────────────────────────

describe('Task 57 (FR-HM16): aggregateVerdict', () => {
  it('FAIL when any CRITICAL finding is present', () => {
    expect(aggregateVerdict([finding({ severity: 'critical' })])).toBe('FAIL');
  });

  it('FAIL when any HIGH finding is present', () => {
    expect(aggregateVerdict([finding({ severity: 'high' })])).toBe('FAIL');
  });

  it('FAIL when CRITICAL/HIGH are mixed with lower severities', () => {
    expect(aggregateVerdict([finding({ severity: 'low' }), finding({ severity: 'high' })])).toBe('FAIL');
  });

  it('WARN when only MEDIUM findings are present', () => {
    expect(aggregateVerdict([finding({ severity: 'medium' })])).toBe('WARN');
  });

  it('PASS when only LOW findings are present', () => {
    expect(aggregateVerdict([finding({ severity: 'low' })])).toBe('PASS');
  });

  it('PASS on an empty findings list', () => {
    expect(aggregateVerdict([])).toBe('PASS');
  });

  it('countsBySeverity tallies each severity independently', () => {
    const counts = countsBySeverity([
      finding({ severity: 'critical' }),
      finding({ severity: 'high' }),
      finding({ severity: 'high' }),
      finding({ severity: 'low' }),
    ]);
    expect(counts).toEqual({ critical: 1, high: 2, medium: 0, low: 1 });
  });

  it('sortFindingsBySeverity orders CRITICAL first, then HIGH, MEDIUM, LOW', () => {
    const sorted = sortFindingsBySeverity([
      finding({ severity: 'low', finding_id: 'l' }),
      finding({ severity: 'critical', finding_id: 'c' }),
      finding({ severity: 'medium', finding_id: 'm' }),
      finding({ severity: 'high', finding_id: 'h' }),
    ]);
    expect(sorted.map((f) => f.finding_id)).toEqual(['c', 'h', 'm', 'l']);
  });
});

// ── Path-and-Reason Header (D21) ─────────────────────────────────────────

describe('Task 57: renderPathHeader (D21 literal regex)', () => {
  it('native-only format matches the D21 regex and PRD example 4 shape', () => {
    const header = renderPathHeader({
      mode: 'native-only',
      reason: 'below-threshold diff',
      nativeCount: 2,
    });
    expect(header).toBe('Review path: native-only (below-threshold diff; reviewers: 2 native)');
    expect(PATH_HEADER_REGEX.test(header)).toBe(true);
  });

  it('multi-model with-externals format matches the D21 regex and PRD example 1 shape', () => {
    const header = renderPathHeader({
      mode: 'multi-model',
      reason: 'above-threshold diff',
      nativeCount: 2,
      externalCount: 2,
    });
    expect(header).toBe('Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)');
    expect(PATH_HEADER_REGEX.test(header)).toBe(true);
  });

  it('multi-model failed-externals qualifier format matches the D21 regex and PRD example 6 shape', () => {
    const header = renderPathHeader({
      mode: 'multi-model',
      reason: 'above-threshold diff',
      nativeCount: 2,
      externalQualifier: '0 external succeeded',
    });
    expect(header).toBe('Review path: multi-model (above-threshold diff; reviewers: 2 native, 0 external succeeded)');
    expect(PATH_HEADER_REGEX.test(header)).toBe(true);
  });

  it('throws on an invalid mode rather than emitting a header that fails the D21 regex', () => {
    expect(() => renderPathHeader({ mode: 'bogus', reason: 'x', nativeCount: 1 })).toThrow();
  });
});

// ── Render (snapshot) ────────────────────────────────────────────────────

describe('Task 57 (FR-HM16): renderReport snapshot-matches the review-code.md template', () => {
  const pathHeader = renderPathHeader({
    mode: 'native-only',
    reason: 'native review via the FR-HM16 workflow engine',
    nativeCount: 2,
  });

  const reviewerTable = [
    { name: 'code-reviewer', verdict: 'FAIL', summary: '1 HIGH' },
    { name: 'security-reviewer', verdict: 'PASS', summary: '0 findings' },
  ];

  const findings = [
    finding({
      finding_id: 'cr-1',
      severity: 'high',
      title: 'Missing null check',
      line_range: { start: 12, end: 14 },
      symbol: 'processFoo',
    }),
    finding({
      finding_id: 'cr-2',
      severity: 'low',
      category: 'style',
      title: 'Inconsistent quote style',
      description: 'Mixed single/double quotes in the same file',
      file: 'src/bar.js',
    }),
  ];

  it('matches the fixed markdown template structure', () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable,
      findings,
      positives: ['Clean function decomposition', 'Good test coverage'],
      summary: 'One HIGH finding should be addressed before merge; otherwise the change looks solid.',
    });
    expect(report).toMatchSnapshot();
  });

  it('contains every section heading from the review-code.md template, in order', () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable,
      findings,
      positives: ['Clean function decomposition'],
      summary: 'Summary text.',
    });
    const headingsInOrder = [
      '## Code Review Report',
      '### Reviewed:',
      '### Date:',
      '### Overall Verdict:',
      '| Reviewer | Verdict | Findings |',
      '### CRITICAL Findings',
      '### HIGH Findings',
      '### MEDIUM Findings',
      '### LOW Findings',
      "### What's Done Well",
      '### Summary',
    ];
    let cursor = -1;
    for (const heading of headingsInOrder) {
      const idx = report.indexOf(heading);
      expect(idx, `missing or out of order: ${heading}`).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it('prefixes the output with a D21-valid path-and-reason header as the first line', () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable,
      findings,
      positives: [],
      summary: 'Summary.',
    });
    expect(report.split('\n')[0]).toBe(pathHeader);
    expect(PATH_HEADER_REGEX.test(report.split('\n')[0])).toBe(true);
  });

  it('the rendered Overall Verdict always agrees with aggregateVerdict(findings)', () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable,
      findings,
      positives: [],
      summary: 'Summary.',
    });
    expect(report).toContain(`### Overall Verdict: ${aggregateVerdict(findings)}`);
  });

  it('renders "No <SEVERITY> findings." for empty severity buckets rather than an empty section', () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable,
      findings: [finding({ severity: 'high' })],
      positives: [],
      summary: 'Summary.',
    });
    expect(report).toContain('### CRITICAL Findings\nNo CRITICAL findings.');
    expect(report).toContain('### MEDIUM Findings\nNo MEDIUM findings.');
    expect(report).toContain('### LOW Findings\nNo LOW findings.');
  });

  it("falls back to a placeholder sentence when there are no positives, but the What's Done Well section is still present", () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable,
      findings: [],
      positives: [],
      summary: 'Summary.',
    });
    expect(report).toContain("### What's Done Well\nNo specific positives were called out this cycle.");
  });

  it('renders an empty findings list as an overall PASS with all four sections marked empty', () => {
    const report = renderReport({
      pathHeader,
      reviewed: 'staged changes',
      date: '2026-09-30',
      reviewerTable: [],
      findings: [],
      positives: ['Nothing to flag'],
      summary: 'Clean change.',
    });
    expect(report).toContain('### Overall Verdict: PASS');
    expect(report).toContain('No CRITICAL findings.');
    expect(report).toContain('No HIGH findings.');
    expect(report).toContain('No MEDIUM findings.');
    expect(report).toContain('No LOW findings.');
  });
});

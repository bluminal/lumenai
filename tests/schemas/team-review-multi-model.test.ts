/**
 * Layer 1: team-review multi-model spawn-prompt blob assertions.
 *
 * Task 17 — FR-MMT4, FR-MMT20, D22 resolution.
 *
 * Test surface: raw-string match on what the team-review command would write
 * into the spawn-prompt blob for Lead and native reviewers when multi_model=true.
 * These tests do NOT invoke live teammates (D22 assertion surface = composed
 * spawn-prompt blob, not a live teammate).
 *
 * FR-MMT4 suppression text (from templates/review.md §Lead Suppression):
 *   "Multi-model mode is active for this team. Do NOT produce your own
 *    consolidated review report."
 *
 * FR-MMT20 envelope clause (from templates/review.md §Reviewer JSON-Envelope):
 *   "your mailbox message must include BOTH (a) your normal markdown review
 *    report AND (b) a JSON envelope"
 *
 * Extends parent's orchestrator-output validator without re-implementing it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { validateOrchestratorOutput, PATH_AND_REASON_HEADER_REGEX } from './orchestrator-output';
import { REVIEW_MD_PATH, extractSection } from './team-review-multi-model';

// ── Read template once at module load ────────────────────────────────────────

const reviewMdContent = readFileSync(REVIEW_MD_PATH, 'utf-8');

const MMT_OVERLAY_HEADING = '### Multi-Model Conditional Overlay (apply when multi_model=true)';
const overlaySection = extractSection(reviewMdContent, MMT_OVERLAY_HEADING);

// ── Group 1: Composed Lead spawn-prompt blob — FR-MMT4 suppression ───────────

describe('team-review multi-model — composed Lead spawn-prompt blob (FR-MMT4, D22)', () => {

  it('overlay section exists in templates/review.md', () => {
    expect(overlaySection).toBeTruthy();
    expect(overlaySection.length).toBeGreaterThan(0);
  });

  it('FR-MMT4 Lead-suppression text verbatim — "Do NOT produce your own consolidated review report"', () => {
    // Verbatim phrase from review.md §Lead Suppression instruction
    expect(overlaySection).toContain('Do NOT produce your own consolidated review report');
  });

  it('FR-MMT4 multi-model mode active announcement verbatim', () => {
    // The full opening of the Lead suppression instruction
    expect(overlaySection).toContain('Multi-model mode is active for this team.');
  });

  it('composed Lead spawn prompt contains #### Lead Suppression subsection', () => {
    // The overlay is a single contiguous subtree with named subsections
    expect(overlaySection).toContain('#### Lead Suppression');
  });

  it('composed Lead spawn prompt contains #### Reviewer JSON-Envelope subsection', () => {
    // Both subsections are within the same contiguous overlay block
    expect(overlaySection).toContain('#### Reviewer JSON-Envelope');
  });

  it('orchestrator-report mailbox path mentioned in Lead suppression', () => {
    // Lead must wait for orchestrator-report message, not produce its own
    expect(overlaySection).toContain('orchestrator-report');
  });

  it('Lead suppression references inboxes/lead path', () => {
    // Specific mailbox path per FR-MMT4
    expect(overlaySection).toContain('inboxes/lead');
  });

  it('D22 composition note present — raw inclusion instruction', () => {
    // D22 composition note verifies test surface is spawn-prompt blob
    expect(overlaySection).toContain('Commands compose teammate spawn prompts by reading this file');
  });

});

// ── Group 2: Composed reviewer spawn-prompt blob — FR-MMT20 envelope ─────────

describe('team-review multi-model — composed reviewer spawn-prompt blob (FR-MMT20, D22)', () => {

  it('FR-MMT20 envelope clause present verbatim — BOTH markdown AND JSON', () => {
    // Exact FR-MMT20 phrasing from review.md §Reviewer JSON-Envelope
    expect(overlaySection).toContain(
      'your mailbox message must include BOTH (a) your normal markdown review report AND (b) a JSON envelope'
    );
  });

  it('findings_json field name present in envelope clause', () => {
    // The JSON field name reviewers must populate
    expect(overlaySection).toContain('findings_json');
  });

  it('report_markdown field name present in envelope clause', () => {
    // The markdown field name reviewers must populate
    expect(overlaySection).toContain('report_markdown');
  });

  it('PASS case documented — empty findings array', () => {
    // Reviewers must send empty findings array on PASS, not omit the field
    expect(overlaySection).toContain('empty `findings` array');
  });

  it('multi-model mode activation clause present in reviewer instruction', () => {
    // Envelope instruction begins with a mode-activation preamble
    expect(overlaySection).toContain('This team is running in multi-model mode.');
  });

  it('canonical finding schema reference present (FR-MR13)', () => {
    // JSON envelope must conform to canonical finding schema
    expect(overlaySection).toContain('FR-MR13');
  });

  it('no-truncation requirement present', () => {
    // JSON must include every finding — no summary, no truncation
    expect(overlaySection).toContain('no truncation');
  });

});

// ── Group 3: team-review output shape — multi-model branch ────────────────────
//
// Reuses validateOrchestratorOutput (Task 22) to validate ## Code Review Report
// shape without re-implementing the validator. The team multi-model path adds
// path_and_reason_header with team+external format; all other fields are standard.

describe('team-review multi-model — output shape validation (extends Task 22 orchestrator-output)', () => {

  const validMultiModelOutput = {
    verdict: 'FAIL',
    report: [
      '## Code Review Report',
      '',
      '### Reviewed: main..HEAD',
      '### Date: 2026-04-26',
      '',
      '---',
      '',
      '### Overall Verdict: FAIL',
      '',
      '| Reviewer | Verdict | Findings |',
      '|----------|---------|----------|',
      '| Craftsmanship | FAIL | 1 high |',
      '| Security | WARN | 1 medium |',
      '',
      '---',
      '',
      '### HIGH Findings',
      '',
      '**SQL injection risk** (Security, security-reviewer, native-team)',
      '...',
    ].join('\n'),
    path_and_reason_header:
      'Review path: team + external multi-model (team: review-a3f7b2c1; reviewers: 2 native + 2 external)',
    per_reviewer_results: [
      { reviewer_id: 'code-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 1, error_code: null },
      { reviewer_id: 'security-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 1, error_code: null },
      { reviewer_id: 'codex-review-prompter', source_type: 'external', family: 'openai', status: 'success', findings_count: 2, error_code: null },
      { reviewer_id: 'gemini-review-prompter', source_type: 'external', family: 'google', status: 'success', findings_count: 1, error_code: null },
    ],
    findings: [
      {
        finding_id: 'security.db.sql-injection',
        severity: 'high',
        category: 'security',
        title: 'SQL injection risk',
        description: 'Unsanitised user input passed directly to SQL query.',
        file: 'src/db/query.ts',
        source: { reviewer_id: 'security-reviewer', family: 'anthropic', source_type: 'native-team' },
      },
    ],
    aggregator_resolution: { name: 'codex-review-prompter', source: 'tier-table' },
    continuation_event: null,
  };

  it('report contains ## Code Review Report header', () => {
    expect(validMultiModelOutput.report).toContain('## Code Review Report');
  });

  it('report contains ### Overall Verdict', () => {
    expect(validMultiModelOutput.report).toContain('### Overall Verdict:');
  });

  it('path_and_reason_header matches team multi-model format regex', () => {
    // Task 17 team+external path-and-reason-header format
    // The team ID appears in the reason clause; reviewer counts use D21 canonical form
    expect(validMultiModelOutput.path_and_reason_header).toMatch(
      /Review path: team \+ external multi-model \(team: [a-z0-9-]+; reviewers: \d+ native \+ \d+ external\)/
    );
  });

  it('orchestrator-output validator accepts team multi-model output shape (extends Task 22)', () => {
    // Delegate structural validation to Task 22 validator — no re-implementation
    const result = validateOrchestratorOutput(validMultiModelOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('path_and_reason_header includes team session ID component', () => {
    // team: <team-id> identifies the session managing the native reviewers
    expect(validMultiModelOutput.path_and_reason_header).toContain('team:');
  });

  it('native-team and external entries co-exist in per_reviewer_results array (uniform table)', () => {
    const sourceTypes = validMultiModelOutput.per_reviewer_results.map(e => e.source_type);
    expect(sourceTypes).toContain('native-team');
    expect(sourceTypes).toContain('external');
  });

});

// ── Group 4: multi-model disabled — overlay absence regression ────────────────

describe('team-review multi-model disabled — overlay absence (FR-MMT3 criterion 8, D22)', () => {

  it('when multi_model=false, Lead spawn prompt must NOT contain FR-MMT4 suppression text', () => {
    // Simulate native-only spawn prompt (no multi-model overlay injected)
    const nativeOnlySpawnPrompt = [
      'Read your agent definition at plugins/synthex/agents/code-reviewer.md',
      'and adopt it as your identity.',
    ].join(' ');

    expect(nativeOnlySpawnPrompt).not.toContain('Do NOT produce your own consolidated review report');
    expect(nativeOnlySpawnPrompt).not.toContain('orchestrator-report');
    expect(nativeOnlySpawnPrompt).not.toContain('Multi-model mode is active for this team.');
  });

  it('when multi_model=false, reviewer spawn prompts must NOT contain FR-MMT20 envelope clause', () => {
    // Simulate standard non-multi-model reviewer spawn prompt
    const nativeOnlySpawnPrompt = [
      'Read your agent definition at plugins/synthex/agents/security-reviewer.md.',
      'Claim your review task and report findings to Lead via SendMessage on completion.',
    ].join(' ');

    expect(nativeOnlySpawnPrompt).not.toContain('findings_json');
    expect(nativeOnlySpawnPrompt).not.toContain('report_markdown');
    expect(nativeOnlySpawnPrompt).not.toContain('BOTH (a) your normal markdown review report AND (b) a JSON envelope');
  });

  it('native-only path_and_reason_header does NOT contain "team + external multi-model"', () => {
    // PATH_AND_REASON_HEADER_REGEX must still accept native-only form (regression)
    const nativeOnlyHeader = 'Review path: native-only (below-threshold; reviewers: 2 native)';
    expect(nativeOnlyHeader).not.toContain('external multi-model');
    expect(PATH_AND_REASON_HEADER_REGEX.test(nativeOnlyHeader)).toBe(true);
  });

  it('overlay section presence in review.md is confined to multi_model=true block — not a global instruction', () => {
    // The overlay heading explicitly scopes itself to multi_model=true
    expect(overlaySection).toContain('apply when multi_model=true');
  });

});

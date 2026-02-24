/**
 * Schema validator for Architect output (Plan Review mode).
 *
 * Validates output against the Mode 1: Plan Review structure
 * defined in plugins/autonomous-org/agents/architect.md.
 *
 * The Architect operates in two modes: Plan Review and ADR authoring.
 * This validator focuses on the Plan Review mode, which produces
 * a structured finding-based review similar to other advisory agents.
 *
 * Accepts both strict format (hand-crafted inline samples) and
 * flexible format (real agent output with emojis, varied headings).
 */

import {
  parseMarkdownOutput,
  areFindingsSorted,
  isVerdictConsistent,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Expected Sections ────────────────────────────────────────────

const EXPECTED_SECTIONS = [
  ['Summary', 'Executive Summary', 'Overview', 'Architectural Assessment'],
  ['Findings', 'Architectural Findings', 'Review Findings', 'Issues'],
];

// ── Finding Required Fields ──────────────────────────────────────

const FINDING_REQUIRED_FIELDS = [
  'Section',
  'Issue',
  'Suggestion',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateArchitectOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for plan review heading or verdict
  const hasPlanReviewHeading = text.match(/implementation plan review.*architect/i) ||
    text.match(/architect.*review/i);
  const hasVerdict = parsed.verdict !== null;

  // Architect may produce ADR output or Plan Review output
  // For plan reviews, we expect findings and a summary
  if (!hasVerdict && !hasPlanReviewHeading) {
    // Check if this is an ADR instead
    const isADR = text.match(/^#\s+ADR-\d+/m) || text.match(/architecture decision record/i);
    if (!isADR) {
      warnings.push('Could not detect plan review heading or verdict — output may not be a standard plan review or ADR');
    }
  }

  // 2. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. Findings validation (when present)
  if (parsed.findings.length > 0) {
    for (const finding of parsed.findings) {
      const hasAnyFields = Object.keys(finding.fields).length > 0;

      if (hasAnyFields) {
        for (const field of FINDING_REQUIRED_FIELDS) {
          if (!finding.fields[field]) {
            warnings.push(`Finding "${finding.title}" missing field: "${field}"`);
          }
        }
      }
    }

    // Check severity sorting
    if (!areFindingsSorted(parsed.findings)) {
      warnings.push('Findings are not sorted by severity (expected: CRITICAL > HIGH > MEDIUM > LOW)');
    }
  }

  // 4. Verdict consistency
  if (parsed.verdict && parsed.findings.length > 0) {
    if (!isVerdictConsistent(parsed.verdict, parsed.findings)) {
      const severities = parsed.findings.map(f => f.severity);
      warnings.push(
        `Verdict "${parsed.verdict}" may be inconsistent with findings [${severities.join(', ')}]. ` +
        'CRITICAL/HIGH → FAIL, MEDIUM-only → WARN, LOW/none → PASS'
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validator for ADR output (Mode 2).
 */
export function validateADROutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for ADR heading
  if (!text.match(/^#\s+ADR-\d+/m)) {
    errors.push('Missing ADR heading: expected "# ADR-NNN: [Title]"');
  }

  // 2. Required sections for ADR
  const requiredADRSections = [
    ['Status'],
    ['Context'],
    ['Decision'],
    ['Consequences'],
    ['Alternatives Considered', 'Alternatives'],
  ];

  for (const group of requiredADRSections) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      errors.push(`Missing required ADR section: one of [${group.join(', ')}]`);
    }
  }

  // 3. Alternatives table — should have at least 2 alternatives
  const altTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('alternative')
  );
  if (altTable && altTable.rows.length < 2) {
    warnings.push('ADR should have at least 2 alternatives considered');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

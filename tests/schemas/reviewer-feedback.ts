/**
 * Schema validator for Peer Review Feedback output.
 *
 * Validates the structured feedback format that reviewers produce
 * during the write-implementation-plan peer review loop.
 * Defined in write-implementation-plan.md (lines 139-162).
 */

import {
  parseMarkdownOutput,
  areFindingsSorted,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Required Sections ────────────────────────────────────────────

const REQUIRED_SECTIONS = ['Findings', 'Summary'];

// ── Finding Fields (for plan review feedback) ────────────────────

const FINDING_REQUIRED_FIELDS = ['Section', 'Issue', 'Suggestion'];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateReviewerFeedbackOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Top heading must identify the reviewer role
  const topHeading = text.match(/^##\s+Implementation Plan Review\s+—\s+(.+)$/m);
  if (!topHeading) {
    errors.push('Missing heading: expected "## Implementation Plan Review — [Reviewer Role]"');
  }

  // 2. Required sections
  for (const required of REQUIRED_SECTIONS) {
    if (!findSection(parsed.sections, required)) {
      errors.push(`Missing required section: "${required}"`);
    }
  }

  // 3. Findings validation
  if (parsed.findings.length > 0) {
    for (const finding of parsed.findings) {
      for (const field of FINDING_REQUIRED_FIELDS) {
        if (!finding.fields[field]) {
          errors.push(`Finding "${finding.title}" missing required field: "${field}"`);
        }
      }
    }

    // Check severity sorting
    if (!areFindingsSorted(parsed.findings)) {
      errors.push('Findings are not sorted by severity (expected: CRITICAL → HIGH → MEDIUM → LOW)');
    }
  }

  // 4. Summary section should contain overall assessment
  const summary = findSection(parsed.sections, 'Summary');
  if (summary && summary.content.trim() === '') {
    errors.push('Summary section is empty (must contain overall assessment)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

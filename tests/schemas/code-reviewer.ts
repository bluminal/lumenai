/**
 * Schema validator for Code Reviewer output.
 *
 * Validates output against the structure defined in
 * plugins/synthex/agents/code-reviewer.md.
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
// Accept alternative names the agent may use.

const EXPECTED_SECTIONS = [
  ['Summary', 'Executive Summary', 'Overview'],
  ['Findings', 'Code Review Findings', 'Issues'],
  ['Specification Compliance', 'Spec Compliance', 'Specifications'],
  ['Convention Compliance', 'Convention Adherence', 'Coding Standards', 'Standards'],
  ['Reuse Opportunities', 'Reuse', 'Existing Patterns', 'Duplication'],
  ['What\'s Done Well', 'Strengths', 'Positives', 'Good Patterns', 'Commendations'],
  ['Recommendations', 'Suggestions', 'Next Steps', 'General Recommendations'],
];

// ── Finding Required Fields (strict format only) ─────────────────

const FINDING_REQUIRED_FIELDS = [
  'Category',
  'Location',
  'Issue',
  'Why this matters',
  'Suggestion',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateCodeReviewerOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Verdict — must have a verdict somewhere
  if (!parsed.verdict) {
    errors.push('Missing verdict: could not detect PASS, WARN, or FAIL in output');
  } else if (parsed.agentType !== 'code-review') {
    warnings.push(`Agent type detected as "${parsed.agentType}" instead of "code-review"`);
  }

  // 2. Expected sections — warn if missing (not errors)
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. "What's Done Well" section — required per agent spec (behavioral rule #4)
  const hasDoneWell = ['What\'s Done Well', 'Strengths', 'Positives', 'Good Patterns', 'Commendations']
    .some(name => findSection(parsed.sections, name));
  if (!hasDoneWell) {
    warnings.push('Missing "What\'s Done Well" section — required by code reviewer spec (behavioral rule #4)');
  }

  // 4. Findings validation (when present)
  if (parsed.findings.length > 0) {
    for (const finding of parsed.findings) {
      const hasAnyFields = Object.keys(finding.fields).length > 0;

      // Only check required fields if the finding uses the strict field format
      if (hasAnyFields) {
        for (const field of FINDING_REQUIRED_FIELDS) {
          if (!finding.fields[field]) {
            warnings.push(`Finding "${finding.title}" missing field: "${field}"`);
          }
        }
      }

      // Check for educational content ("Why this matters" or similar explanation)
      if (hasAnyFields && !finding.fields['Why this matters'] && !finding.fields['Reason'] && !finding.fields['Explanation']) {
        const hasExplanation = Object.keys(finding.fields).some(key =>
          key.toLowerCase().includes('why') || key.toLowerCase().includes('reason') || key.toLowerCase().includes('explanation')
        );
        if (!hasExplanation) {
          warnings.push(`Finding "${finding.title}" missing educational context (expected "Why this matters" field)`);
        }
      }
    }

    // Check severity sorting
    if (!areFindingsSorted(parsed.findings)) {
      warnings.push('Findings are not sorted by severity (expected: CRITICAL > HIGH > MEDIUM > LOW)');
    }
  }

  // 5. Verdict consistency (when both verdict and findings are available)
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

export { parseMarkdownOutput };

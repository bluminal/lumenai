/**
 * Schema validator for Security Reviewer output.
 *
 * Validates output against the structure defined in
 * plugins/autonomous-org/agents/security-reviewer.md.
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

// ── Required Sections ────────────────────────────────────────────
// Accept alternative names the agent may use.

// All section groups are treated as optional because the agent may
// inline summaries into verdict headings, omit sections when not
// applicable, or use entirely different heading structures.
const EXPECTED_SECTIONS = [
  ['Summary', 'Executive Summary', 'Overview', 'What\'s Done Well'],
  ['Findings', 'Critical Findings', 'Security Findings'],
  ['Secrets Scan', 'Secrets', 'Credential Scan'],
  ['Dependency Audit', 'Dependencies', 'Supply Chain'],
  ['Recommendations', 'Required Actions', 'Priority Summary', 'Next Steps', 'The Fix'],
];

// ── Finding Required Fields (strict format only) ─────────────────

const FINDING_REQUIRED_FIELDS = [
  'CWE',
  'Category',
  'Risk',
  'Location',
  'Description',
  'Proof',
  'Remediation',
  'References',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateSecurityReviewerOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Verdict — must have a verdict somewhere
  if (!parsed.verdict) {
    errors.push('Missing verdict: could not detect PASS, WARN, or FAIL in output');
  } else if (parsed.agentType !== 'security') {
    warnings.push(`Agent type detected as "${parsed.agentType}" instead of "security"`);
  }

  // 2. Expected sections — warn if missing (not errors)
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
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

      // CWE reference check — warn instead of error for flexible format
      if (!finding.cweReference) {
        const hasSomeReference = text.match(/CWE-\d+|OWASP|A\d{2}:\d{4}/);
        if (!hasSomeReference) {
          warnings.push(`Finding "${finding.title}" missing CWE/OWASP reference`);
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

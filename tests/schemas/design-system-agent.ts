/**
 * Schema validator for Design System Agent output (Compliance Review mode).
 *
 * Validates output against the Mode 2: Compliance Review structure
 * defined in plugins/autonomous-org/agents/design-system-agent.md.
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
  ['Summary', 'Overview', 'Compliance Summary'],
  ['Token Violations', 'Token Issues', 'Hardcoded Values', 'Token Compliance'],
  ['Component Usage Issues', 'Component Issues', 'Component Compliance'],
  ['Accessibility Findings', 'Accessibility', 'A11y Findings', 'WCAG'],
  ['Recommendations', 'Suggestions', 'Next Steps'],
];

// ── Finding Required Fields ──────────────────────────────────────

const FINDING_REQUIRED_FIELDS = [
  'Location',
  'Issue',
  'Recommendation',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateDesignSystemOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Verdict — must have a verdict somewhere
  if (!parsed.verdict) {
    errors.push('Missing verdict: could not detect PASS, WARN, or FAIL in output');
  } else if (parsed.agentType !== 'design-system') {
    warnings.push(`Agent type detected as "${parsed.agentType}" instead of "design-system"`);
  }

  // 2. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. Token violations table (when Token Violations section exists)
  const tokenSection = findSection(parsed.sections, 'Token Violations')
    || findSection(parsed.sections, 'Token Issues')
    || findSection(parsed.sections, 'Hardcoded Values');
  if (tokenSection) {
    const tokenTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('token') ||
      t.sectionTitle.toLowerCase().includes('hardcoded')
    );
    if (tokenTable) {
      const hasLocationCol = tokenTable.headers.some(h =>
        h.toLowerCase().includes('location') || h.toLowerCase().includes('file')
      );
      if (!hasLocationCol) {
        warnings.push('Token violations table missing Location/File column');
      }
    }
  }

  // 4. Findings validation (when present)
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

  // 5. Verdict consistency
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

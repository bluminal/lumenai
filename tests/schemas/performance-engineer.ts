/**
 * Schema validator for Performance Engineer output.
 *
 * Validates output against the Performance Analysis Report structure
 * defined in plugins/synthex/agents/performance-engineer.md.
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
  ['Summary', 'Executive Summary', 'Overview', 'Performance Summary'],
  ['Performance Budget', 'Budget', 'Budget Status'],
  ['Findings', 'Performance Findings', 'Issues', 'Analysis'],
  ['Optimization Opportunities', 'Optimizations', 'Recommendations', 'Priority Matrix'],
];

// ── Finding Required Fields ──────────────────────────────────────

const FINDING_REQUIRED_FIELDS = [
  'Category',
  'Impact',
  'Location',
  'Remediation',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validatePerformanceEngineerOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for performance context
  if (parsed.agentType !== 'performance') {
    warnings.push(`Agent type detected as "${parsed.agentType}" instead of "performance"`);
  }

  // 2. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. Performance budget table (should exist)
  const budgetTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('budget') ||
    t.sectionTitle.toLowerCase().includes('performance')
  );
  if (budgetTable) {
    const hasMetricCol = budgetTable.headers.some(h =>
      h.toLowerCase().includes('metric') || h.toLowerCase().includes('measure')
    );
    const hasStatusCol = budgetTable.headers.some(h =>
      h.toLowerCase().includes('status') || h.toLowerCase().includes('pass') || h.toLowerCase().includes('result')
    );
    if (!hasMetricCol) {
      warnings.push('Performance budget table missing Metric column');
    }
    if (!hasStatusCol) {
      warnings.push('Performance budget table missing Status column');
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

        // Check for quantified impact (key behavioral rule)
        const impactValue = finding.fields['Impact'] || finding.fields['Expected Improvement'] || '';
        const hasQuantifiedImpact = impactValue.match(/\d+\s*(ms|KB|MB|GB|s|queries|%|bytes)/i);
        if (!hasQuantifiedImpact) {
          warnings.push(`Finding "${finding.title}" impact should be quantified with specific units (ms, KB, queries, etc.)`);
        }
      }
    }

    // Check severity sorting
    if (!areFindingsSorted(parsed.findings)) {
      warnings.push('Findings are not sorted by severity (expected: CRITICAL > HIGH > MEDIUM > LOW)');
    }

    // FR-HM17 (Task 29, D18): optional "- **Verification:**" line. Present
    // only under `code_review.verification: prose`; absent under the default
    // `off`. Never an error — verification never blocks the review.
    for (const finding of parsed.findings) {
      if (finding.fields['Verification'] && !finding.verification) {
        warnings.push(
          `Finding "${finding.title}" has a Verification field that does not match ` +
          '"CONFIRMED (lsp|grep) | PLAUSIBLE (none)"'
        );
      } else if (finding.verification) {
        const { status, method } = finding.verification;
        if (status === 'CONFIRMED' && method === 'none') {
          warnings.push(`Finding "${finding.title}": CONFIRMED verification should name a method (lsp|grep), not "none"`);
        }
        if (status === 'PLAUSIBLE' && method !== 'none') {
          warnings.push(`Finding "${finding.title}": PLAUSIBLE verification should use method "none"`);
        }
      }
    }
  }

  // 5. Verdict consistency (if verdict present)
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

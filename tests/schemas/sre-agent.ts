/**
 * Schema validator for SRE Agent output (Reliability Review mode).
 *
 * Validates output against the Reliability Review structure
 * defined in plugins/autonomous-org/agents/sre-agent.md.
 *
 * Accepts both strict format (hand-crafted inline samples) and
 * flexible format (real agent output with emojis, varied headings).
 */

import {
  parseMarkdownOutput,
  areFindingsSorted,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Expected Sections ────────────────────────────────────────────

const EXPECTED_SECTIONS = [
  ['Summary', 'Executive Summary', 'Overview', 'Reliability Summary'],
  ['SLO Coverage', 'SLOs', 'Service Level Objectives'],
  ['Findings', 'Reliability Findings', 'Issues'],
  ['Observability Assessment', 'Observability', 'Monitoring'],
  ['Deployment Assessment', 'Deployment', 'Deployment Strategy'],
  ['Runbook Coverage', 'Runbooks', 'Operational Readiness'],
  ['Recommendations', 'Priority Actions', 'Next Steps'],
];

// ── Finding Required Fields ──────────────────────────────────────

const FINDING_REQUIRED_FIELDS = [
  'Category',
  'Risk',
  'Recommendation',
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateSREAgentOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for reliability context
  if (parsed.agentType !== 'reliability') {
    warnings.push(`Agent type detected as "${parsed.agentType}" instead of "reliability"`);
  }

  // 2. Check for readiness verdict (READY / NEEDS WORK / NOT READY)
  // SRE uses a different verdict scheme than PASS/WARN/FAIL
  const hasReadinessVerdict = text.match(/\b(READY|NEEDS WORK|NOT READY)\b/i);
  const hasStandardVerdict = parsed.verdict !== null;

  if (!hasReadinessVerdict && !hasStandardVerdict) {
    warnings.push('Missing readiness verdict: expected READY, NEEDS WORK, or NOT READY (or standard PASS/WARN/FAIL)');
  }

  // 3. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 4. SLO Coverage table (should exist)
  const sloTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('slo') ||
    t.sectionTitle.toLowerCase().includes('service level')
  );
  if (sloTable) {
    const hasJourneyCol = sloTable.headers.some(h =>
      h.toLowerCase().includes('journey') || h.toLowerCase().includes('sli') || h.toLowerCase().includes('service')
    );
    if (!hasJourneyCol) {
      warnings.push('SLO Coverage table missing Journey/SLI column');
    }
  }

  // 5. Observability assessment table (should exist)
  const obsTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('observability') ||
    t.sectionTitle.toLowerCase().includes('monitoring')
  );
  if (obsTable) {
    const hasSignalCol = obsTable.headers.some(h =>
      h.toLowerCase().includes('signal') || h.toLowerCase().includes('type') || h.toLowerCase().includes('category')
    );
    if (!hasSignalCol) {
      warnings.push('Observability assessment table missing Signal/Type column');
    }
  }

  // 6. Findings validation (when present)
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

    if (!areFindingsSorted(parsed.findings)) {
      warnings.push('Findings are not sorted by severity (expected: CRITICAL > HIGH > MEDIUM > LOW)');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

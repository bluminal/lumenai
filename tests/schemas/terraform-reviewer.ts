/**
 * Schema validator for Terraform Plan Reviewer output.
 *
 * Validates output against the structure defined in
 * plugins/synthex/agents/terraform-plan-reviewer.md.
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

// ── Required Sections ─────────────────────────────────────────────
// Accept alternative names the agent may use for each concept.

const REQUIRED_SECTION_GROUPS = [
  ['Summary', 'Executive Summary', 'Overview'],
  ['Cost Impact', 'Cost Analysis', 'Cost', 'Cost Estimate'],
];

// These sections are expected but not required — the agent may inline
// them into other sections or omit them when not applicable.
const OPTIONAL_SECTIONS = [
  ['Destructive Actions', 'Destructive Changes', 'Resource Inventory'],
  ['Security Concerns', 'Security Findings', 'Security', 'Risk Assessment'],
  ['Best Practice Violations', 'Best Practices', 'Compliance'],
  ['Findings Detail', 'Findings', 'Critical Findings', 'Required Actions'],
];

// ── Finding Required Fields ──────────────────────────────────────

const FINDING_REQUIRED_FIELDS = ['Resource', 'Risk', 'Description', 'Recommendation'];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateTerraformReviewerOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Verdict — must have a verdict somewhere
  if (!parsed.verdict) {
    errors.push('Missing verdict: could not detect PASS, WARN, or FAIL in output');
  } else if (parsed.agentType !== 'terraform') {
    // Only warn — agent type detection is heuristic
    warnings.push(`Agent type detected as "${parsed.agentType}" instead of "terraform"`);
  }

  // 2. Required sections present (at least one alias must match)
  for (const group of REQUIRED_SECTION_GROUPS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      errors.push(`Missing required section: one of [${group.join(', ')}]`);
    }
  }

  // 3. Optional sections — warn if missing
  for (const group of OPTIONAL_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Optional section not found: one of [${group.join(', ')}]`);
    }
  }

  // 4. Cost information format — accept various wordings
  const costSection = findSection(parsed.sections, 'Cost Impact')
    || findSection(parsed.sections, 'Cost Analysis')
    || findSection(parsed.sections, 'Cost');
  if (costSection) {
    const fullContent = costSection.content + '\n' + costSection.subsections.map(s => s.content).join('\n');
    const hasCostInfo =
      fullContent.match(/\*\*Estimated Monthly (Change|Cost)/i) ||
      text.match(/\*\*Estimated Monthly (Change|Cost)/i) ||
      fullContent.match(/Est\.\s*Cost/i) ||
      fullContent.match(/monthly\s*(cost|impact|change)/i);
    if (!hasCostInfo) {
      warnings.push('Cost section does not contain estimated monthly cost/change information');
    }
  }

  // 5. Findings validation (when present)
  if (parsed.findings.length > 0) {
    // Check required fields on each finding (only for strict-format findings)
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

  // 6. Verdict consistency (when both verdict and findings are available)
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

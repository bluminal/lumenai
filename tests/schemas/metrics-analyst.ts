/**
 * Schema validator for Metrics Analyst output.
 *
 * Validates output against the Metrics Report structure
 * defined in plugins/synthex/agents/metrics-analyst.md.
 *
 * The Metrics Analyst produces structured reports covering
 * DORA metrics, HEART/AARRR frameworks, and OKR tracking.
 * This is a purely advisory agent with no verdict — validation
 * focuses on report structure and content quality.
 */

import {
  parseMarkdownOutput,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Expected Sections ────────────────────────────────────────────

const EXPECTED_SECTIONS = [
  ['Period', 'Date', 'Reporting Period', 'Timeframe'],
  ['Engineering Effectiveness', 'DORA', 'Engineering Metrics', 'Delivery Metrics'],
  ['Key Insights', 'Insights', 'Analysis', 'Observations'],
  ['Recommended Action', 'Recommendations', 'Action Items', 'Suggested Action'],
  ['Context', 'Caveats', 'Context & Caveats', 'Notes'],
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateMetricsAnalystOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for metrics report context
  const isMetricsReport = text.match(/metrics report|engineering.*metrics|DORA|engineering effectiveness/i);
  const isOKRReport = text.match(/OKR|objective|key result/i);

  if (!isMetricsReport && !isOKRReport) {
    warnings.push('Output does not appear to be a Metrics Report or OKR Report');
  }

  // 2. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. DORA metrics table (should exist in engineering effectiveness report)
  if (isMetricsReport) {
    const doraTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('dora') ||
      t.sectionTitle.toLowerCase().includes('engineering') ||
      t.sectionTitle.toLowerCase().includes('effectiveness') ||
      t.sectionTitle.toLowerCase().includes('delivery')
    );
    if (doraTable) {
      const hasMetricCol = doraTable.headers.some(h =>
        h.toLowerCase().includes('metric') || h.toLowerCase().includes('measure')
      );
      if (!hasMetricCol) {
        warnings.push('DORA metrics table missing Metric column');
      }

      // Should include benchmark comparison
      const hasBenchmarkCol = doraTable.headers.some(h =>
        h.toLowerCase().includes('benchmark') || h.toLowerCase().includes('elite') || h.toLowerCase().includes('target')
      );
      if (!hasBenchmarkCol) {
        warnings.push('DORA metrics table missing Benchmark/Target column');
      }
    }
  }

  // 4. Check for quantitative content (not just qualitative)
  const hasNumbers = text.match(/\d+%|\d+\.\d+|\d+\s*(ms|s|hours|days|deploys)/i);
  if (!hasNumbers) {
    warnings.push('Report should contain quantitative data (percentages, durations, counts)');
  }

  // 5. Check for vanity metric warnings (behavioral rule #5)
  const hasVanityMetric = text.match(/lines of code|commit count|story points completed|hours worked/i);
  if (hasVanityMetric) {
    const hasVanityWarning = text.match(/vanity|not correlated|should not be used/i);
    if (!hasVanityWarning) {
      warnings.push('Report mentions vanity metrics without appropriate caveats');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

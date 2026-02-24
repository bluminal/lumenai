/**
 * Schema validator for Quality Engineer output (Coverage Analysis mode).
 *
 * Validates output against the Mode 2: Coverage Analysis structure
 * defined in plugins/autonomous-org/agents/quality-engineer.md.
 *
 * The Quality Engineer operates in three modes:
 * 1. Test Writing (execution — produces code)
 * 2. Coverage Analysis (advisory — produces report)
 * 3. Test Strategy Design (planning — produces strategy)
 *
 * This validator focuses on Coverage Analysis, which is the testable
 * advisory output mode.
 */

import {
  parseMarkdownOutput,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Expected Sections ────────────────────────────────────────────

const EXPECTED_SECTIONS = [
  ['Summary', 'Overview', 'Coverage Summary'],
  ['Coverage Report', 'Coverage', 'Coverage Metrics'],
  ['Gap Analysis', 'Gaps', 'Test Gaps', 'Uncovered Areas'],
  ['Test Quality Assessment', 'Quality Assessment', 'Test Quality'],
  ['Test Strategy Recommendations', 'Strategy', 'Recommendations'],
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateQualityEngineerOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for coverage analysis context
  const isCoverageAnalysis = text.match(/test coverage analysis|coverage report|gap analysis/i);
  const isTestStrategy = text.match(/test strategy|testing pyramid/i);

  if (!isCoverageAnalysis && !isTestStrategy) {
    warnings.push('Output does not appear to be a Coverage Analysis or Test Strategy — expected "Test Coverage Analysis" heading or similar');
  }

  // 2. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. Coverage table (should exist)
  const coverageTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('coverage') ||
    t.sectionTitle.toLowerCase().includes('module')
  );
  if (coverageTable) {
    const hasModuleCol = coverageTable.headers.some(h =>
      h.toLowerCase().includes('module') || h.toLowerCase().includes('component') || h.toLowerCase().includes('file')
    );
    const hasCoverageCol = coverageTable.headers.some(h =>
      h.toLowerCase().includes('%') || h.toLowerCase().includes('line') || h.toLowerCase().includes('coverage')
    );
    if (!hasModuleCol) {
      warnings.push('Coverage table missing Module/Component column');
    }
    if (!hasCoverageCol) {
      warnings.push('Coverage table missing coverage percentage column');
    }
  }

  // 4. Gap analysis entries should have priority
  const gapSection = findSection(parsed.sections, 'Gap Analysis')
    || findSection(parsed.sections, 'Gaps')
    || findSection(parsed.sections, 'Test Gaps');
  if (gapSection) {
    const hasPriority = gapSection.content.match(/P[1-3]|priority|critical|high|medium/i) ||
      gapSection.subsections.some(s => s.title.match(/P[1-3]/));
    if (!hasPriority) {
      warnings.push('Gap Analysis entries should include priority levels (P1/P2/P3)');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

/**
 * Schema validator for Implementation Plan output.
 *
 * Validates output against the template defined in
 * plugins/synthex/agents/product-manager.md and
 * plugins/synthex/commands/write-implementation-plan.md (lines 212-251).
 */

import {
  parseMarkdownOutput,
  findSection,
  type ParsedOutput,
  type Table,
} from './helpers.js';

// ── Required Sections ────────────────────────────────────────────

const REQUIRED_SECTIONS = ['Overview', 'Decisions', 'Open Questions'];

// ── Decisions Table Columns ──────────────────────────────────────

const DECISIONS_TABLE_HEADERS = ['#', 'Decision', 'Context', 'Rationale'];

// ── Open Questions Table Columns ─────────────────────────────────

const OPEN_QUESTIONS_TABLE_HEADERS = ['#', 'Question', 'Impact', 'Status'];

// ── Task Table Columns ───────────────────────────────────────────

const TASK_TABLE_HEADERS = ['#', 'Task', 'Complexity', 'Dependencies', 'Status'];

// ── Valid Complexity Values ──────────────────────────────────────

const VALID_COMPLEXITY = ['S', 'M', 'L'];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateImplementationPlanOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Top-level heading
  if (!text.match(/^#\s+Implementation Plan:/m)) {
    errors.push('Missing top heading: expected "# Implementation Plan: [Product Name]"');
  }

  // 2. Required sections present
  for (const required of REQUIRED_SECTIONS) {
    if (!findSection(parsed.sections, required)) {
      errors.push(`Missing required section: "${required}"`);
    }
  }

  // 3. At least one Phase section
  const phasePattern = /^##\s+Phase\s+\d+/m;
  if (!text.match(phasePattern)) {
    errors.push('Missing Phase section: expected at least one "## Phase N: [Name]"');
  }

  // 4. At least one Milestone section
  const milestonePattern = /^###\s+Milestone\s+\d+\.\d+/m;
  if (!text.match(milestonePattern)) {
    errors.push('Missing Milestone section: expected at least one "### Milestone N.N: [Name]"');
  }

  // 5. Decisions table structure
  const decisionsTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('decisions')
  );
  if (decisionsTable) {
    for (const header of DECISIONS_TABLE_HEADERS) {
      if (!decisionsTable.headers.some(h => h.toLowerCase().includes(header.toLowerCase()))) {
        errors.push(`Decisions table missing column: "${header}"`);
      }
    }
  } else {
    warnings.push('No table found in Decisions section');
  }

  // 6. Open Questions table structure
  const questionsTable = parsed.tables.find(t =>
    t.sectionTitle.toLowerCase().includes('open questions')
  );
  if (questionsTable) {
    for (const header of OPEN_QUESTIONS_TABLE_HEADERS) {
      if (!questionsTable.headers.some(h => h.toLowerCase().includes(header.toLowerCase()))) {
        errors.push(`Open Questions table missing column: "${header}"`);
      }
    }
  } else {
    warnings.push('No table found in Open Questions section');
  }

  // 7. Task tables in milestones
  const taskTables = parsed.tables.filter(t =>
    t.sectionTitle.toLowerCase().includes('milestone')
  );
  for (const table of taskTables) {
    // Check headers
    for (const header of TASK_TABLE_HEADERS) {
      if (!table.headers.some(h => h.toLowerCase().includes(header.toLowerCase()))) {
        errors.push(`Task table in "${table.sectionTitle}" missing column: "${header}"`);
      }
    }

    // Check complexity values
    const complexityIdx = table.headers.findIndex(h =>
      h.toLowerCase().includes('complexity')
    );
    if (complexityIdx >= 0) {
      for (const row of table.rows) {
        const val = row[complexityIdx]?.trim();
        if (val && !VALID_COMPLEXITY.includes(val)) {
          warnings.push(
            `Task table in "${table.sectionTitle}": invalid complexity "${val}" (expected S, M, or L)`
          );
        }
      }
    }
  }

  // 8. Parallelizable callout
  if (!text.includes('**Parallelizable:**')) {
    warnings.push('Missing "**Parallelizable:**" callout (should be present in each milestone)');
  }

  // 9. Milestone Value callout
  if (!text.includes('**Milestone Value:**')) {
    warnings.push('Missing "**Milestone Value:**" callout (should be present in each milestone)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

/**
 * Schema validator for Retrospective Facilitator output.
 *
 * Validates output against the Retrospective Document structure
 * defined in plugins/synthex/agents/retrospective-facilitator.md.
 *
 * The Retrospective Facilitator produces structured retrospective
 * documents that include planned-vs-actual analysis, format-specific
 * content, improvement items, and celebration sections.
 */

import {
  parseMarkdownOutput,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Expected Sections ────────────────────────────────────────────

const EXPECTED_SECTIONS = [
  ['Previous Improvement Items', 'Follow-Up', 'Previous Items', 'Last Retro Follow-Up'],
  ['Planned vs. Actual', 'Execution Summary', 'Planned vs Actual', 'Delivery Analysis'],
  ['Improvement Items', 'Improvements', 'Action Items', 'Next Steps'],
  ['Celebration', 'Wins', 'Celebrate', 'What Went Well'],
];

// ── Retrospective Formats ────────────────────────────────────────
// One of these format-specific sections should be present

const FORMAT_SECTIONS = [
  // Start / Stop / Continue
  ['Start', 'Stop', 'Continue'],
  // 4Ls
  ['Liked', 'Learned', 'Lacked', 'Longed For'],
  // Sailboat
  ['Wind', 'Anchor', 'Rocks', 'Island'],
];

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ────────────────────────────────────────────────────

export function validateRetrospectiveOutput(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Check for retrospective context
  const isRetro = text.match(/retrospective|retro/i);
  if (!isRetro) {
    warnings.push('Output does not appear to be a Retrospective document');
  }

  // 2. Expected sections — warn if missing
  for (const group of EXPECTED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      warnings.push(`Expected section not found: one of [${group.join(', ')}]`);
    }
  }

  // 3. Check for at least one retrospective format
  let hasFormatSections = false;
  for (const format of FORMAT_SECTIONS) {
    const matchCount = format.filter(name => findSection(parsed.sections, name)).length;
    if (matchCount >= 2) { // At least 2 sections from a format
      hasFormatSections = true;
      break;
    }
  }
  if (!hasFormatSections) {
    warnings.push('No recognizable retrospective format sections found (expected Start/Stop/Continue, 4Ls, or Sailboat)');
  }

  // 4. Improvement items limit check (behavioral rule #4: max 2-3)
  const improvementSection = findSection(parsed.sections, 'Improvement Items')
    || findSection(parsed.sections, 'Improvements')
    || findSection(parsed.sections, 'Action Items');
  if (improvementSection) {
    // Count improvement sub-sections (Improvement 1, Improvement 2, etc.)
    const improvementCount = improvementSection.subsections.length;
    if (improvementCount > 3) {
      warnings.push(`Too many improvement items: ${improvementCount} (maximum should be 3 per behavioral rule #4)`);
    }
  }

  // 5. Follow-through tracking (behavioral rule #3)
  const followUpSection = findSection(parsed.sections, 'Previous Improvement Items')
    || findSection(parsed.sections, 'Follow-Up')
    || findSection(parsed.sections, 'Previous Items');
  if (followUpSection) {
    const followUpTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('previous') ||
      t.sectionTitle.toLowerCase().includes('follow')
    );
    if (followUpTable) {
      const hasStatusCol = followUpTable.headers.some(h =>
        h.toLowerCase().includes('status')
      );
      if (!hasStatusCol) {
        warnings.push('Previous Improvement Items table missing Status column');
      }
    }
  }

  // 6. Celebration section — required (behavioral rule #6)
  const hasCelebration = ['Celebration', 'Wins', 'Celebrate', 'What Went Well']
    .some(name => findSection(parsed.sections, name));
  if (!hasCelebration) {
    warnings.push('Missing Celebration section — required by retrospective facilitator spec (behavioral rule #6)');
  }

  // 7. Blameless language check (behavioral rule #1)
  const blamePatterns = /\b(he|she|they)\s+(failed|forgot|missed|didn't|should have)\b/i;
  if (blamePatterns.test(text)) {
    warnings.push('Output may contain blame language — retrospectives should focus on systems and processes, not individuals');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { parseMarkdownOutput };

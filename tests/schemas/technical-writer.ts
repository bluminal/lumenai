/**
 * Schema validator for Technical Writer output.
 *
 * Validates output against the documentation type structures
 * defined in plugins/synthex/agents/technical-writer.md.
 *
 * The Technical Writer produces various document types:
 * 1. API Documentation
 * 2. User Guide / Feature Guide
 * 3. Migration Guide
 * 4. Changelog Entry
 * 5. README
 * 6. Documentation Inventory (audit)
 *
 * This validator handles all six types.
 */

import {
  parseMarkdownOutput,
  findSection,
  type ParsedOutput,
} from './helpers.js';

// ── Validation Results ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Document Type Detection ──────────────────────────────────────

type DocType = 'api-doc' | 'user-guide' | 'migration-guide' | 'changelog' | 'readme' | 'doc-inventory' | 'unknown';

function detectDocType(text: string): DocType {
  if (text.match(/^##\s+(API|Endpoint|Function)/m) && text.match(/quick start|parameters|response/i)) return 'api-doc';
  if (text.match(/migration guide|breaking changes|before.*after/i) && text.match(/v\d+.*to.*v\d+|upgrade/i)) return 'migration-guide';
  if (text.match(/^##\s+\[?\d+\.\d+/m) && text.match(/### (Added|Changed|Fixed|Removed)/)) return 'changelog';
  if (text.match(/^#\s+\w/m) && text.match(/quick start|features|contributing|license/i)) return 'readme';
  if (text.match(/documentation inventory|coverage assessment/i)) return 'doc-inventory';
  if (text.match(/getting started|what it does|common tasks|troubleshooting/i)) return 'user-guide';
  return 'unknown';
}

// ── Validators by Document Type ──────────────────────────────────

function validateAPIDoc(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have Quick Start / Example
  if (!findSection(parsed.sections, 'Quick Start') && !findSection(parsed.sections, 'Examples')) {
    errors.push('API Documentation must include a "Quick Start" or "Examples" section');
  }

  // Should have Parameters table
  if (!findSection(parsed.sections, 'Parameters')) {
    warnings.push('Missing "Parameters" section');
  }

  // Should have Response section
  if (!findSection(parsed.sections, 'Response') && !findSection(parsed.sections, 'Return Value')) {
    warnings.push('Missing "Response" or "Return Value" section');
  }

  // Must have code blocks (examples)
  const hasCodeBlocks = text.match(/```[\s\S]*?```/);
  if (!hasCodeBlocks) {
    errors.push('API Documentation must include code examples');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateMigrationGuide(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have Breaking Changes
  if (!findSection(parsed.sections, 'Breaking Changes')) {
    errors.push('Migration Guide must include "Breaking Changes" section');
  }

  // Should have before/after examples
  const hasBeforeAfter = text.match(/before.*\(v|after.*\(v|before:.*\n.*```|after:.*\n.*```/i);
  if (!hasBeforeAfter) {
    warnings.push('Migration Guide should include before/after code examples');
  }

  // Should have migration steps
  if (!text.match(/migration steps|step \d+|1\.\s/i)) {
    warnings.push('Migration Guide should include migration steps');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateChangelog(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have at least one of: Added, Changed, Fixed, Removed
  const categories = ['Added', 'Changed', 'Fixed', 'Removed', 'Deprecated'];
  const found = categories.filter(c => findSection(parsed.sections, c));
  if (found.length === 0) {
    errors.push('Changelog must include at least one of: Added, Changed, Fixed, Removed, Deprecated');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateREADME(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have Quick Start
  if (!findSection(parsed.sections, 'Quick Start') && !findSection(parsed.sections, 'Getting Started')) {
    errors.push('README must include "Quick Start" or "Getting Started" section');
  }

  // Should have code block with commands
  const hasCodeBlocks = text.match(/```(bash|sh|shell)[\s\S]*?```/);
  if (!hasCodeBlocks) {
    warnings.push('README Quick Start should include bash commands');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateDocInventory(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have Coverage Assessment
  if (!findSection(parsed.sections, 'Coverage Assessment') && !findSection(parsed.sections, 'Coverage')) {
    errors.push('Documentation Inventory must include "Coverage Assessment" section');
  }

  // Should have Gaps section
  if (!findSection(parsed.sections, 'Gaps')) {
    warnings.push('Missing "Gaps" section');
  }

  // Should have Recommendations
  if (!findSection(parsed.sections, 'Recommendations')) {
    warnings.push('Missing "Recommendations" section');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateUserGuide(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Should have "What It Does" or similar intro
  if (!findSection(parsed.sections, 'What It Does') && !findSection(parsed.sections, 'Overview')) {
    warnings.push('User Guide should include "What It Does" or "Overview" section');
  }

  // Should have Getting Started
  if (!findSection(parsed.sections, 'Getting Started') && !findSection(parsed.sections, 'Quick Start')) {
    warnings.push('Missing "Getting Started" section');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Main Validator ───────────────────────────────────────────────

export function validateTechnicalWriterOutput(text: string): ValidationResult {
  const parsed = parseMarkdownOutput(text);
  const docType = detectDocType(text);

  switch (docType) {
    case 'api-doc': return validateAPIDoc(text, parsed);
    case 'migration-guide': return validateMigrationGuide(text, parsed);
    case 'changelog': return validateChangelog(text, parsed);
    case 'readme': return validateREADME(text, parsed);
    case 'doc-inventory': return validateDocInventory(text, parsed);
    case 'user-guide': return validateUserGuide(text, parsed);
    default:
      return {
        valid: true,
        errors: [],
        warnings: ['Could not detect documentation type — unable to validate structure'],
      };
  }
}

export { detectDocType, parseMarkdownOutput };

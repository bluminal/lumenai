/**
 * Schema validator for UX Researcher output.
 *
 * Validates output against the research artifact structures
 * defined in plugins/autonomous-org/agents/ux-researcher.md.
 *
 * The UX Researcher produces various artifact types:
 * 1. Opportunity Solution Trees (OSTs)
 * 2. Persona Documents
 * 3. Journey Maps
 * 4. Research Plans
 * 5. Heuristic Evaluations
 *
 * This validator handles all five types.
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

// ── Artifact Type Detection ──────────────────────────────────────

type ArtifactType = 'ost' | 'persona' | 'journey-map' | 'research-plan' | 'heuristic-evaluation' | 'unknown';

function detectArtifactType(text: string): ArtifactType {
  if (text.match(/opportunity solution tree|target outcome/i)) return 'ost';
  if (text.match(/^##\s+Persona:/m)) return 'persona';
  if (text.match(/^##\s+User Journey:/m) || text.match(/journey map/i)) return 'journey-map';
  if (text.match(/^##\s+Research Plan:/m) || text.match(/research plan/i)) return 'research-plan';
  if (text.match(/heuristic evaluation|nielsen.*heuristic/i)) return 'heuristic-evaluation';
  return 'unknown';
}

// ── Validators by Artifact Type ──────────────────────────────────

function validateOST(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have Target Outcome
  if (!findSection(parsed.sections, 'Target Outcome')) {
    errors.push('Missing required section: Target Outcome');
  }

  // Must have Opportunities
  if (!findSection(parsed.sections, 'Opportunities') && !findSection(parsed.sections, 'Opportunity')) {
    errors.push('Missing required section: Opportunities');
  }

  // Must have Assumptions to Test
  if (!findSection(parsed.sections, 'Assumptions')) {
    warnings.push('Missing "Assumptions to Test" section');
  }

  // Target Outcome should include measurable metric
  const outcomeSection = findSection(parsed.sections, 'Target Outcome');
  if (outcomeSection) {
    const hasMetric = outcomeSection.content.match(/metric|measure|kpi/i) ||
      text.match(/\*\*Metric:\*\*/);
    if (!hasMetric) {
      warnings.push('Target Outcome should include a measurable metric');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validatePersona(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required sections
  const requiredSections = ['Goals', 'Pain Points', 'Evidence Basis'];
  for (const section of requiredSections) {
    if (!findSection(parsed.sections, section)) {
      errors.push(`Missing required Persona section: ${section}`);
    }
  }

  // Confidence level
  if (!text.match(/confidence level/i)) {
    warnings.push('Missing Confidence Level indicator (HIGH/MEDIUM/LOW)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateJourneyMap(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Should have a journey table
  const hasJourneyTable = parsed.tables.some(t =>
    t.headers.some(h => h.toLowerCase().includes('stage') || h.toLowerCase().includes('actions'))
  );
  if (!hasJourneyTable) {
    warnings.push('Journey Map should include a stage-by-stage table');
  }

  // Should have Key Moments
  if (!findSection(parsed.sections, 'Key Moments')) {
    warnings.push('Missing "Key Moments" section');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateResearchPlan(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredSections = ['Objective', 'Method', 'Participants', 'Deliverables'];
  for (const section of requiredSections) {
    if (!findSection(parsed.sections, section)) {
      errors.push(`Missing required Research Plan section: ${section}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateHeuristicEvaluation(text: string, parsed: ParsedOutput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Should have evaluation table
  const hasEvalTable = parsed.tables.some(t =>
    t.headers.some(h => h.toLowerCase().includes('heuristic') || h.toLowerCase().includes('rating'))
  );
  if (!hasEvalTable) {
    warnings.push('Heuristic Evaluation should include a scoring table');
  }

  // Should have overall score
  if (!text.match(/overall score/i)) {
    warnings.push('Missing Overall Score');
  }

  // Should reference Nielsen's heuristics
  if (!text.match(/nielsen/i)) {
    warnings.push('Should reference Nielsen\'s 10 Usability Heuristics');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Main Validator ───────────────────────────────────────────────

export function validateUXResearcherOutput(text: string): ValidationResult {
  const parsed = parseMarkdownOutput(text);
  const artifactType = detectArtifactType(text);

  switch (artifactType) {
    case 'ost': return validateOST(text, parsed);
    case 'persona': return validatePersona(text, parsed);
    case 'journey-map': return validateJourneyMap(text, parsed);
    case 'research-plan': return validateResearchPlan(text, parsed);
    case 'heuristic-evaluation': return validateHeuristicEvaluation(text, parsed);
    default:
      return {
        valid: true,
        errors: [],
        warnings: ['Could not detect UX research artifact type — unable to validate structure'],
      };
  }
}

export { detectArtifactType, parseMarkdownOutput };

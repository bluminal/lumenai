/**
 * Schema validator for Product Manager agent definition.
 *
 * Unlike other validators that check agent *output*, this validator checks
 * the agent *definition* (markdown) for required instructions. The PM agent
 * must instruct the model to use `AskUserQuestion` for user-facing questions,
 * since text output from sub-agents goes to the parent agent, not the user.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────

const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');
const COMMANDS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'commands');

// ── Validation Results ────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Section Extraction ────────────────────────────────────────────

/**
 * Extract content under a markdown heading (## level).
 * Returns the text between the heading and the next ## heading (or EOF).
 * Uses a prefix match so "## Requirements Gathering (Interactive Q&A)"
 * is found when searching for "Requirements Gathering".
 */
function extractSection(markdown: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Split on ## headings, find the one that starts with our heading
  const sections = markdown.split(/^## /m);
  for (const section of sections) {
    if (section.startsWith(escaped) || section.match(new RegExp(`^${escaped}\\b`))) {
      // Remove the heading line, return the body
      const lines = section.split('\n');
      return lines.slice(1).join('\n').trim();
    }
  }
  return null;
}

// ── Validators ────────────────────────────────────────────────────

/**
 * Validate the product-manager agent definition contains required
 * AskUserQuestion instructions.
 */
export function validateAgentDefinition(agentMarkdown: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Must mention AskUserQuestion at all
  const askUserCount = (agentMarkdown.match(/AskUserQuestion/g) || []).length;
  if (askUserCount === 0) {
    errors.push(
      'Agent definition does not mention AskUserQuestion. ' +
      'The PM must use this tool to surface questions to the human user when running as a sub-agent.'
    );
  }

  // 2. Requirements Gathering section must reference AskUserQuestion
  const reqGathering = extractSection(agentMarkdown, 'Requirements Gathering');
  if (!reqGathering) {
    errors.push('Missing "Requirements Gathering" section');
  } else if (!reqGathering.includes('AskUserQuestion')) {
    errors.push(
      'Requirements Gathering section does not mention AskUserQuestion. ' +
      'This is the primary section that instructs the PM on how to ask questions.'
    );
  }

  // 3. Critical Rules section must reference AskUserQuestion
  const criticalRules = extractSection(agentMarkdown, 'Critical Rules');
  if (!criticalRules) {
    errors.push('Missing "Critical Rules" section');
  } else if (!criticalRules.includes('AskUserQuestion')) {
    errors.push(
      'Critical Rules section does not mention AskUserQuestion. ' +
      'This section must reinforce the AskUserQuestion requirement.'
    );
  }

  // 4. Behavioral Rules section must reference AskUserQuestion
  const behavioralRules = extractSection(agentMarkdown, 'Behavioral Rules');
  if (!behavioralRules) {
    errors.push('Missing "Behavioral Rules" section');
  } else if (!behavioralRules.includes('AskUserQuestion')) {
    errors.push(
      'Behavioral Rules section does not mention AskUserQuestion. ' +
      'This section must include guidance on using AskUserQuestion.'
    );
  }

  // 5. Must warn against plain text output for questions
  const warnsAboutTextOutput =
    agentMarkdown.includes('text output') ||
    agentMarkdown.includes('plain text');
  if (!warnsAboutTextOutput) {
    warnings.push(
      'Agent definition does not explicitly warn against using plain text output for questions. ' +
      'Consider adding guidance that text output goes to the parent agent, not the user.'
    );
  }

  // 6. Must mention sub-agent context
  const mentionsSubAgent =
    agentMarkdown.includes('sub-agent') ||
    agentMarkdown.includes('subagent');
  if (!mentionsSubAgent) {
    warnings.push(
      'Agent definition does not mention sub-agent context. ' +
      'Consider explaining why AskUserQuestion is needed (text output goes to parent agent).'
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate the write-implementation-plan command references AskUserQuestion
 * in the User Interview step.
 */
export function validateWriteImplPlanCommand(commandMarkdown: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // The command must mention AskUserQuestion in the User Interview step
  if (!commandMarkdown.includes('AskUserQuestion')) {
    errors.push(
      'write-implementation-plan command does not mention AskUserQuestion. ' +
      'Step 4 (User Interview) must instruct the PM to use AskUserQuestion.'
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── File Loaders ──────────────────────────────────────────────────

export function loadAgentDefinition(): string {
  return readFileSync(join(AGENTS_DIR, 'product-manager.md'), 'utf-8');
}

export function loadWriteImplPlanCommand(): string {
  return readFileSync(join(COMMANDS_DIR, 'write-implementation-plan.md'), 'utf-8');
}

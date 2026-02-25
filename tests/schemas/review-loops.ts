/**
 * Schema validator for the review loop mechanism across commands and config.
 *
 * Validates that:
 * 1. defaults.yaml has a global review_loops section with correct structure
 * 2. All commands with review loops reference the correct config keys
 * 3. All commands specify fresh-agent-per-cycle context management
 * 4. No stale config references (max_review_cycles, root-level min_severity_to_address) remain
 * 5. Per-command review_loops overrides are structured correctly
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────

const PLUGIN_DIR = join(__dirname, '..', '..', 'plugins', 'synthex');
const COMMANDS_DIR = join(PLUGIN_DIR, 'commands');
const CONFIG_DIR = join(PLUGIN_DIR, 'config');

// ── Types ─────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Commands that have review loops and their loop step names
export const COMMANDS_WITH_REVIEW_LOOPS = [
  { file: 'write-implementation-plan.md', loopName: 'Peer Review Loop' },
  { file: 'write-rfc.md', loopName: 'RFC Review Loop' },
  { file: 'review-code.md', loopName: 'Review Loop' },
  { file: 'reliability-review.md', loopName: 'Remediation Loop' },
  { file: 'design-system-audit.md', loopName: 'Compliance Loop' },
  { file: 'performance-audit.md', loopName: 'Optimization Loop' },
] as const;

// ── File Loaders ──────────────────────────────────────────────────

export function loadDefaultsYaml(): string {
  return readFileSync(join(CONFIG_DIR, 'defaults.yaml'), 'utf-8');
}

export function loadCommand(filename: string): string {
  return readFileSync(join(COMMANDS_DIR, filename), 'utf-8');
}

// ── YAML Section Extraction ───────────────────────────────────────

/**
 * Extract a top-level YAML section by key name.
 * Returns everything from `key:` to the next top-level key (a line starting
 * with a non-space, non-comment character followed by a colon).
 */
export function extractYamlSection(yaml: string, key: string): string | null {
  const lines = yaml.split('\n');
  let capturing = false;
  let sectionLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(`${key}:`)) {
      capturing = true;
      sectionLines = [line];
      continue;
    }
    if (capturing) {
      // Next top-level key: starts with a letter/underscore, not a space or comment
      if (/^[a-z_].*:/i.test(line) && !line.startsWith('#')) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return capturing ? sectionLines.join('\n') : null;
}

// ── Config Validators ─────────────────────────────────────────────

/**
 * Validate that defaults.yaml has the correct global review_loops structure.
 */
export function validateGlobalConfig(yaml: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have a top-level review_loops section (not nested under another key)
  if (!/^review_loops:\s*$/m.test(yaml)) {
    errors.push('defaults.yaml missing top-level "review_loops:" section');
  }

  // Must define max_cycles under review_loops
  const reviewLoopsSection = extractYamlSection(yaml, 'review_loops');
  if (!reviewLoopsSection) {
    errors.push('defaults.yaml missing review_loops section');
  } else {
    if (!/max_cycles:\s*\d+/.test(reviewLoopsSection)) {
      errors.push('defaults.yaml missing review_loops.max_cycles');
    }
    if (!/min_severity_to_address:\s*\w+/.test(reviewLoopsSection)) {
      errors.push('defaults.yaml missing review_loops.min_severity_to_address');
    }
  }

  // implementation_plan must have a review_loops override (it differs from global)
  const implSection = extractYamlSection(yaml, 'implementation_plan');
  if (implSection) {
    if (!/review_loops:\s*\n\s+max_cycles:\s*3/.test(implSection)) {
      errors.push(
        'implementation_plan section should override review_loops.max_cycles to 3'
      );
    }
  } else {
    errors.push('defaults.yaml missing implementation_plan section');
  }

  // Must NOT have stale root-level max_review_cycles or min_severity_to_address
  // under implementation_plan (outside of review_loops nesting)
  if (implSection) {
    const lines = implSection.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('max_review_cycles:')) {
        errors.push(
          'Stale implementation_plan.max_review_cycles found. ' +
          'Should be implementation_plan.review_loops.max_cycles'
        );
      }
      // min_severity_to_address at implementation_plan root level (not nested under review_loops)
      if (
        trimmed.startsWith('min_severity_to_address:') &&
        !trimmed.startsWith('#')
      ) {
        // Check if it's directly under implementation_plan (2-space indent) vs under review_loops (4-space)
        const indent = line.length - line.trimStart().length;
        if (indent <= 2) {
          errors.push(
            'Stale implementation_plan.min_severity_to_address found at root level. ' +
            'Should be nested under review_loops or inherited from global'
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate that a command markdown references review loop config correctly
 * and includes fresh-agent-per-cycle context management instructions.
 */
export function validateCommandReviewLoop(
  commandMarkdown: string,
  commandInfo: (typeof COMMANDS_WITH_REVIEW_LOOPS)[number]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Must reference review_loops.max_cycles (not max_review_cycles)
  if (!commandMarkdown.includes('review_loops.max_cycles')) {
    errors.push(
      `${commandInfo.file} does not reference review_loops.max_cycles`
    );
  }

  // 2. Must NOT reference the stale max_review_cycles key
  if (commandMarkdown.includes('max_review_cycles')) {
    errors.push(
      `${commandInfo.file} still references stale "max_review_cycles". ` +
      'Use review_loops.max_cycles instead'
    );
  }

  // 3. Must contain a review loop step with the expected name
  if (!commandMarkdown.includes(commandInfo.loopName)) {
    errors.push(
      `${commandInfo.file} missing "${commandInfo.loopName}" section`
    );
  }

  // 4. Must specify fresh sub-agent instances (context management)
  const hasFreshAgentInstruction =
    commandMarkdown.includes('fresh') &&
    (commandMarkdown.includes('never resume') ||
      commandMarkdown.includes('never resumed') ||
      commandMarkdown.includes('new Task call') ||
      commandMarkdown.includes('new sub-agent'));
  if (!hasFreshAgentInstruction) {
    errors.push(
      `${commandInfo.file} missing fresh-agent-per-cycle instructions. ` +
      'Must specify spawning new sub-agent instances (not resumed) to prevent context exhaustion'
    );
  }

  // 5. Must mention compact carry-forward (summary, not full output)
  const hasCompactCarryForward =
    commandMarkdown.includes('compact') &&
    (commandMarkdown.includes('summary') ||
      commandMarkdown.includes('carry forward') ||
      commandMarkdown.includes('carry-forward'));
  if (!hasCompactCarryForward) {
    errors.push(
      `${commandInfo.file} missing compact carry-forward instructions. ` +
      'Must specify carrying forward only a compact findings summary between cycles'
    );
  }

  // 6. Must include config resolution order note
  if (commandMarkdown.includes('resolution order') || commandMarkdown.includes('Resolution order')) {
    // Good — has resolution order documentation
  } else {
    warnings.push(
      `${commandInfo.file} does not document config resolution order ` +
      '(per-command > global > hardcoded default)'
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check for stale config references across all command files.
 * Returns files that still use the old max_review_cycles or
 * root-level min_severity_to_address under implementation_plan.
 */
export function checkStaleConfigReferences(
  commandFiles: { file: string; content: string }[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { file, content } of commandFiles) {
    // Stale max_review_cycles (not inside a code block showing old config)
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines inside YAML code blocks (they might show old config for comparison)
      if (line.includes('max_review_cycles') && !line.trim().startsWith('#')) {
        errors.push(
          `${file}:${i + 1} contains stale "max_review_cycles" reference`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

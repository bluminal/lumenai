/**
 * Schema validator for the init command definition.
 *
 * Validates that:
 * 1. The init command includes a "Configure Concurrent Tasks" step
 * 2. It uses AskUserQuestion to prompt the user (not plain text)
 * 3. CPU detection commands are specified for macOS, Linux, and Windows
 * 4. Three preset options (Yolo, Aggressive, Default) are defined
 * 5. Integer validation with re-ask loop is specified
 * 6. Both concurrent_tasks config keys are updated
 * 7. defaults.yaml has both concurrent_tasks entries
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

// ── CPU Detection Platforms ───────────────────────────────────────

export const REQUIRED_CPU_COMMANDS = [
  { platform: 'macOS', command: 'sysctl -n hw.ncpu' },
  { platform: 'Linux', command: 'nproc' },
] as const;

export const OPTIONAL_CPU_COMMANDS = [
  { platform: 'Windows', pattern: /NUMBER_OF_PROCESSORS/i },
] as const;

// ── Preset Options ────────────────────────────────────────────────

export const REQUIRED_PRESETS = ['Yolo', 'Aggressive', 'Default'] as const;

// ── File Loaders ──────────────────────────────────────────────────

export function loadInitCommand(): string {
  return readFileSync(join(COMMANDS_DIR, 'init.md'), 'utf-8');
}

export function loadDefaultsYaml(): string {
  return readFileSync(join(CONFIG_DIR, 'defaults.yaml'), 'utf-8');
}

// ── Section Extraction ────────────────────────────────────────────

/**
 * Extract a workflow step section by step number and title prefix.
 * Returns the content between the heading and the next ### heading (or EOF).
 */
export function extractWorkflowStep(
  markdown: string,
  stepNumber: number,
  titlePrefix: string
): string | null {
  // Use \n### to anchor headings at line start — prevents matching #### sub-steps
  const pattern = new RegExp(
    `### ${stepNumber}\\.\\s+${titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n### \\d|\\n## [A-Z]|$)`
  );
  const match = markdown.match(pattern);
  return match ? match[0] : null;
}

/**
 * Extract a sub-step section (e.g., "#### 3a. Detect CPU Count").
 */
export function extractSubStep(
  markdown: string,
  subStep: string
): string | null {
  const escaped = subStep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use \n#### and \n### to anchor headings at line start
  const pattern = new RegExp(
    `#### ${escaped}[\\s\\S]*?(?=\\n#### |\\n### \\d|\\n## [A-Z]|$)`
  );
  const match = markdown.match(pattern);
  return match ? match[0] : null;
}

// ── Command Definition Validators ─────────────────────────────────

/**
 * Validate the init command has a properly structured concurrent tasks step.
 */
export function validateInitCommand(commandMarkdown: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Must have the "Configure Concurrent Tasks" step
  const concurrentTasksStep = extractWorkflowStep(commandMarkdown, 3, 'Configure Concurrent Tasks');
  if (!concurrentTasksStep) {
    errors.push(
      'Init command missing "### 3. Configure Concurrent Tasks" workflow step'
    );
    // Can't validate sub-steps without the parent section
    return { valid: false, errors, warnings };
  }

  // 2. Must mention AskUserQuestion (not plain text prompting)
  const askUserCount = (concurrentTasksStep.match(/AskUserQuestion/g) || []).length;
  if (askUserCount === 0) {
    errors.push(
      'Configure Concurrent Tasks step does not mention AskUserQuestion. ' +
      'Must use AskUserQuestion tool to prompt the user.'
    );
  } else if (askUserCount < 2) {
    warnings.push(
      'AskUserQuestion appears only once. Expected at least twice: ' +
      'once for the initial prompt (3c) and once for the re-ask on invalid input (3d).'
    );
  }

  // 3. Must have CPU detection sub-step with platform commands
  const detectStep = extractSubStep(commandMarkdown, '3a. Detect CPU Count');
  if (!detectStep) {
    errors.push('Missing sub-step "3a. Detect CPU Count"');
  } else {
    for (const { platform, command } of REQUIRED_CPU_COMMANDS) {
      if (!detectStep.includes(command)) {
        errors.push(
          `CPU detection step missing "${command}" for ${platform}`
        );
      }
    }
    for (const { platform, pattern } of OPTIONAL_CPU_COMMANDS) {
      if (!pattern.test(detectStep)) {
        warnings.push(
          `CPU detection step does not mention ${platform} detection`
        );
      }
    }
    // Must specify a fallback
    if (!detectStep.includes('12') || !detectStep.toLowerCase().includes('fallback')) {
      errors.push(
        'CPU detection step must specify fallback default of 12 when detection fails'
      );
    }
  }

  // 4. Must have preset calculation sub-step
  const calculateStep = extractSubStep(commandMarkdown, '3b. Calculate Options');
  if (!calculateStep) {
    errors.push('Missing sub-step "3b. Calculate Options"');
  } else {
    for (const preset of REQUIRED_PRESETS) {
      if (!calculateStep.includes(preset)) {
        errors.push(`Calculate Options step missing "${preset}" preset`);
      }
    }
    // Aggressive formula must reference 0.75 and 8
    if (!calculateStep.includes('0.75')) {
      errors.push('Aggressive preset must use 75% of CPUs (0.75 factor)');
    }
    if (!/max.*floor.*0\.75.*8|max.*8.*floor.*0\.75/i.test(calculateStep) &&
        !/floor.*cpus.*0\.75.*8/i.test(calculateStep)) {
      warnings.push(
        'Aggressive formula should use max(floor(cpus * 0.75), 8) pattern'
      );
    }
  }

  // 5. Must have user prompt sub-step
  const askStep = extractSubStep(commandMarkdown, '3c. Ask the User');
  if (!askStep) {
    errors.push('Missing sub-step "3c. Ask the User"');
  } else if (!askStep.includes('AskUserQuestion')) {
    errors.push(
      'Ask the User step must reference AskUserQuestion tool'
    );
  }

  // 6. Must have validation sub-step with re-ask loop
  const validateStep = extractSubStep(commandMarkdown, '3d. Validate the Response');
  if (!validateStep) {
    errors.push('Missing sub-step "3d. Validate the Response"');
  } else {
    if (!validateStep.toLowerCase().includes('integer')) {
      errors.push(
        'Validation step must specify that the response must be an integer'
      );
    }
    if (!validateStep.includes('AskUserQuestion')) {
      errors.push(
        'Validation step must re-ask using AskUserQuestion on invalid input'
      );
    }
    if (
      !validateStep.toLowerCase().includes('repeat') &&
      !validateStep.toLowerCase().includes('loop')
    ) {
      errors.push(
        'Validation step must specify repeating until a valid integer is obtained'
      );
    }
  }

  // 7. Must have config update sub-step targeting both keys
  const updateStep = extractSubStep(commandMarkdown, '3e. Update the Config File');
  if (!updateStep) {
    errors.push('Missing sub-step "3e. Update the Config File"');
  } else {
    if (!updateStep.includes('implementation_plan.concurrent_tasks')) {
      errors.push(
        'Config update step must reference implementation_plan.concurrent_tasks'
      );
    }
    if (!updateStep.includes('next_priority.concurrent_tasks')) {
      errors.push(
        'Config update step must reference next_priority.concurrent_tasks'
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate that defaults.yaml has concurrent_tasks in both required sections.
 */
export function validateDefaultsConcurrentTasks(yaml: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract sections
  const implSection = extractYamlTopLevelSection(yaml, 'implementation_plan');
  const nextPrioritySection = extractYamlTopLevelSection(yaml, 'next_priority');

  if (!implSection) {
    errors.push('defaults.yaml missing implementation_plan section');
  } else if (!/concurrent_tasks:\s*\d+/.test(implSection)) {
    errors.push('defaults.yaml missing implementation_plan.concurrent_tasks');
  }

  if (!nextPrioritySection) {
    errors.push('defaults.yaml missing next_priority section');
  } else if (!/concurrent_tasks:\s*\d+/.test(nextPrioritySection)) {
    errors.push('defaults.yaml missing next_priority.concurrent_tasks');
  }

  // Both should have the same default value
  if (implSection && nextPrioritySection) {
    const implMatch = implSection.match(/concurrent_tasks:\s*(\d+)/);
    const nextMatch = nextPrioritySection.match(/concurrent_tasks:\s*(\d+)/);
    if (implMatch && nextMatch && implMatch[1] !== nextMatch[1]) {
      warnings.push(
        `Default concurrent_tasks differs between implementation_plan (${implMatch[1]}) ` +
        `and next_priority (${nextMatch[1]}). Consider whether this is intentional.`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate that the init command's "What This Command Does" summary
 * includes the concurrent tasks prompt step.
 */
export function validateCommandSummary(commandMarkdown: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract the summary section (between "## What This Command Does" and "## Workflow")
  const summaryMatch = commandMarkdown.match(
    /## What This Command Does\s*\n([\s\S]*?)(?=## Workflow)/
  );

  if (!summaryMatch) {
    errors.push('Missing "What This Command Does" section');
    return { valid: false, errors, warnings };
  }

  const summary = summaryMatch[1];

  if (!summary.toLowerCase().includes('concurrent') && !summary.toLowerCase().includes('parallelism')) {
    errors.push(
      '"What This Command Does" summary must mention concurrent task configuration'
    );
  }

  // Check step ordering — concurrent tasks should come after config creation and before .gitignore
  const lines = summary.split('\n').filter((l) => /^\d+\./.test(l.trim()));
  const configStep = lines.findIndex((l) => l.toLowerCase().includes('configuration file'));
  const concurrentStep = lines.findIndex(
    (l) => l.toLowerCase().includes('concurrent') || l.toLowerCase().includes('parallelism')
  );
  const gitignoreStep = lines.findIndex((l) => l.toLowerCase().includes('gitignore'));

  if (concurrentStep === -1) {
    // Already caught above
  } else {
    if (configStep !== -1 && concurrentStep < configStep) {
      errors.push(
        'Concurrent tasks step should come after config file creation in the summary'
      );
    }
    if (gitignoreStep !== -1 && concurrentStep > gitignoreStep) {
      errors.push(
        'Concurrent tasks step should come before .gitignore update in the summary'
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── YAML Helpers ──────────────────────────────────────────────────

/**
 * Extract a top-level YAML section.
 */
function extractYamlTopLevelSection(yaml: string, key: string): string | null {
  const lines = yaml.split('\n');
  let capturing = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(`${key}:`)) {
      capturing = true;
      sectionLines.push(line);
      continue;
    }
    if (capturing) {
      if (/^[a-z_].*:/i.test(line) && !line.startsWith('#')) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return capturing ? sectionLines.join('\n') : null;
}

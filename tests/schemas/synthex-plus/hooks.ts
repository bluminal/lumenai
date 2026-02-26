/**
 * Schema validator for Synthex+ hooks infrastructure.
 *
 * Validates:
 * - hooks.json structure (event names, command paths, descriptions)
 * - Script file existence, permissions, and size constraints
 * - Companion markdown documentation existence
 *
 * Follows the validator pattern established in schemas/code-reviewer.ts.
 */

import { existsSync, statSync, readFileSync } from 'fs';
import { join, basename, extname } from 'path';

// ── Types ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface HookEntry {
  event: string;
  command: string;
  description: string;
}

export interface ParsedHooksJson {
  hooks: HookEntry[];
}

// ── Constants ────────────────────────────────────────────────────

const VALID_EVENTS = ['TaskCompleted', 'TeammateIdle'] as const;

/** Maximum line count for hook scripts (D5: thin shims, <20 lines). */
const MAX_SCRIPT_LINES = 20;

// ── hooks.json Validator ─────────────────────────────────────────

/**
 * Validate the hooks.json structure and verify that referenced
 * script files and companion markdown docs exist on disk.
 *
 * @param hooksJsonText  Raw JSON text of hooks.json
 * @param basePath       Directory where hooks.json lives (for resolving relative paths)
 */
export function validateHooks(hooksJsonText: string, basePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(hooksJsonText);
  } catch (e) {
    errors.push(`Invalid JSON: ${(e as Error).message}`);
    return { valid: false, errors, warnings };
  }

  // 2. Top-level structure: must be an object with a "hooks" array
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('Root must be a JSON object');
    return { valid: false, errors, warnings };
  }

  const root = parsed as Record<string, unknown>;

  if (!('hooks' in root)) {
    errors.push('Missing required "hooks" array');
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(root.hooks)) {
    errors.push('"hooks" must be an array');
    return { valid: false, errors, warnings };
  }

  const hooks = root.hooks as unknown[];

  if (hooks.length === 0) {
    warnings.push('"hooks" array is empty');
  }

  // 3. Validate each hook entry
  for (let i = 0; i < hooks.length; i++) {
    const entry = hooks[i];
    const prefix = `hooks[${i}]`;

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    const hook = entry as Record<string, unknown>;

    // Required fields
    for (const field of ['event', 'command', 'description']) {
      if (!(field in hook)) {
        errors.push(`${prefix}: missing required field "${field}"`);
      } else if (typeof hook[field] !== 'string') {
        errors.push(`${prefix}.${field}: must be a string`);
      } else if ((hook[field] as string).trim() === '') {
        errors.push(`${prefix}.${field}: must not be empty`);
      }
    }

    // Event name validation
    if (typeof hook.event === 'string' && hook.event.trim() !== '') {
      if (!(VALID_EVENTS as readonly string[]).includes(hook.event)) {
        errors.push(
          `${prefix}.event: "${hook.event}" is not a valid event. ` +
          `Must be one of: ${VALID_EVENTS.join(', ')}`
        );
      }
    }

    // Command path validation: must be relative (start with ./)
    if (typeof hook.command === 'string' && hook.command.trim() !== '') {
      if (!hook.command.startsWith('./')) {
        errors.push(`${prefix}.command: "${hook.command}" must be a relative path starting with "./"`);
      }

      // Verify script file exists
      const scriptPath = join(basePath, hook.command);
      if (!existsSync(scriptPath)) {
        errors.push(`${prefix}.command: script file not found at "${scriptPath}"`);
      } else {
        // Validate the script itself
        const scriptResult = validateHookScript(scriptPath);
        errors.push(...scriptResult.errors.map(e => `${prefix}.command (${hook.command}): ${e}`));
        warnings.push(...scriptResult.warnings.map(w => `${prefix}.command (${hook.command}): ${w}`));
      }

      // Verify companion markdown doc exists
      const scriptBasename = basename(hook.command, extname(hook.command));
      const companionPath = join(basePath, 'hooks', `${scriptBasename}.md`);

      // If basePath already includes hooks/, try resolving relative to parent
      const altCompanionPath = join(basePath, '..', 'hooks', `${scriptBasename}.md`);

      if (!existsSync(companionPath) && !existsSync(altCompanionPath)) {
        warnings.push(
          `${prefix}: companion markdown doc not found. ` +
          `Expected "${scriptBasename}.md" in hooks/ directory`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Script File Validator ────────────────────────────────────────

/**
 * Validate an individual hook script file.
 *
 * Checks:
 * - File exists
 * - File is executable (mode includes 0o111)
 * - File is a shell script (starts with shebang)
 * - File is within the size constraint (<20 lines per D5)
 *
 * @param scriptPath  Absolute or resolved path to the script file
 */
export function validateHookScript(scriptPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Existence
  if (!existsSync(scriptPath)) {
    errors.push(`Script file not found: "${scriptPath}"`);
    return { valid: false, errors, warnings };
  }

  // 2. Permissions: check executable bit
  const stat = statSync(scriptPath);
  const mode = stat.mode;
  const isExecutable = (mode & 0o111) !== 0;

  if (!isExecutable) {
    errors.push(
      `Script is not executable. ` +
      `Expected mode 100755, got ${modeToOctal(mode)}`
    );
  }

  // 3. Content checks
  const content = readFileSync(scriptPath, 'utf-8');
  const lines = content.split('\n');

  // Filter out trailing empty line (common in files)
  const significantLines = lines.length > 0 && lines[lines.length - 1] === ''
    ? lines.slice(0, -1)
    : lines;

  // Shebang check
  if (significantLines.length === 0) {
    errors.push('Script file is empty');
    return { valid: false, errors, warnings };
  }

  if (!significantLines[0].startsWith('#!')) {
    errors.push(
      `Script missing shebang line. ` +
      `Expected first line to start with "#!" (e.g., "#!/usr/bin/env bash")`
    );
  }

  // Size constraint: D5 says <20 lines for thin shims
  if (significantLines.length > MAX_SCRIPT_LINES) {
    warnings.push(
      `Script has ${significantLines.length} lines, exceeding the ${MAX_SCRIPT_LINES}-line ` +
      `guideline for thin shims (D5). Consider moving logic to a companion markdown file.`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Utility Functions ────────────────────────────────────────────

/**
 * Convert a file mode to a human-readable octal string (e.g., "100755").
 */
function modeToOctal(mode: number): string {
  return mode.toString(8);
}

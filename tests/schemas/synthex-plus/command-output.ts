/**
 * Schema validator for Synthex+ command outputs.
 *
 * Validates cost estimate displays, progress reports, and completion reports
 * against the canonical formats defined in:
 *   plugins/synthex-plus/docs/output-formats.md
 *
 * Each validator returns { valid, errors, warnings } following the same
 * pattern used by all other Synthex schema validators.
 */

// ── Types ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Cost Estimate Validator ──────────────────────────────────────

/**
 * Validates a cost estimate display block.
 *
 * Required elements (from output-formats.md):
 *   - "Team cost estimate" header line with "(approximate)" label
 *   - Subagent approach line with token estimate (~ prefix)
 *   - Team approach line with token estimate and multiplier (Nx)
 *   - Approximation note disclaimer
 *   - User confirmation prompt "[Y/n]"
 */
export function validateCostEstimate(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Header line with approximate labeling
  if (!/team cost estimate/i.test(text)) {
    errors.push('Missing "Team cost estimate" header line');
  }
  if (!/approximate/i.test(text)) {
    errors.push('Missing approximate labeling (cost estimates must be labeled as approximate)');
  }

  // 2. Subagent approach line with token estimate
  const subagentLine = text.match(/subagent approach[^:]*:\s*~?\s*[\d,]+\s*tokens/i);
  if (!subagentLine) {
    errors.push('Missing subagent approach line with token estimate (expected format: "Subagent approach ({command}): ~N tokens")');
  }

  // 3. Team approach line with token estimate and multiplier
  const teamLine = text.match(/team approach[^:]*:\s*~?\s*[\d,]+\s*tokens/i);
  if (!teamLine) {
    errors.push('Missing team approach line with token estimate (expected format: "Team approach ({command}): ~N tokens")');
  }

  // Multiplier on team line (e.g., "7.4x multiplier" or "(~7.4x)")
  const hasMultiplier = /\d+\.?\d*x/i.test(text);
  if (!hasMultiplier) {
    errors.push('Missing cost multiplier (expected format: "Nx" or "N.Nx multiplier")');
  }

  // 4. Approximation note / disclaimer
  const hasNote = /actual usage varies/i.test(text) || /approximation/i.test(text) || /note:/i.test(text);
  if (!hasNote) {
    warnings.push('Missing approximation disclaimer note (expected text explaining estimates are approximate)');
  }

  // 5. User confirmation prompt
  const hasPrompt = /\[Y\/n\]/i.test(text) || /proceed.*\?/i.test(text);
  if (!hasPrompt) {
    errors.push('Missing user confirmation prompt (expected "[Y/n]" or "Proceed...?")');
  }

  // 6. Formula components present (teammates, tasks references)
  const mentionsTokens = /tokens/i.test(text);
  if (!mentionsTokens) {
    errors.push('Cost estimate must reference token counts');
  }

  // 7. Both command names should be present (fallback and team)
  const hasFallbackCommand = /subagent approach\s*\([^)]+\)/i.test(text);
  const hasTeamCommand = /team approach\s*\([^)]+\)/i.test(text);
  if (!hasFallbackCommand) {
    warnings.push('Subagent approach line should include the fallback command name in parentheses');
  }
  if (!hasTeamCommand) {
    warnings.push('Team approach line should include the team command name in parentheses');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Progress Report Validator ────────────────────────────────────

/**
 * Validates a progress report display block.
 *
 * Required elements (from output-formats.md):
 *   - "Progress Report" header (--- delimited)
 *   - Team name and template name
 *   - Tasks summary line: completed/total completed
 *   - Active tasks section with assignee roles
 *   - Estimated remaining line
 *
 * Optional elements:
 *   - Blocked section (only if blocked tasks exist)
 */
export function validateProgressReport(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Progress Report header
  if (!/progress report/i.test(text)) {
    errors.push('Missing "Progress Report" header');
  }

  // 2. Team identification line (Team: name (template template))
  const teamLine = text.match(/team:\s*.+/i);
  if (!teamLine) {
    errors.push('Missing team identification line (expected "Team: {name} ({template} template)")');
  } else {
    if (!/template/i.test(teamLine[0])) {
      warnings.push('Team line should include the template name (e.g., "implementation template")');
    }
  }

  // 3. Tasks summary line (completed/total)
  const tasksSummary = text.match(/tasks:\s*(\d+)\s*\/\s*(\d+)/i);
  if (!tasksSummary) {
    errors.push('Missing tasks summary line (expected "Tasks: N/N completed")');
  } else {
    const completed = parseInt(tasksSummary[1], 10);
    const total = parseInt(tasksSummary[2], 10);
    if (completed > total) {
      errors.push(`Tasks summary invalid: completed (${completed}) exceeds total (${total})`);
    }
    if (!/completed/i.test(text.substring(text.indexOf(tasksSummary[0])))) {
      warnings.push('Tasks summary should include "completed" label');
    }
  }

  // 4. Active tasks section with role annotations
  const hasActiveSection = /active:/i.test(text);
  if (!hasActiveSection) {
    // Active section is not strictly required if all tasks are completed or blocked,
    // but it is the primary content of a progress report
    warnings.push('Missing "Active:" section (expected when tasks are in progress)');
  }

  // Check for role annotations in brackets [Role]
  const roleAnnotations = text.match(/\[([^\]]+)\]/g);
  if (!roleAnnotations || roleAnnotations.length === 0) {
    warnings.push('No role annotations found (expected [Role] for each active/blocked task)');
  }

  // 5. Blocked section validation (optional -- only warn if "blocked" keyword appears without section)
  const hasBlockedSection = /^blocked:/im.test(text);
  const mentionsBlocked = /blocked/i.test(text);
  // If text mentions "blocked" tasks but no Blocked section, that is acceptable per display rules
  // (omit if no blocked tasks). No warning needed.

  // 6. In-progress status markers
  const hasInProgress = /in progress/i.test(text) || /in-progress/i.test(text);
  if (hasActiveSection && !hasInProgress) {
    warnings.push('Active tasks should include "(in progress)" status marker');
  }

  // 7. Blocked tasks should have blocker reasons
  if (hasBlockedSection) {
    const blockedLines = text.split('\n').filter(l => /^\s*-\s+.+\[.+\].*:/.test(l));
    if (blockedLines.length === 0) {
      warnings.push('Blocked tasks should include blocker reasons (expected format: "- {task} [{role}]: {reason}")');
    }
  }

  // 8. Estimated remaining line
  const hasEstimate = /estimated remaining/i.test(text) || /remaining.*estimate/i.test(text);
  if (!hasEstimate) {
    warnings.push('Missing "Estimated remaining" line');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Completion Report Validator ──────────────────────────────────

/**
 * Validates a completion report display block.
 *
 * Required elements (from output-formats.md):
 *   - "Completion Report" header (--- delimited)
 *   - Team name and template name
 *   - Duration/timeline info
 *   - Tasks completed count (completed/total)
 *   - Summary by role section
 *   - Files modified section
 *
 * Optional elements:
 *   - Discovered work section (only if new work was found)
 *   - Quality gates section (only if gates were evaluated)
 */
export function validateCompletionReport(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Completion Report header
  if (!/completion report/i.test(text)) {
    errors.push('Missing "Completion Report" header');
  }

  // 2. Team identification line
  const teamLine = text.match(/team:\s*.+/i);
  if (!teamLine) {
    errors.push('Missing team identification line (expected "Team: {name} ({template} template)")');
  } else {
    if (!/template/i.test(teamLine[0])) {
      warnings.push('Team line should include the template name (e.g., "implementation template")');
    }
  }

  // 3. Duration/timeline info
  const hasDuration = /duration:\s*.+/i.test(text);
  if (!hasDuration) {
    errors.push('Missing duration line (expected "Duration: {time}")');
  }

  // 4. Tasks completed count
  const tasksSummary = text.match(/tasks:\s*(\d+)\s*\/\s*(\d+)/i);
  if (!tasksSummary) {
    errors.push('Missing tasks summary line (expected "Tasks: N/N completed")');
  } else {
    const completed = parseInt(tasksSummary[1], 10);
    const total = parseInt(tasksSummary[2], 10);
    if (completed > total) {
      errors.push(`Tasks summary invalid: completed (${completed}) exceeds total (${total})`);
    }
  }

  // 5. Summary by role section
  const hasRoleSummary = /summary by role/i.test(text);
  if (!hasRoleSummary) {
    errors.push('Missing "Summary by role" section');
  } else {
    // Each role should have a colon-separated work summary
    const roleSummarySection = extractSection(text, /summary by role/i);
    if (roleSummarySection !== null) {
      const roleLines = roleSummarySection
        .split('\n')
        .filter(l => /^\s+\S+.*:/.test(l) || /^\s*-\s+\S+.*:/.test(l));
      if (roleLines.length === 0) {
        warnings.push('Summary by role section should contain role entries (expected "{role}: {summary}")');
      }
    }
  }

  // 6. Files modified section
  const hasFilesModified = /files modified/i.test(text);
  if (!hasFilesModified) {
    warnings.push('Missing "Files modified" section');
  } else {
    const filesSection = extractSection(text, /files modified/i);
    if (filesSection !== null) {
      const fileLines = filesSection.split('\n').filter(l => /^\s*-\s+\S+/.test(l));
      if (fileLines.length === 0) {
        warnings.push('Files modified section should list at least one file path');
      }
    }
  }

  // 7. Discovered work section (optional per display rules)
  // We do not error if missing -- only validate structure if present
  const hasDiscoveredWork = /discovered work/i.test(text);
  if (hasDiscoveredWork) {
    const discoveredSection = extractSection(text, /discovered work/i);
    if (discoveredSection !== null) {
      const itemLines = discoveredSection.split('\n').filter(l => /^\s*-\s+\S+/.test(l));
      if (itemLines.length === 0) {
        warnings.push('Discovered work section is present but contains no items');
      }
    }
  }

  // 8. Quality gates section (optional per display rules)
  const hasQualityGates = /quality gates/i.test(text);
  if (hasQualityGates) {
    const gatesSection = extractSection(text, /quality gates/i);
    if (gatesSection !== null) {
      // Each gate should have a verdict (PASS, WARN, or FAIL)
      const gateLines = gatesSection.split('\n').filter(l => /^\s*-\s+\S+/.test(l));
      if (gateLines.length === 0) {
        warnings.push('Quality gates section is present but contains no gate entries');
      }

      // Validate verdict values
      for (const line of gateLines) {
        const hasVerdict = /\b(PASS|WARN|FAIL)\b/.test(line);
        if (!hasVerdict) {
          warnings.push(`Quality gate line missing verdict (PASS/WARN/FAIL): "${line.trim()}"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Internal Helpers ─────────────────────────────────────────────

/**
 * Extract the content of a "section" identified by a label pattern.
 * This is a lightweight alternative to the full markdown section parser
 * since Synthex+ output uses plain text with indented lines rather than
 * markdown headings for subsections.
 *
 * Returns all lines from the matching label until the next section-like
 * label (a line matching a known section header pattern) or end of text.
 */
function extractSection(text: string, labelPattern: RegExp): string | null {
  const lines = text.split('\n');
  let startIdx = -1;

  // Known section labels used in Synthex+ output formats
  const sectionLabels = [
    /^---/,
    /^team:/i,
    /^duration:/i,
    /^tasks:/i,
    /^active:/i,
    /^blocked:/i,
    /^estimated remaining/i,
    /^summary by role/i,
    /^discovered work/i,
    /^files modified/i,
    /^quality gates/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    if (labelPattern.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }

  if (startIdx === -1) return null;

  const contentLines: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Stop at the next section-level label (but not blank lines)
    if (trimmed !== '' && sectionLabels.some(p => p.test(trimmed)) && !labelPattern.test(trimmed)) {
      break;
    }
    contentLines.push(lines[i]);
  }

  return contentLines.join('\n').trim();
}

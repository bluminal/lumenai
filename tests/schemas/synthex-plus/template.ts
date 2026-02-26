/**
 * Schema validator for Synthex+ team template structure.
 *
 * Validates that a team template conforms to the canonical skeleton
 * defined in plugins/synthex-plus/templates/_skeleton.md.
 *
 * Checks:
 * - Required sections (Purpose, Agent References, Communication Patterns, etc.)
 * - Agent references table structure and content
 * - Agent file path format (must reference plugins/synthex/agents/*.md)
 * - Non-empty behavioral overlays for every role
 * - Optional but recommended Spawn Pattern section
 */

import {
  parseMarkdownOutput,
  findSection,
  type ParsedOutput,
  type Table,
} from '../helpers.js';

// ── Required Top-Level Sections ─────────────────────────────────
// Each entry is an array of acceptable title variants (case-insensitive substring match).

const REQUIRED_SECTIONS: string[][] = [
  ['Purpose'],
  ['Agent References'],
  ['Communication Patterns'],
  ['Task Decomposition Guidance', 'Task Decomposition'],
  ['Quality Gates'],
  ['When to Use', 'When NOT to Use'],
];

// ── Agent References Table Required Columns ─────────────────────

const AGENT_TABLE_REQUIRED_COLUMNS = [
  'Role',
  'Synthex Agent',
  'Required',
  'Team-Specific Behavioral Overlay',
];

// Column name variants the table might use (case-insensitive substring match).
const COLUMN_VARIANTS: Record<string, string[]> = {
  'Role': ['Role'],
  'Synthex Agent': ['Synthex Agent', 'Agent'],
  'Required': ['Required', 'Required/Optional'],
  'Team-Specific Behavioral Overlay': ['Behavioral Overlay', 'Overlay', 'Team-Specific'],
};

// ── Agent File Path Pattern ─────────────────────────────────────
// Must match: plugins/synthex/agents/<name>.md (with optional backtick wrapping)

const AGENT_PATH_PATTERN = /plugins\/synthex\/agents\/[\w-]+\.md/;

// ── Known Agent Files ───────────────────────────────────────────
// Valid agent filenames within plugins/synthex/agents/

const KNOWN_AGENTS = [
  'architect',
  'code-reviewer',
  'design-system-agent',
  'lead-frontend-engineer',
  'metrics-analyst',
  'performance-engineer',
  'product-manager',
  'quality-engineer',
  'retrospective-facilitator',
  'security-reviewer',
  'sre-agent',
  'tech-lead',
  'technical-writer',
  'terraform-plan-reviewer',
  'ux-researcher',
];

// ── Validation Result ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Validator ───────────────────────────────────────────────────

export function validateTemplate(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseMarkdownOutput(text);

  // 1. Required sections
  for (const group of REQUIRED_SECTIONS) {
    const found = group.some(name => findSection(parsed.sections, name));
    if (!found) {
      errors.push(`Missing required section: one of [${group.join(', ')}]`);
    }
  }

  // 2. Agent References table existence and structure
  const agentRefSection = findSection(parsed.sections, 'Agent References');
  const agentTable = findAgentTable(parsed.tables);

  if (!agentTable) {
    errors.push('Missing agent references table in "Agent References" section');
  } else {
    // 2a. Check required columns
    for (const [columnKey, variants] of Object.entries(COLUMN_VARIANTS)) {
      const hasColumn = variants.some(variant =>
        agentTable.headers.some(h =>
          h.toLowerCase().includes(variant.toLowerCase())
        )
      );
      if (!hasColumn) {
        errors.push(`Agent references table missing column: "${columnKey}"`);
      }
    }

    // 2b. Must have at least one row
    if (agentTable.rows.length === 0) {
      errors.push('Agent references table has no rows (at least one role is required)');
    }

    // 2c. Validate each row
    const agentColIdx = findColumnIndex(agentTable.headers, COLUMN_VARIANTS['Synthex Agent']);
    const overlayColIdx = findColumnIndex(agentTable.headers, COLUMN_VARIANTS['Team-Specific Behavioral Overlay']);
    const requiredColIdx = findColumnIndex(agentTable.headers, COLUMN_VARIANTS['Required']);
    const roleColIdx = findColumnIndex(agentTable.headers, COLUMN_VARIANTS['Role']);

    for (let i = 0; i < agentTable.rows.length; i++) {
      const row = agentTable.rows[i];
      const roleName = roleColIdx >= 0 ? row[roleColIdx]?.trim() : `row ${i + 1}`;

      // 2c-i. Validate agent file path format
      if (agentColIdx >= 0) {
        const agentCell = row[agentColIdx]?.trim() ?? '';
        const pathMatch = agentCell.match(AGENT_PATH_PATTERN);

        if (pathMatch) {
          // Extract filename and check it exists in known agents
          const fullPath = pathMatch[0];
          const filename = fullPath.replace('plugins/synthex/agents/', '').replace('.md', '');
          if (!KNOWN_AGENTS.includes(filename)) {
            warnings.push(
              `Role "${roleName}": agent path "${fullPath}" references unknown agent "${filename}"`
            );
          }
        } else if (!agentCell.toLowerCase().includes('not an agent') && !agentCell.toLowerCase().includes('orchestrator') && agentCell !== '') {
          // Allow non-agent leads (like "Command orchestrator (not an agent)") without error
          errors.push(
            `Role "${roleName}": agent reference does not match expected path format "plugins/synthex/agents/*.md" (got: "${agentCell}")`
          );
        }
      }

      // 2c-ii. Validate non-empty behavioral overlay
      if (overlayColIdx >= 0) {
        const overlayCell = row[overlayColIdx]?.trim() ?? '';
        if (overlayCell === '' || overlayCell === '{placeholder}') {
          warnings.push(`Role "${roleName}": behavioral overlay is empty`);
        }
      }

      // 2c-iii. Validate Required column has a value
      if (requiredColIdx >= 0) {
        const requiredCell = row[requiredColIdx]?.trim().toLowerCase() ?? '';
        if (requiredCell !== 'yes' && requiredCell !== 'no' && requiredCell !== 'yes/no') {
          warnings.push(
            `Role "${roleName}": Required column should be "Yes" or "No" (got: "${row[requiredColIdx]?.trim()}")`
          );
        }
      }
    }
  }

  // 3. Spawn Pattern section (optional but recommended)
  const spawnSection = findSection(parsed.sections, 'Spawn Pattern');
  if (!spawnSection) {
    warnings.push('Missing recommended section: "Spawn Pattern (read-on-spawn)"');
  } else {
    // If present, should reference read-on-spawn pattern
    const spawnContent = spawnSection.content + ' ' + spawnSection.title;
    if (
      !spawnContent.toLowerCase().includes('read-on-spawn') &&
      !spawnContent.toLowerCase().includes('read on spawn') &&
      !spawnSection.title.toLowerCase().includes('read-on-spawn')
    ) {
      warnings.push('Spawn Pattern section does not reference "read-on-spawn" pattern');
    }
  }

  // 4. "When to Use" section should have both "Use" and "Do NOT use" guidance
  const whenSection = findSection(parsed.sections, 'When to Use');
  if (whenSection) {
    const sectionText = whenSection.content;
    if (!sectionText.includes('Use this template when')) {
      warnings.push('"When to Use" section missing "Use this template when:" guidance');
    }
    if (!sectionText.includes('Do NOT use this template when') && !sectionText.includes('Do NOT use')) {
      warnings.push('"When to Use" section missing "Do NOT use this template when:" guidance');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Find the agent references table by looking for a table in or near
 * the "Agent References" section.
 */
function findAgentTable(tables: Table[]): Table | undefined {
  // First try exact section title match
  const byTitle = tables.find(t =>
    t.sectionTitle.toLowerCase().includes('agent references') ||
    t.sectionTitle.toLowerCase().includes('agent ref')
  );
  if (byTitle) return byTitle;

  // Fall back to any table whose headers look like the roles table
  return tables.find(t =>
    t.headers.some(h => h.toLowerCase().includes('role')) &&
    t.headers.some(h => h.toLowerCase().includes('agent'))
  );
}

/**
 * Find a column index by checking header names against variant list.
 */
function findColumnIndex(headers: string[], variants: string[]): number {
  return headers.findIndex(h =>
    variants.some(v => h.toLowerCase().includes(v.toLowerCase()))
  );
}

export { parseMarkdownOutput };

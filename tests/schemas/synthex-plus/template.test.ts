/**
 * Layer 1: Schema validation tests for Synthex+ team templates.
 *
 * Validates structural compliance against the canonical skeleton
 * defined in plugins/synthex-plus/templates/_skeleton.md.
 * Runs against real template files and inline samples.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateTemplate, parseMarkdownOutput } from './template.js';
import { findSection } from '../helpers.js';

// ── Load Real Templates ─────────────────────────────────────────

const TEMPLATES_DIR = join(import.meta.dirname, '..', '..', '..', 'plugins', 'synthex-plus', 'templates');

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, `${name}.md`), 'utf-8');
}

// ── Real Template Validation ────────────────────────────────────

describe('Synthex+ Template Schema', () => {
  describe('Real templates pass validation', () => {
    const templateNames = ['implementation', 'review', 'planning'];

    for (const name of templateNames) {
      describe(`Template: ${name}`, () => {
        const content = loadTemplate(name);
        const result = validateTemplate(content);

        it('passes full schema validation (no errors)', () => {
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
          expect(result.valid).toBe(true);
        });

        it('has all required sections', () => {
          const parsed = parseMarkdownOutput(content);
          expect(findSection(parsed.sections, 'Purpose')).toBeDefined();
          expect(findSection(parsed.sections, 'Agent References')).toBeDefined();
          expect(findSection(parsed.sections, 'Communication Patterns')).toBeDefined();
          expect(findSection(parsed.sections, 'Task Decomposition')).toBeDefined();
          expect(findSection(parsed.sections, 'Quality Gates')).toBeDefined();
          expect(findSection(parsed.sections, 'When to Use')).toBeDefined();
        });

        it('has an agent references table with at least one role', () => {
          const parsed = parseMarkdownOutput(content);
          const agentTable = parsed.tables.find(t =>
            t.sectionTitle.toLowerCase().includes('agent references') ||
            (t.headers.some(h => h.toLowerCase().includes('role')) &&
             t.headers.some(h => h.toLowerCase().includes('agent')))
          );
          expect(agentTable, 'Expected agent references table').toBeDefined();
          expect(agentTable!.rows.length).toBeGreaterThanOrEqual(1);
        });

        it('has the Spawn Pattern subsection', () => {
          const parsed = parseMarkdownOutput(content);
          expect(findSection(parsed.sections, 'Spawn Pattern')).toBeDefined();
        });

        it('references read-on-spawn in Spawn Pattern', () => {
          const parsed = parseMarkdownOutput(content);
          const spawnSection = findSection(parsed.sections, 'Spawn Pattern');
          expect(spawnSection).toBeDefined();
          const combinedText = spawnSection!.title + ' ' + spawnSection!.content;
          expect(combinedText.toLowerCase()).toContain('read-on-spawn');
        });
      });
    }
  });

  // ── Unit Tests: Valid Template ──────────────────────────────────

  describe('Valid minimal template', () => {
    const validTemplate = `# Example Team Template

> An example team for testing purposes.

## Purpose

- This team enables parallel work across specialists.
- Optimized for multi-domain coordination.
- Quality is embedded through reviewer teammates.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | \`plugins/synthex/agents/tech-lead.md\` | Yes | Mailbox: sends task assignments to teammates. Task list: creates all tasks with descriptions and dependencies. Reporting: produces progress reports at checkpoints. |
| Reviewer | \`plugins/synthex/agents/code-reviewer.md\` | Yes | Mailbox: sends findings to Lead on completion. Task list: claims review tasks. Communication: messages implementers when FAIL verdict. |
| Security | \`plugins/synthex/agents/security-reviewer.md\` | No | Mailbox: sends security findings to Lead. Task list: claims security review tasks. |

### Spawn Pattern (read-on-spawn)

Each teammate's spawn prompt follows this structure:

1. **Identity:** "Read your full agent definition at \`{agent file path}\` and adopt it as your identity"
   - The teammate reads the complete Synthex agent markdown file
   - No condensed summaries -- the canonical agent file IS the identity

2. **Overlay:** Team-specific behavioral instructions from the overlay column
   - These overlay instructions layer ON TOP of the base agent identity

3. **Context:** Project context
   - CLAUDE.md and project-level conventions

## Communication Patterns

- Lead creates initial task decomposition on the shared task list.
- Teammates use SendMessage to notify Lead when blocked.
- Cross-domain findings are messaged directly between relevant teammates.
- Escalation: blocked teammates notify Lead for reassignment.

## Task Decomposition Guidance

- Lead maps plan tasks to shared task list items with acceptance criteria.
- Dependencies use addBlockedBy to enforce ordering.
- Task descriptions follow the references context mode.
- Teammates claim tasks via TaskUpdate.

## Quality Gates

- TaskCompleted hook fires on every task completion.
- FAIL verdict blocks task completion. WARN findings are documented.
- TeammateIdle hook checks for pending tasks matching the idle role.

## When to Use / When NOT to Use

**Use this template when:**

- Estimated work exceeds 4 hours
- Changes span 3+ files across 2+ layers
- Multiple specialists need coordination

**Do NOT use this template when:**

- Single task under 30 minutes
- Work confined to a single domain
- Use standard Synthex next-priority instead
`;

    it('passes validation with no errors', () => {
      const result = validateTemplate(validTemplate);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('produces no warnings', () => {
      const result = validateTemplate(validTemplate);
      expect(result.warnings).toEqual([]);
    });

    it('detects all three agent roles', () => {
      const parsed = parseMarkdownOutput(validTemplate);
      const agentTable = parsed.tables.find(t =>
        t.headers.some(h => h.toLowerCase().includes('role'))
      );
      expect(agentTable!.rows).toHaveLength(3);
    });
  });

  // ── Unit Tests: Missing Required Sections ──────────────────────

  describe('Missing required sections', () => {
    const minimalBroken = `# Broken Template

## Purpose

- Does something useful.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | \`plugins/synthex/agents/tech-lead.md\` | Yes | Sends tasks to teammates. |
`;

    it('reports errors for missing sections', () => {
      const result = validateTemplate(minimalBroken);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('reports missing Communication Patterns', () => {
      const result = validateTemplate(minimalBroken);
      expect(result.errors.some(e => e.includes('Communication Patterns'))).toBe(true);
    });

    it('reports missing Task Decomposition Guidance', () => {
      const result = validateTemplate(minimalBroken);
      expect(result.errors.some(e => e.includes('Task Decomposition'))).toBe(true);
    });

    it('reports missing Quality Gates', () => {
      const result = validateTemplate(minimalBroken);
      expect(result.errors.some(e => e.includes('Quality Gates'))).toBe(true);
    });

    it('reports missing When to Use', () => {
      const result = validateTemplate(minimalBroken);
      expect(result.errors.some(e => e.includes('When to Use'))).toBe(true);
    });
  });

  // ── Unit Tests: Missing Agent Table ────────────────────────────

  describe('Missing agent references table', () => {
    const noTable = `# No Table Template

## Purpose

- Does something.

## Agent References

This team uses several agents but no table is defined.

## Communication Patterns

- Teammates communicate via messages.

## Task Decomposition Guidance

- Lead decomposes tasks.

## Quality Gates

- Review gates apply.

## When to Use / When NOT to Use

**Use this template when:**

- Large projects

**Do NOT use this template when:**

- Small tasks
`;

    it('reports error for missing table', () => {
      const result = validateTemplate(noTable);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing agent references table'))).toBe(true);
    });

    it('warns about missing Spawn Pattern', () => {
      const result = validateTemplate(noTable);
      expect(result.warnings.some(w => w.includes('Spawn Pattern'))).toBe(true);
    });
  });

  // ── Unit Tests: Invalid Agent Path ─────────────────────────────

  describe('Invalid agent file path', () => {
    const badPath = `# Bad Path Template

## Purpose

- Testing invalid agent paths.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | \`agents/tech-lead.md\` | Yes | Sends tasks to teammates. |
| Reviewer | \`plugins/synthex/agents/code-reviewer.md\` | Yes | Reviews code. |

## Communication Patterns

- Teammates communicate via messages.

## Task Decomposition Guidance

- Lead decomposes tasks.

## Quality Gates

- Review gates apply.

## When to Use / When NOT to Use

**Use this template when:**

- Large projects

**Do NOT use this template when:**

- Small tasks
`;

    it('reports error for invalid agent path format', () => {
      const result = validateTemplate(badPath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.includes('does not match expected path format') && e.includes('Lead')
      )).toBe(true);
    });

    it('valid agent path does not produce an error', () => {
      const result = validateTemplate(badPath);
      // The Reviewer row with a valid path should not produce an error
      expect(result.errors.some(e => e.includes('Reviewer'))).toBe(false);
    });
  });

  // ── Unit Tests: Unknown Agent Reference ────────────────────────

  describe('Unknown agent reference', () => {
    const unknownAgent = `# Unknown Agent Template

## Purpose

- Testing unknown agent.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | \`plugins/synthex/agents/tech-lead.md\` | Yes | Sends tasks. |
| Wizard | \`plugins/synthex/agents/wizard-agent.md\` | Yes | Casts spells. |

## Communication Patterns

- Teammates communicate.

## Task Decomposition Guidance

- Lead decomposes.

## Quality Gates

- Gates apply.

## When to Use / When NOT to Use

**Use this template when:**

- Large projects

**Do NOT use this template when:**

- Small tasks
`;

    it('warns about unknown agent file', () => {
      const result = validateTemplate(unknownAgent);
      expect(result.warnings.some(w =>
        w.includes('unknown agent') && w.includes('wizard-agent')
      )).toBe(true);
    });

    it('still passes validation (warning, not error)', () => {
      const result = validateTemplate(unknownAgent);
      expect(result.valid).toBe(true);
    });
  });

  // ── Unit Tests: Empty Behavioral Overlay ───────────────────────

  describe('Empty behavioral overlay', () => {
    const emptyOverlay = `# Empty Overlay Template

## Purpose

- Testing empty overlays.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | \`plugins/synthex/agents/tech-lead.md\` | Yes | Sends tasks and coordinates. |
| Reviewer | \`plugins/synthex/agents/code-reviewer.md\` | Yes |  |

## Communication Patterns

- Teammates communicate.

## Task Decomposition Guidance

- Lead decomposes.

## Quality Gates

- Gates apply.

## When to Use / When NOT to Use

**Use this template when:**

- Large projects

**Do NOT use this template when:**

- Small tasks
`;

    it('warns about empty overlay', () => {
      const result = validateTemplate(emptyOverlay);
      expect(result.warnings.some(w =>
        w.includes('behavioral overlay is empty') && w.includes('Reviewer')
      )).toBe(true);
    });
  });

  // ── Unit Tests: Non-Agent Lead (e.g., orchestrator) ────────────

  describe('Non-agent lead role (command orchestrator)', () => {
    const orchestratorLead = `# Orchestrator Lead Template

## Purpose

- Testing non-agent lead.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | Command orchestrator (not an agent) | Yes | Coordinates all reviewers and consolidates findings. |
| Reviewer | \`plugins/synthex/agents/code-reviewer.md\` | Yes | Reviews code quality. |

## Communication Patterns

- Lead distributes review tasks.

## Task Decomposition Guidance

- Lead creates one task per reviewer.

## Quality Gates

- Consolidated verdict applies.

## When to Use / When NOT to Use

**Use this template when:**

- Large diffs

**Do NOT use this template when:**

- Small diffs
`;

    it('does not error on non-agent lead', () => {
      const result = validateTemplate(orchestratorLead);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  // ── Unit Tests: Table Column Variants ──────────────────────────

  describe('Table with missing columns', () => {
    const missingColumns = `# Missing Columns Template

## Purpose

- Testing missing table columns.

## Agent References

| Role | Agent File | Status |
|------|-----------|--------|
| Lead | tech-lead.md | Active |

## Communication Patterns

- Teammates communicate.

## Task Decomposition Guidance

- Lead decomposes.

## Quality Gates

- Gates apply.

## When to Use / When NOT to Use

**Use this template when:**

- Large projects

**Do NOT use this template when:**

- Small tasks
`;

    it('reports errors for missing required columns', () => {
      const result = validateTemplate(missingColumns);
      expect(result.valid).toBe(false);
      // Should be missing "Required" and "Behavioral Overlay" columns
      expect(result.errors.some(e => e.includes('Required'))).toBe(true);
      expect(result.errors.some(e => e.includes('Behavioral Overlay') || e.includes('Team-Specific'))).toBe(true);
    });
  });

  // ── Unit Tests: When to Use Guidance Quality ───────────────────

  describe('When to Use section quality checks', () => {
    const missingGuidance = `# Missing Guidance Template

## Purpose

- Testing when-to-use quality.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | \`plugins/synthex/agents/tech-lead.md\` | Yes | Coordinates work. |

## Communication Patterns

- Teammates communicate.

## Task Decomposition Guidance

- Lead decomposes.

## Quality Gates

- Gates apply.

## When to Use / When NOT to Use

This team is useful for big projects.
`;

    it('warns when "Use this template when" guidance is missing', () => {
      const result = validateTemplate(missingGuidance);
      expect(result.warnings.some(w => w.includes('Use this template when'))).toBe(true);
    });

    it('warns when "Do NOT use" guidance is missing', () => {
      const result = validateTemplate(missingGuidance);
      expect(result.warnings.some(w => w.includes('Do NOT use'))).toBe(true);
    });
  });

  // ── Unit Tests: Completely Empty Input ─────────────────────────

  describe('Empty input', () => {
    it('reports all required sections as missing', () => {
      const result = validateTemplate('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
    });

    it('reports missing agent table', () => {
      const result = validateTemplate('');
      expect(result.errors.some(e => e.includes('Missing agent references table'))).toBe(true);
    });
  });

  // ── Unit Tests: Skeleton Template ──────────────────────────────

  describe('Skeleton template (_skeleton.md)', () => {
    const skeleton = loadTemplate('_skeleton');

    it('has all required sections (structural compliance)', () => {
      const result = validateTemplate(skeleton);
      // The skeleton has the right structure but placeholder content
      const sectionErrors = result.errors.filter(e => e.includes('Missing required section'));
      expect(sectionErrors, `Section errors:\n${sectionErrors.join('\n')}`).toEqual([]);
    });

    it('has the agent references table', () => {
      const result = validateTemplate(skeleton);
      const tableError = result.errors.find(e => e.includes('Missing agent references table'));
      expect(tableError).toBeUndefined();
    });
  });
});

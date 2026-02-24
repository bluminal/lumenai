/**
 * Layer 1: Schema validation tests for Design System Agent output.
 *
 * Validates structural compliance against the Compliance Review format
 * defined in design-system-agent.md. Runs against golden snapshots
 * and inline samples.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateDesignSystemOutput } from './design-system-agent.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadDesignSystemSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('design-system-agent--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('design-system-agent--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Design System Agent Schema', () => {
  const snapshots = loadDesignSystemSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateDesignSystemOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('has a verdict (PASS, WARN, or FAIL)', () => {
          const parsed = parseMarkdownOutput(output);
          expect(parsed.verdict, 'Could not detect verdict in output').not.toBeNull();
          expect(['PASS', 'WARN', 'FAIL']).toContain(parsed.verdict);
        });

        it('contains design-system-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('design system') ||
            lower.includes('token') ||
            lower.includes('compliance') ||
            lower.includes('component') ||
            lower.includes('accessibility')
          ).toBe(true);
        });
      });
    }
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Design System Compliance output parser', () => {
  const sampleOutput = `## Design System Compliance Review: WARN

### Summary
3 token violations and 1 accessibility issue found. Component usage is consistent.

### Token Violations
| Location | Violation | Current Value | Should Be |
|----------|-----------|---------------|-----------|
| src/components/Card.tsx:12 | Hardcoded color | \`#3b82f6\` | \`var(--color-primary)\` |
| src/components/Card.tsx:18 | Hardcoded spacing | \`16px\` | \`var(--space-4)\` |
| src/pages/Dashboard.tsx:45 | Hardcoded font-size | \`14px\` | \`var(--text-sm)\` |

### Component Usage Issues

#### [MEDIUM] Custom Button Instead of Design System Button
- **Location:** src/pages/Settings.tsx:32-45
- **Issue:** Custom-styled \`<button>\` element instead of the design system \`<Button>\` component
- **Recommendation:** Replace with \`<Button variant="secondary">\` from the design system

### Accessibility Findings

#### [HIGH] Missing Alt Text on Logo
- **Location:** src/components/Header.tsx:8
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Issue:** Logo image has empty alt attribute: \`alt=""\`
- **Remediation:** Add descriptive alt text: \`alt="Company Name logo"\`

### Recommendations
1. Set up a lint rule to catch hardcoded color values (stylelint or ESLint plugin)
2. Create a token migration codemod for existing hardcoded values
3. Add the \`<Button>\` component to the Storybook docs with usage guidelines`;

  it('extracts WARN verdict', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.verdict).toBe('WARN');
    expect(parsed.agentType).toBe('design-system');
  });

  it('extracts 2 findings', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings).toHaveLength(2);
  });

  it('findings include accessibility issue', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const a11yFinding = parsed.findings.find(f => f.title.includes('Alt Text'));
    expect(a11yFinding).toBeDefined();
    expect(a11yFinding!.severity).toBe('HIGH');
  });

  it('has Token Violations section with table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Token Violations');
    expect(section).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('token')
    );
    expect(table).toBeDefined();
    expect(table!.rows.length).toBe(3);
  });

  it('has Accessibility Findings section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Accessibility Findings')).toBeDefined();
  });

  it('has Recommendations section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(findSection(parsed.sections, 'Recommendations')).toBeDefined();
  });

  it('passes full schema validation', () => {
    const result = validateDesignSystemOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

/**
 * Layer 1: Schema validation tests for UX Researcher output.
 *
 * Validates structural compliance against the research artifact
 * formats defined in ux-researcher.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateUXResearcherOutput, detectArtifactType } from './ux-researcher.js';
import {
  parseMarkdownOutput,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadUXSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('ux-researcher--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('ux-researcher--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('UX Researcher Schema', () => {
  const snapshots = loadUXSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateUXResearcherOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });
      });
    }
  });
});

// ── Artifact Type Detection Tests ────────────────────────────────

describe('UX Artifact Type Detection', () => {
  it('detects Opportunity Solution Tree', () => {
    const ost = `## Opportunity Solution Tree: Dashboard Redesign\n\n### Target Outcome\nImprove activation rate`;
    expect(detectArtifactType(ost)).toBe('ost');
  });

  it('detects Persona', () => {
    const persona = `## Persona: Alex the Admin\n\n### Demographics`;
    expect(detectArtifactType(persona)).toBe('persona');
  });

  it('detects Journey Map', () => {
    const journey = `## User Journey: New User Onboarding\n\n### Actor: Alex`;
    expect(detectArtifactType(journey)).toBe('journey-map');
  });

  it('detects Research Plan', () => {
    const plan = `## Research Plan: Checkout Usability Study\n\n### Objective`;
    expect(detectArtifactType(plan)).toBe('research-plan');
  });

  it('detects Heuristic Evaluation', () => {
    const he = `## Heuristic Evaluation: Settings Page\n\nEvaluated against Nielsen's 10 Usability Heuristics`;
    expect(detectArtifactType(he)).toBe('heuristic-evaluation');
  });

  it('returns unknown for unrecognized content', () => {
    expect(detectArtifactType('Some random text')).toBe('unknown');
  });
});

// ── Unit tests: Opportunity Solution Tree ────────────────────────

describe('Opportunity Solution Tree parser', () => {
  const sampleOST = `## Opportunity Solution Tree: Developer Tool Adoption

### Target Outcome
Increase weekly active users from 2,400 to 5,000 within 6 months.
**Metric:** Weekly Active Users (WAU)
**Current:** 2,400
**Target:** 5,000

### Opportunities

#### Opportunity 1: Onboarding is Too Complex
- **Evidence:** 60% of signups abandon before completing setup (analytics), 8 of 12 interviewees mentioned "confusing first experience" (user interviews)
- **User segments affected:** New Developer Persona, Hobbyist Persona
- **Severity:** High — directly impacts activation rate
- **Frequency:** Every new user encounters this

  **Potential Solutions:**
  | Solution | Effort | Confidence | Assumptions to Test |
  |----------|--------|------------|-------------------|
  | Interactive tutorial | M | High | Users will complete a 3-step tutorial |
  | Template gallery | S | Medium | Users prefer starting from templates over blank projects |
  | AI-powered setup wizard | L | Low | LLM can reliably infer project type from description |

#### Opportunity 2: No Collaboration Features
- **Evidence:** 5 of 12 interviewees asked about sharing/collaboration, "collaboration" is the #2 feature request in support tickets
- **User segments affected:** Team Lead Persona, New Developer Persona
- **Severity:** Medium — impacts retention for team users
- **Frequency:** Teams evaluate collaboration weekly

  **Potential Solutions:**
  | Solution | Effort | Confidence | Assumptions to Test |
  |----------|--------|------------|-------------------|
  | Shared workspaces | L | Medium | Teams will invite 3+ members on average |
  | Export/share links | S | High | Users value read-only sharing |

### Assumptions to Test
| Assumption | Risk if Wrong | Test Method | Status |
|-----------|--------------|-------------|--------|
| Users will complete a 3-step tutorial | Wasted engineering effort on tutorial | A/B test: tutorial vs. no tutorial | untested |
| Users prefer templates over blank projects | Template gallery underutilized | Card sort + prototype test | untested |
| Teams will invite 3+ members | Collaboration feature has low adoption | Survey existing team users | untested |`;

  it('detects OST artifact type', () => {
    expect(detectArtifactType(sampleOST)).toBe('ost');
  });

  it('has Target Outcome with metric', () => {
    const parsed = parseMarkdownOutput(sampleOST);
    expect(findSection(parsed.sections, 'Target Outcome')).toBeDefined();
    expect(sampleOST).toContain('**Metric:**');
  });

  it('has Opportunities section', () => {
    const parsed = parseMarkdownOutput(sampleOST);
    expect(findSection(parsed.sections, 'Opportunities')).toBeDefined();
  });

  it('has Assumptions to Test table', () => {
    const parsed = parseMarkdownOutput(sampleOST);
    expect(findSection(parsed.sections, 'Assumptions')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('assumption')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Assumption');
    expect(table!.headers).toContain('Status');
  });

  it('passes schema validation', () => {
    const result = validateUXResearcherOutput(sampleOST);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ── Unit tests: Persona ──────────────────────────────────────────

describe('Persona output parser', () => {
  const samplePersona = `## Persona: Jordan the Junior Developer

### Demographics
- **Role/Title:** Junior Frontend Developer (0-2 years experience)
- **Experience level:** Novice
- **Technical proficiency:** Medium

### Goals
1. Ship features independently without constant senior guidance
2. Learn best practices through real project work

### Pain Points
1. Configuration files are overwhelming — doesn't know what most settings do
2. Error messages are cryptic and don't suggest fixes

### Current Behavior
Uses VS Code with default settings. Copies configuration from blog posts without understanding it. Relies on Stack Overflow and ChatGPT for debugging.

### Quotes (from research)
> "I spend more time configuring tools than writing actual code."
> -- User interview #3, Jan 2026

> "I wish the tool would just tell me what I'm doing wrong instead of showing me a wall of errors."
> -- User interview #7, Jan 2026

### Evidence Basis
Based on 8 user interviews and 142 support ticket analysis (Jan 2026). 5 of 8 interviewees matched this persona profile.

⚠️ **Confidence Level:** HIGH: based on 8 interviews with consistent patterns`;

  it('detects persona artifact type', () => {
    expect(detectArtifactType(samplePersona)).toBe('persona');
  });

  it('has Goals section', () => {
    const parsed = parseMarkdownOutput(samplePersona);
    expect(findSection(parsed.sections, 'Goals')).toBeDefined();
  });

  it('has Pain Points section', () => {
    const parsed = parseMarkdownOutput(samplePersona);
    expect(findSection(parsed.sections, 'Pain Points')).toBeDefined();
  });

  it('has Evidence Basis section', () => {
    const parsed = parseMarkdownOutput(samplePersona);
    expect(findSection(parsed.sections, 'Evidence Basis')).toBeDefined();
  });

  it('has Confidence Level', () => {
    expect(samplePersona).toMatch(/confidence level/i);
  });

  it('passes schema validation', () => {
    const result = validateUXResearcherOutput(samplePersona);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

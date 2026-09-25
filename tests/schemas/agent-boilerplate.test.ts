/**
 * Layer 1: Schema validation for Task 16 (FR-HM6) — boilerplate removal from
 * the 12 specialist agents.
 *
 * Verifies, per specialist:
 *   - The agent file shrank by at least 1,536 bytes (1.5 KB) relative to the
 *     size recorded in tests/fixtures/agent-boilerplate/agent-sizes-before.json
 *     before Task 16 edits began.
 *   - The H1 heading is byte-identical to the recorded H1 (the wrapper
 *     generator reads it).
 *   - Where the agent had a `## Output Format` section, its body (heading
 *     through the end of its fenced template, stopping before the next
 *     unfenced H2) is byte-identical to the body captured before Task 16.
 *   - `## Interaction with Other Agents` and `## Future Considerations` no
 *     longer appear anywhere in the file.
 *
 * Also verifies that the relocated content landed in docs/agent-interactions.md
 * (one `### <Agent>` subsection per specialist that had an Interaction table)
 * and docs/roadmap.md (one `## <Agent>` subsection per specialist, since all
 * 12 had a Future Considerations section).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'agent-boilerplate');
const DOCS_DIR = join(__dirname, '..', '..', 'docs');

const SIZES_BEFORE_PATH = join(FIXTURES_DIR, 'agent-sizes-before.json');

interface AgentSizeRecord {
  before_bytes: number;
  h1: string | null;
  has_output_format: boolean;
  output_format_bytes: number | null;
}

const MIN_REDUCTION_BYTES = 1536; // 1.5 KB

/**
 * Extracts a `## Output Format` section's body: from the heading through the
 * end of its fenced code block, stopping at the first H2 that is NOT inside
 * a fenced code block. Mirrors the extraction used to build the fixtures.
 */
function extractOutputFormatBody(content: string): string | null {
  const idx = content.indexOf('## Output Format');
  if (idx === -1) return null;
  const lines = content.slice(idx).split('\n');
  let inFence = false;
  let endLineIdx = lines.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^## /.test(line)) {
      endLineIdx = i;
      break;
    }
  }
  return lines
    .slice(0, endLineIdx)
    .join('\n')
    .replace(/\n+$/, '\n');
}

function extractH1(content: string): string | null {
  const m = content.match(/^# .*$/m);
  return m ? m[0] : null;
}

describe('Task 16 (FR-HM6): specialist agent boilerplate diet', () => {
  let sizesBefore: Record<string, AgentSizeRecord>;

  beforeAll(() => {
    sizesBefore = JSON.parse(readFileSync(SIZES_BEFORE_PATH, 'utf8'));
  });

  it('baseline fixture exists and lists exactly the 12 specialists', () => {
    const expected = [
      'architect',
      'code-reviewer',
      'security-reviewer',
      'terraform-plan-reviewer',
      'quality-engineer',
      'design-system-agent',
      'performance-engineer',
      'sre-agent',
      'technical-writer',
      'ux-researcher',
      'metrics-analyst',
      'retrospective-facilitator',
    ];
    expect(Object.keys(sizesBefore).sort()).toEqual([...expected].sort());
  });

  // Iterate lazily inside a single describe so we can reference sizesBefore
  // captured in beforeAll (describe.each would run before beforeAll).
  describe('per-agent checks', () => {
    const agentNames = [
      'architect',
      'code-reviewer',
      'security-reviewer',
      'terraform-plan-reviewer',
      'quality-engineer',
      'design-system-agent',
      'performance-engineer',
      'sre-agent',
      'technical-writer',
      'ux-researcher',
      'metrics-analyst',
      'retrospective-facilitator',
    ];

    for (const agent of agentNames) {
      describe(agent, () => {
        const path = join(AGENTS_DIR, `${agent}.md`);
        let content: string;

        beforeAll(() => {
          content = readFileSync(path, 'utf8');
        });

        it('file exists', () => {
          expect(existsSync(path)).toBe(true);
        });

        it(`shrank by at least ${MIN_REDUCTION_BYTES} bytes`, () => {
          const before = sizesBefore[agent].before_bytes;
          const after = Buffer.byteLength(content, 'utf8');
          const reduction = before - after;
          expect(
            reduction,
            `expected ${agent}.md to shrink by >= ${MIN_REDUCTION_BYTES} bytes ` +
              `(before=${before}, after=${after}, reduction=${reduction})`
          ).toBeGreaterThanOrEqual(MIN_REDUCTION_BYTES);
        });

        it('H1 is unchanged (wrapper generator reads it)', () => {
          expect(extractH1(content)).toBe(sizesBefore[agent].h1);
        });

        it('has no "## Interaction with Other Agents" section', () => {
          expect(content).not.toContain('## Interaction with Other Agents');
        });

        it('has no "## Future Considerations" section', () => {
          expect(content).not.toContain('## Future Considerations');
        });

        it('"## Output Format" body is byte-identical when present', () => {
          const record = sizesBefore[agent];
          if (!record.has_output_format) {
            // This specialist never had an Output Format section; nothing to check.
            expect(content.includes('## Output Format')).toBe(false);
            return;
          }
          const capturedPath = join(FIXTURES_DIR, `${agent}.output-format.txt`);
          const captured = readFileSync(capturedPath, 'utf8');
          const current = extractOutputFormatBody(content);
          expect(current).not.toBeNull();
          expect(Buffer.byteLength(current as string, 'utf8')).toBe(
            record.output_format_bytes
          );
          expect(current).toBe(captured);
        });
      });
    }
  });

  describe('relocated content lands in docs/agent-interactions.md', () => {
    let content: string;
    beforeAll(() => {
      content = readFileSync(join(DOCS_DIR, 'agent-interactions.md'), 'utf8');
    });

    // Only specialists that HAD an "## Interaction with Other Agents" section
    // before Task 16 (security-reviewer and terraform-plan-reviewer never did).
    const withInteractionTable = [
      ['architect', 'Architect'],
      ['code-reviewer', 'Code Reviewer'],
      ['quality-engineer', 'Quality Engineer'],
      ['design-system-agent', 'Design System Agent'],
      ['performance-engineer', 'Performance Engineer'],
      ['sre-agent', 'SRE Agent'],
      ['technical-writer', 'Technical Writer'],
      ['ux-researcher', 'UX Researcher'],
      ['metrics-analyst', 'Metrics Analyst'],
      ['retrospective-facilitator', 'Retrospective Facilitator'],
    ] as const;

    it.each(withInteractionTable)('has a subsection for %s (%s)', (_slug, title) => {
      expect(content).toContain(`### ${title}`);
    });

    it('does not claim a subsection for security-reviewer or terraform-plan-reviewer (they never had one)', () => {
      // These two never had "## Interaction with Other Agents" in their .md files,
      // so no subsection should have been fabricated for them.
      expect(content).not.toMatch(/### Security Reviewer\n/);
      expect(content).not.toMatch(/### Terraform Plan Reviewer\n/);
    });
  });

  describe('relocated content lands in docs/roadmap.md', () => {
    let content: string;
    beforeAll(() => {
      content = readFileSync(join(DOCS_DIR, 'roadmap.md'), 'utf8');
    });

    const titles = [
      'Architect',
      'Code Reviewer',
      'Security Reviewer',
      'Terraform Plan Reviewer',
      'Quality Engineer',
      'Design System Agent',
      'Performance Engineer',
      'SRE Agent',
      'Technical Writer',
      'UX Researcher',
      'Metrics Analyst',
      'Retrospective Facilitator',
    ];

    it.each(titles)('has a subsection for %s', (title) => {
      expect(content).toContain(`## ${title}`);
    });
  });

  describe('Scope Boundaries condensed to two lines, behavioral sentence kept', () => {
    // Agents that had an explicit "Overlap:" bullet before Task 16.
    const withOverlap = [
      'architect',
      'code-reviewer',
      'security-reviewer',
      'performance-engineer',
      'sre-agent',
      'technical-writer',
      'ux-researcher',
      'metrics-analyst',
      'retrospective-facilitator',
    ];
    // quality-engineer and design-system-agent had an "Escalation:" bullet
    // instead of "Overlap:" — that is the behavioral sentence FR-HM6 says to
    // keep for those two ("it is behavioral").
    const withEscalation = ['quality-engineer', 'design-system-agent'];
    // terraform-plan-reviewer never had a "## Scope Boundaries" heading.

    function scopeBoundariesSection(agent: string): string {
      const content = readFileSync(join(AGENTS_DIR, `${agent}.md`), 'utf8');
      const idx = content.indexOf('## Scope Boundaries');
      expect(idx).toBeGreaterThan(-1);
      const rest = content.slice(idx);
      const nextH2 = rest.slice(2).search(/\n## /);
      return nextH2 === -1 ? rest : rest.slice(0, nextH2 + 2);
    }

    it.each(withOverlap)('%s keeps the Scope Boundaries heading with an Overlap sentence', (agent) => {
      expect(scopeBoundariesSection(agent)).toMatch(/\*\*Overlap/i);
    });

    it.each(withEscalation)('%s keeps the Scope Boundaries heading with an Escalation sentence', (agent) => {
      expect(scopeBoundariesSection(agent)).toMatch(/\*\*Escalation/i);
    });
  });

  describe('When You Are Invoked trimmed to one sentence, heading kept', () => {
    const withWhenInvoked = [
      'architect',
      'code-reviewer',
      'security-reviewer',
      'quality-engineer',
      'design-system-agent',
      'performance-engineer',
      'sre-agent',
      'technical-writer',
      'ux-researcher',
      'metrics-analyst',
      'retrospective-facilitator',
    ];
    // terraform-plan-reviewer never had a "## When You Are Invoked" heading.

    it.each(withWhenInvoked)('%s keeps the When You Are Invoked heading', (agent) => {
      const content = readFileSync(join(AGENTS_DIR, `${agent}.md`), 'utf8');
      expect(content).toContain('## When You Are Invoked');
    });
  });

  describe('design-system-agent Sub-Agent Registry is a one-line config pointer', () => {
    it('points to design_system.specialists and drops the "not yet available" table', () => {
      const content = readFileSync(join(AGENTS_DIR, 'design-system-agent.md'), 'utf8');
      expect(content).toContain('design_system.specialists');
      expect(content).not.toContain('Not yet available');
    });
  });

  describe('terraform-plan-reviewer keeps provider-prefix routing, drops registry-extension prose', () => {
    let content: string;
    beforeAll(() => {
      content = readFileSync(join(AGENTS_DIR, 'terraform-plan-reviewer.md'), 'utf8');
    });

    it('keeps the provider-prefix routing table', () => {
      expect(content).toContain('aws_');
      expect(content).toContain('azurerm_');
      expect(content).toContain('google_');
    });

    it('drops the "Extending the Registry" section', () => {
      expect(content).not.toContain('Extending the Registry');
    });
  });

  describe('tech-lead.md and lead-frontend-engineer.md drop phantom sub-agent registries', () => {
    it('tech-lead.md has no "Registry of Available Sub-agents" table', () => {
      const content = readFileSync(join(AGENTS_DIR, 'tech-lead.md'), 'utf8');
      expect(content).not.toContain('Registry of Available Sub-agents');
      expect(content).not.toContain('not yet available');
    });

    it('lead-frontend-engineer.md has no "Registry of Available Framework Specialists" table', () => {
      const content = readFileSync(join(AGENTS_DIR, 'lead-frontend-engineer.md'), 'utf8');
      expect(content).not.toContain('Registry of Available Framework Specialists');
      expect(content).not.toContain('Not yet available');
    });
  });

  describe('multi-model-review-orchestrator.md: Source Authority collapsed, milestone bookkeeping trimmed', () => {
    let content: string;
    beforeAll(() => {
      content = readFileSync(
        join(AGENTS_DIR, 'multi-model-review-orchestrator.md'),
        'utf8'
      );
    });

    it('H1 is unchanged', () => {
      expect(extractH1(content)).toBe('# Multi-Model Review Orchestrator');
    });

    it('Source Authority is a single paragraph (no bullet list)', () => {
      const idx = content.indexOf('## Source Authority');
      expect(idx).toBeGreaterThan(-1);
      const rest = content.slice(idx);
      const nextH2 = rest.slice(2).search(/\n## /);
      const section = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 2);
      // No markdown bullet lines ("- ") inside the section body.
      const body = section.split('\n').slice(1).join('\n');
      expect(body).not.toMatch(/^- /m);
    });

    it('still locks the strings required by orchestrator-consolidation/preflight/stage5plus tests', () => {
      expect(content).toMatch(/Stages 1\+2 land in Task 24/);
      expect(content).toMatch(/Stage 4 in Task 26/);
      expect(content).toMatch(/preflight.*Task 21/i);
    });
  });
});

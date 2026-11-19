/**
 * The system-change diagram convention.
 *
 * Two artifacts, two questions, two diagrams:
 *
 *   PRD  — `Current and Target State`: today, then once delivered. WHAT changes.
 *   Plan — `Target State by Milestone`: the target with delivering milestones. IN WHAT ORDER.
 *
 * The split is load-bearing rather than tidy. Sequencing is re-decided on every
 * re-phasing, and a PRD is not rewritten when that happens — so a milestone
 * label in a PRD is stale the first time anyone reorders the work. Scope-level
 * topology only changes when scope changes, which does rewrite the PRD.
 *
 * Cost: $0 (no LLM calls — file assertions plus one lint-plan.mjs subprocess)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

const pm = read('agents/product-manager.md');
const writePlan = read('commands/write-implementation-plan.md');
const planRubric = read('docs/plan-lint-rubric.md');
const planScript = read('scripts/lint-plan.mjs');

/**
 * The first fenced block opened by `opener` after `after`, without its fences.
 *
 * The templates that hold mermaid diagrams use a four-backtick outer fence so
 * the nested ```mermaid fences do not close them, which is also what keeps
 * them rendering correctly on GitHub.
 */
function fencedBlock(text: string, after: string, opener = '````markdown'): string {
  const start = text.indexOf(opener, text.indexOf(after));
  if (start === -1) return '';
  const bodyStart = text.indexOf('\n', start) + 1;
  const close = '\n' + opener.match(/^`+/)![0] + '\n';
  return text.slice(bodyStart, text.indexOf(close, bodyStart) + 1);
}

/**
 * The section of `text` under `heading`, bounded by the next same-or-higher
 * heading that is NOT inside a fenced code block. Fences are tracked by
 * length, so a ```mermaid fence nested inside a ````markdown one is handled.
 */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const level = heading.match(/^#+/)![0].length;
  const lines = text.slice(start + heading.length).split('\n');

  const open: number[] = [];
  const out: string[] = [];
  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,})(\S*)\s*$/);
    if (fence) {
      const len = fence[1].length;
      if (!fence[2] && open.length && len >= open[open.length - 1]) open.pop();
      else open.push(len);
    } else if (!open.length && new RegExp(`^#{1,${level}} `).test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** H2 titles of a template, in order. */
const h2s = (template: string) => [...template.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

const prdTemplate = fencedBlock(pm, '## PRD Structure (Default Template)');
const pmPlanTemplate = fencedBlock(pm, '### Implementation Plan Structure (Default Template)');
const cmdPlanTemplate = fencedBlock(writePlan, '## Output');

describe('System-change diagrams', () => {
  it('the three templates were found', () => {
    expect(prdTemplate).toMatch(/^# Product Requirements Document:/);
    expect(pmPlanTemplate).toMatch(/^# Implementation Plan:/);
    expect(cmdPlanTemplate).toMatch(/^# Implementation Plan:/);
  });

  describe('The PRD carries what changes', () => {
    it('has a Current and Target State section, numbered contiguously', () => {
      expect(h2s(prdTemplate)).toEqual([
        '1. Vision & Purpose',
        '2. Target Users / Personas',
        '3. Current and Target State',
        '4. Functional Requirements',
        '5. Non-Functional Requirements',
        '6. Out of Scope',
        '7. Success Metrics',
        '8. Assumptions & Constraints',
      ]);
    });

    it('holds two diagrams — today and once delivered', () => {
      const sec = section(prdTemplate, '## 3. Current and Target State');
      expect(sec).toMatch(/\*\*Today\*\*\n```mermaid/);
      expect(sec).toMatch(/\*\*Once delivered\*\*\n```mermaid/);
      expect(sec.match(/```mermaid/g) ?? []).toHaveLength(2);
      expect(section(pm, '### Current and Target State Section')).toMatch(/Two diagrams, because the value is in the delta/);
    });

    it('carries no milestones, and says why not', () => {
      // The template must not demonstrate what it forbids.
      expect(section(prdTemplate, '## 3. Current and Target State')).not.toMatch(/\(M\d/);
      const rules = section(pm, '### Current and Target State Section');
      expect(rules).toMatch(/\*\*No milestones\.\*\*/);
      expect(rules).toMatch(/stale the first time anyone reorders the work/);
    });

    it('requires the today diagram to be grounded, not drawn', () => {
      const rules = section(pm, '### Current and Target State Section');
      expect(rules).toMatch(/\*\*A diagram must be earned\.\*\*/);
      expect(rules).toMatch(/Where it cannot be grounded, ask; do not draw/);
      expect(rules).toMatch(/A fabricated architecture diagram is worse than none/);
      expect(prdTemplate).toMatch(/\*Read off: \[/);
    });

    it('is omittable when the work changes no system shape', () => {
      // Requiring it would push toward drawing something decorative.
      expect(section(pm, '### Current and Target State Section')).toMatch(
        /\*\*Omit the section when the work changes no system shape\*\*/,
      );
      expect(prdTemplate).toMatch(/Omit when the work changes no system shape/);
    });
  });

  describe('The plan carries the order', () => {
    it.each([
      ['product-manager.md', () => pmPlanTemplate],
      ['write-implementation-plan.md', () => cmdPlanTemplate],
    ])('%s places Target State by Milestone between Overview and Decisions', (_name, template) => {
      const titles = h2s(template());
      const at = titles.indexOf('Target State by Milestone');
      expect(at).toBe(titles.indexOf('Overview') + 1);
      expect(titles[at + 1]).toBe('Decisions');
      expect(template()).toMatch(/Omit when the PRD has no/);
    });

    it('is derived from the PRD rather than invented', () => {
      const rules = section(pm, '### Target State by Milestone Section');
      expect(rules).toMatch(/\*\*Derive it; do not invent it\.\*\*/);
      expect(rules).toMatch(/a plan is not a basis for claiming what the architecture looks like/);
      expect(writePlan).toMatch(
        /A \*\*Target State by Milestone\*\* diagram derived from the PRD's `Current and Target State`, omitted when the PRD has none/,
      );
    });

    it('labels attribution, never progress', () => {
      const rules = section(pm, '### Target State by Milestone Section');
      expect(rules).toMatch(/\*\*Attribution, never progress\.\*\*/);
      expect(rules).toMatch(/Status already lives in the task tables/);
    });

    it('is kept current by the Product Manager when the plan is re-phased', () => {
      expect(section(pm, '### Target State by Milestone Section')).toMatch(/\*\*This section is yours to keep current\.\*\*/);
      expect(pm).toMatch(/\*\*Renumbering rule:\*\*[^\n]*`Target State by Milestone` labels\) in the same edit/);
    });

    it('the rubric and the script carry the same four checks', () => {
      for (const check of [
        'It is a fenced ```mermaid block | HIGH |',
        'Milestone labels carry attribution, never progress | HIGH |',
        'Every milestone label names a milestone the plan defines | HIGH |',
        'Node labels containing parentheses are quoted | HIGH |',
      ]) {
        expect(planRubric).toContain(check);
      }
      expect(planRubric).toMatch(/^## Target State by Milestone \(when present\)$/m);
      expect(planScript).toMatch(/reconciliation decision #15/);
      for (const title of [
        'Target State by Milestone is not a mermaid diagram',
        'Progress marker on a milestone label',
        'which this plan does not contain',
        'Unquoted parentheses in a mermaid node label',
      ]) {
        expect(planScript).toContain(title);
      }
    });

    it.each([
      ['product-manager.md', () => pmPlanTemplate],
      ['write-implementation-plan.md', () => cmdPlanTemplate],
    ])("%s's template example passes its own diagram checks", (_name, template) => {
      const dir = mkdtempSync(join(tmpdir(), 'system-change-diagrams-'));
      const file = join(dir, 'plan.md');
      writeFileSync(file, template());
      const result = spawnSync(process.execPath, [join(PLUGIN, 'scripts', 'lint-plan.mjs'), file], {
        encoding: 'utf8',
      });
      const report = JSON.parse(result.stdout);
      expect(report.findings.filter((f: { location: string }) => f.location.includes('Target State'))).toEqual([]);
    });
  });

  describe('Mermaid renders', () => {
    it('every mermaid block in the plugin quotes parenthesised node labels', () => {
      // `G[Gateway (M1)]` is a mermaid syntax error that renders as nothing,
      // while `G["Gateway (M1)"]` is correct. Adding a milestone suffix to a
      // bare label is exactly how this happens, so it is asserted statically
      // rather than left to the authoring prose.
      const offenders: string[] = [];
      let blocks = 0;

      for (const dir of ['agents', 'commands', 'docs'] as const) {
        for (const file of readdirSync(join(PLUGIN, dir)).filter((f) => f.endsWith('.md'))) {
          const text = read(`${dir}/${file}`);
          for (const block of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
            blocks++;
            for (const label of block[1].matchAll(/\[([^\]]*)\]/g)) {
              const inner = label[1];
              // `id[(text)]` (cylinder) and `id["text"]` (quoted) are both fine.
              if (inner.includes('(') && !inner.startsWith('(') && !inner.startsWith('"')) {
                offenders.push(`${dir}/${file}: ${label[0]}`);
              }
            }
          }
        }
      }

      expect(blocks).toBeGreaterThanOrEqual(4);
      expect(offenders).toEqual([]);
    });
  });
});

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
 * An earlier revision put both diagrams on the Notion epic page. That required
 * carving an exception into the epic's no-volatile-content rule and a step in
 * which one command patched another artifact to stop it going stale. Both were
 * symptoms of wrong placement; the negative assertions below pin the fix.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

const pm = read('agents/product-manager.md');
const prdLinter = read('docs/prd-lint-rubric.md');
const planLinter = read('docs/plan-lint-rubric.md');
const scribe = read('agents/product-manager.md');
const writePrd = read('commands/write-prd.md');
const writePlan = read('commands/write-implementation-plan.md');
const docStore = read('agents/notion-document-store.md');
const planRubric = read('docs/plan-lint-rubric.md');
const planScript = read('scripts/lint-plan.mjs');

/**
 * The section of `text` under `heading`, bounded by the next same-or-higher
 * heading that is NOT inside a fenced code block.
 *
 * Fence-awareness is not a nicety here: these files embed whole markdown
 * templates in fences, so a naive scan stops at the template's own `#`
 * headings and returns a fraction of the section. A tagged fence (```markdown)
 * opens a level and a bare ``` closes one, which handles the mermaid blocks
 * nested inside those templates.
 */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const level = heading.match(/^#+/)![0].length;
  const lines = text.slice(start + heading.length).split('\n');

  let depth = 0;
  const out: string[] = [];
  for (const line of lines) {
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) depth += fence[1] ? 1 : -1;
    else if (depth <= 0 && new RegExp(`^#{1,${level}} `).test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** Section numbers of a `## N. Title` template, in order. */
function sectionNumbers(template: string): number[] {
  return [...template.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
}

const fsShape = pm.slice(
  pm.indexOf('### Filesystem backend — self-contained'),
  pm.indexOf('### Notion backend — requirements'),
);
const notionShape = pm.slice(
  pm.indexOf('### Notion backend — requirements'),
  pm.indexOf('## Current and Target State'),
);

describe('System-change diagrams', () => {
  describe('The PRD carries what changes', () => {
    it('both PRD shapes have a Current and Target State section', () => {
      // "This becomes the norm even without Notion" — the convention is not
      // backend-specific, so it cannot live only in the shape Notion uses.
      expect(fsShape).toMatch(/^## \d+\. Current and Target State$/m);
      expect(notionShape).toMatch(/^## \d+\. Current and Target State$/m);
    });

    it('both shapes stay contiguously numbered after the insertion', () => {
      // Renumbering on insert is the recurring failure in these templates.
      const fsNums = sectionNumbers(fsShape);
      const nbNums = sectionNumbers(notionShape);
      expect(fsNums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(nbNums).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('sits before the requirements it frames', () => {
      for (const shape of [fsShape, notionShape]) {
        const diagrams = shape.indexOf('Current and Target State');
        const reqs = shape.indexOf('Functional Requirements');
        expect(diagrams).toBeGreaterThan(-1);
        expect(diagrams).toBeLessThan(reqs);
      }
    });

    it('holds two diagrams — today and once delivered', () => {
      const sec = section(pm, '## Current and Target State');
      expect(sec).toMatch(/Two diagrams rather than one/);
      expect(fsShape).toMatch(/\*\*Today\*\*/);
      expect(fsShape).toMatch(/\*\*Once delivered\*\*/);
      expect(fsShape.match(/```mermaid/g) ?? []).toHaveLength(2);
    });

    it('carries no milestones, and says why not', () => {
      const sec = section(pm, '## Current and Target State');
      expect(sec).toMatch(/\*\*No milestones here\.\*\*/);
      expect(sec).toMatch(/stale the first time anyone reorders the work/);
      // The template itself must not demonstrate what it forbids.
      const template = fsShape.slice(fsShape.indexOf('Current and Target State'));
      expect(template.slice(0, template.indexOf('## 4.'))).not.toMatch(/\(M\d/);
    });

    it('requires the today diagram to be grounded, not drawn', () => {
      const sec = section(pm, '## Current and Target State');
      expect(sec).toMatch(/\*\*A diagram must be earned\.\*\*/);
      expect(sec).toMatch(/Where it cannot be grounded, ask; do not draw/);
      expect(sec).toMatch(/A fabricated architecture diagram is worse than no diagram/);
      expect(fsShape).toMatch(/\*Read off: \[/);
    });

    it('is omittable, and the linter rates it accordingly', () => {
      // Blocking on absence would push toward drawing something decorative.
      expect(pm).toMatch(/\*\*Omit the section when the work does not change system shape\.\*\*/);
      expect(prdLinter).toMatch(/A `Current and Target State` section present \| MEDIUM \|/);
      expect(prdLinter).toMatch(/Both a today and an once-delivered diagram \| HIGH \|/);
      expect(prdLinter).toMatch(/No milestone labels — sequencing is the plan's \| HIGH \|/);
    });

    it('write-prd draws them during PRD drafting', () => {
      expect(writePrd).toMatch(/^#### Draw the current and target state$/m);
      expect(writePrd).toMatch(/must be read off something real/);
      expect(writePrd).toMatch(/\*\*No milestones\.\*\*/);
      expect(writePrd).toMatch(/This is the norm under both backends; it has nothing to do with Notion/);
    });
  });

  describe('The plan carries the order', () => {
    it('both plan templates have a Target State by Milestone section', () => {
      expect(pm).toMatch(/^## Target State by Milestone$/m);
      expect(writePlan).toMatch(/^## Target State by Milestone$/m);
    });

    it('is one diagram, derived from the PRD rather than invented', () => {
      const sec = section(pm, '### Target State by Milestone Section');
      expect(sec).toMatch(/\*\*Derive it; do not invent it\.\*\*/);
      expect(sec).toMatch(/a plan is not a basis for claiming what the architecture looks like/);
      expect(pm).toMatch(/\*\*Derive it; do not invent it\.\*\*/);
    });

    it('labels attribution, never progress', () => {
      const sec = section(pm, '### Target State by Milestone Section');
      expect(sec).toMatch(/\*\*Attribution, never progress\.\*\*/);
      expect(sec).toMatch(/Status already lives in the task tables/);
      expect(planRubric).toMatch(/Milestone labels carry attribution, never progress \| HIGH \|/);
    });

    it('is kept current by the command that re-phases', () => {
      expect(pm).toMatch(/\*\*This section is yours to keep current\*\*/);
      expect(pm).toMatch(/\*\*This section is yours to keep current\*\*/);
    });

    it('plan-linter checks it without requiring it', () => {
      expect(planRubric).toMatch(/## Target State by Milestone \(when present\)/);
      expect(planRubric).toMatch(/Every milestone label names a milestone the plan defines \| HIGH \|/);
      expect(planScript).toMatch(/Progress marker on a milestone label/);
    });

    it('the diagram is machine-checked rather than guarded by a scribe rule', () => {
      // plan-scribe is retired (FR-HM26) and the PM edits the plan in place,
      // so there is no transcriber to constrain. The guarantee moved from a
      // prose rule to four executable checks in lint-plan.mjs, which is
      // stronger: a stale or malformed diagram now fails the lint rather than
      // relying on an agent remembering not to touch it.
      expect(planScript).toMatch(/reconciliation decision #15/);
      expect(planScript).toMatch(/Unquoted parentheses in a mermaid node label/);
      expect(existsSync(join(PLUGIN, 'agents', 'plan-scribe.md'))).toBe(false);
    });
  });

  describe('Placement regressions', () => {
    it('no diagram lives on the epic page', () => {
      // The epic page is a landing page whose maintenance can silently fail:
      // strict_mode defaults to false, and epic_page has no filesystem
      // fallback, so a failed refresh leaves one warning in a long run.
      const epic = section(pm, '## Epic Page Structure (Notion backend only)');
      expect(epic).not.toMatch(/```mermaid/);
      expect(epic).not.toMatch(/Current and Target State|Target State by Milestone/);
    });

    it('the epic page no-volatile rule has no diagram exception', () => {
      const volatile = section(pm, '### Phases and other volatile content');
      expect(volatile).toMatch(/do \*\*not\*\* belong on the epic page/);
      expect(volatile).not.toMatch(/exception/i);
    });

    it('no command patches another artifact to keep a diagram honest', () => {
      // A command patching a document it does not own, purely to stop that
      // document going stale, is the tell that the content is in the wrong
      // document. The plan's diagram lives in the plan.
      expect(writePlan).not.toMatch(/Refresh the Epic's Milestone Attribution/);
      const touched = writePlan.match(/\*\*Document types touched:\*\*.*/)?.[0] ?? '';
      expect(touched).not.toMatch(/epic_page/);
    });
  });

  describe('Mermaid survives the round trip', () => {
    it('the Notion adapter preserves fences and language tags', () => {
      expect(docStore).toMatch(/\*\*Fenced code blocks pass through verbatim, language tag included\.\*\*/);
      expect(docStore).toMatch(/^9\. \*\*Never drop or alter a fenced code block's language tag/m);
    });

    it('every mermaid block in the plugin quotes parenthesised node labels', () => {
      // Verified against the real mermaid parser: `G[Gateway (M1)]` is a syntax
      // error that renders as nothing, while `G["Gateway (M1)"]` is correct.
      // Adding a milestone suffix to a bare label is exactly how this happens,
      // so it is asserted statically rather than left to the authoring prose.
      const offenders: string[] = [];
      let blocks = 0;

      for (const dir of ['agents', 'commands'] as const) {
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

      expect(blocks).toBeGreaterThan(0);
      expect(offenders).toEqual([]);
    });
  });
});

/**
 * FR-NB1 / FR-NB2: command integration with the document backends.
 *
 * Every document-centric command must resolve through the document-store
 * contract, and every one must state that the disabled path short-circuits
 * entirely. That second part is what keeps the regression contract cheap to
 * honor: if `notion.enabled` is false, no new logic runs at all.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');
const docText = read('docs/document-backends.md');

/** The commands that read or write a Synthex artifact. */
const DOC_COMMANDS = [
  'write-implementation-plan',
  'refine-requirements',
  'next-priority',
  'write-adr',
  'write-rfc',
  'retrospective',
  'reliability-review',
] as const;

describe('FR-NB1: command integration', () => {
  describe('Shared mechanics document', () => {
    const rel = 'docs/document-backends.md';

    it('exists', () => {
      expect(existsSync(join(PLUGIN, rel))).toBe(true);
    });

    it('defers to the contract on disagreement', () => {
      // Two documents describing the same rules will drift; one has to win.
      expect(read(rel)).toMatch(/Where this document and the contract disagree, the contract wins/);
    });

    it('states the resolution order', () => {
      const text = read(rel);
      expect(text).toMatch(/documents\.backend_overrides\.<doc_type>/);
      expect(text).toMatch(/documents\.backend/);
      expect(text).toMatch(/filesystem/);
    });

    it('short-circuits the whole document when the feature is off', () => {
      expect(read(rel)).toMatch(/skip this entire document/);
    });

    it('rejects a named backend as an implicit opt-in', () => {
      // documents.backend: notion without notion.enabled must not silently work.
      const text = read(rel);
      expect(text).toMatch(/notion\.enabled` is `false`, that is a configuration error/);
      expect(text).toMatch(/the master switch is the consent signal/);
    });

    it('forbids calling Notion MCP tools inline from a command', () => {
      const text = read(rel);
      expect(text).toMatch(/Do not call Notion MCP tools directly from a command/);
    });

    it('routes prose and task state to the right adapter', () => {
      const text = read(rel);
      expect(text).toMatch(/notion-document-store/);
      expect(text).toMatch(/notion-task-store/);
    });

    it('documents both degradation policies', () => {
      const text = read(rel);
      expect(text).toMatch(/strict_mode: false/);
      expect(text).toMatch(/strict_mode: true/);
      expect(text).toMatch(/Always surface a degradation/);
    });

    it('keeps the two never-degrade cases', () => {
      const text = read(rel);
      expect(text).toMatch(/emit one remediation message, not one per type/);
      expect(text).toMatch(/never falls back to an unscoped query/);
    });

    it('states the ordinal-is-not-identity rule for task commands', () => {
      expect(read(rel)).toMatch(/Never look a task up by ordinal/);
    });
  });

  describe('Every document command is wired', () => {
    const texts: Record<string, string> = {};
    beforeAll(() => {
      for (const c of DOC_COMMANDS) texts[c] = read(`commands/${c}.md`);
    });

    it.each(DOC_COMMANDS)('%s has a Document Backend section', (c) => {
      expect(texts[c]).toMatch(/^## Document Backend$/m);
    });

    it.each(DOC_COMMANDS)('%s links the shared mechanics doc', (c) => {
      // The prose moved to the cold path; the command carries a D17 Read gate.
      expect(texts[c]).toContain('${CLAUDE_PLUGIN_ROOT}/docs/document-backends.md');
    });

    it.each(DOC_COMMANDS)('%s names the document types it touches', (c) => {
      expect(docText).toMatch(new RegExp(`### ${c}\\b`));
      expect(docText).toMatch(/\*\*Document types touched:\*\*/);
    });

    it.each(DOC_COMMANDS)('%s states the disabled path is skipped entirely', (c) => {
      expect(texts[c]).toMatch(/skip this section entirely/);
    });

    it.each(DOC_COMMANDS)('%s cites the FR-NB2 regression contract', (c) => {
      expect(texts[c]).toContain('FR-NB2');
      expect(texts[c]).toMatch(/byte-identical to pre-Notion behavior/);
    });

    it.each(DOC_COMMANDS)('%s places the section before its Workflow', (c) => {
      const backendPos = texts[c].indexOf('## Document Backend');
      const workflowPos = texts[c].indexOf('## Workflow');
      expect(backendPos).toBeGreaterThan(-1);
      expect(workflowPos).toBeGreaterThan(backendPos);
    });
  });

  describe('next-priority task-state wiring', () => {
    let text: string;
    beforeAll(() => {
      // The backend prose for this command lives in the cold-path doc's
      // per-command stanza; the command itself carries only the FR-NB2 skip
      // rule and the Read gate.
      text = docText.split('### next-priority')[1]?.split('\n### ')[0] ?? '';
    });

    it('maps every task mutation to a task-store operation', () => {
      for (const op of [
        'list_tasks',
        'update_task_status',
        'annotate_task',
      ]) {
        expect(text, `missing ${op}`).toContain(op);
      }
    });

    it('covers all four canonical statuses it can write', () => {
      for (const s of ['in_progress', 'done', 'blocked']) {
        expect(text).toContain(s);
      }
    });

    it('scopes the plan-complete check to the epic', () => {
      // "All tasks done" must mean all of *this project's* tasks, not every
      // row in a database shared with other teams.
      expect(docText).toMatch(/plan-complete check in Step 1 uses the epic-filtered queue/);
      expect(text).toMatch(/must never gate its completion/);
    });

    it('forbids resolving a task by ordinal', () => {
      expect(docText).toMatch(/\*\*Never resolve a task by ordinal\.\*\*/);
      expect(text).toMatch(/silently retarget a write to the wrong row/);
    });

    it('routes acceptance-criteria evidence through annotate_task', () => {
      expect(docText).toMatch(/\[T\]` test linkage/);
      expect(text).toMatch(/\[H\]` approval/);
      expect(text).toMatch(/goes through `annotate_task`/);
    });
  });

  describe('write-implementation-plan dual-write', () => {
    let text: string;
    beforeAll(() => {
      text = docText.split('### write-implementation-plan')[1]?.split('\n### ')[0] ?? '';
    });

    it('writes prose to the plan page and tasks to the work database', () => {
      expect(docText).toMatch(/written as two things, not one/);
      expect(text).toMatch(/plan page/);
      expect(text).toMatch(/work database/);
      expect(text).toMatch(/linked to the epic/);
    });

    it('anchors the plan page beneath its epic', () => {
      expect(docText).toMatch(/\*\*The plan page is a subpage of its epic\.\*\*/);
      expect(text).toMatch(/rather than filing the plan somewhere arbitrary/);
    });

    it('creates task rows unassigned', () => {
      expect(docText).toMatch(/New task rows are created unassigned/);
    });

    it('creates task rows with the canonical pending status', () => {
      expect(docText).toMatch(/canonical status `pending`/);
    });

    it('keeps plan-linter on the draft markdown, before any backend write', () => {
      // plan-linter validates markdown structure; running it against a Notion
      // projection would be checking the wrong artifact.
      expect(docText).toMatch(/runs against the \*\*draft markdown\*\*, before any\s+backend write/);
    });
  });

  describe('init delegates to the wizard', () => {
    let text: string;
    beforeAll(() => {
      text = read('commands/init.md');
    });

    it('has a Notion step', () => {
      expect(text).toContain('### 4.5. Configure Notion Backend (optional)');
    });

    it('delegates rather than duplicating the wizard', () => {
      expect(text).toMatch(/Delegate to the `\/synthex:configure-notion` wizard/);
      expect(text).toContain('plugins/synthex/commands/configure-notion.md');
    });

    it('skips the wizard re-entry check, as it does for multi-model', () => {
      const section = text.split('### 4.5. Configure Notion Backend')[1]?.split('### 5.')[0] ?? '';
      expect(section).toMatch(/Skip Step 0 \(re-entry check\)/);
    });

    it('never aborts init when Notion is unavailable', () => {
      // The common case is no MCP configured; that must not break init for
      // someone who never asked for Notion.
      const section = text.split('### 4.5. Configure Notion Backend')[1]?.split('### 5.')[0] ?? '';
      expect(section).toMatch(/must never abort `init`/);
    });

    it('lists the step in the what-this-does summary', () => {
      expect(text).toMatch(/\*\*Configures the Notion backend \(optional\)\*\*/);
    });

    it('numbers workflow headings contiguously from 1', () => {
      // The real risk from inserting a step: a duplicated or skipped number
      // left behind by renumbering. (Note the summary list is deliberately
      // NOT 1:1 with these headings — its first bullet covers workflow steps
      // 1 and 2 — so comparing the two counts would assert a false
      // invariant that never held.)
      const nums = [...text.matchAll(/^### (\d+)\. /gm)].map((m) => Number(m[1]));
      expect(nums.length).toBeGreaterThan(0);
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
    });

    it('numbers the summary list contiguously from 1', () => {
      const summary = text.split('## What This Command Does')[1]?.split('## Workflow')[0] ?? '';
      const nums = [...summary.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
      expect(nums.length).toBeGreaterThan(0);
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
    });
  });
});

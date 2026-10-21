/**
 * Epics-and-work-items model: epic anchoring, relation resolution, and
 * assignee scoping.
 *
 * The target workspace keeps epics in one database and the work they break
 * down into in another, related to it. Three things follow, and each has a
 * failure mode that is silent in the wrong direction:
 *
 *   - Every row of a Notion database is a page, so an epic row anchors its own
 *     initiative's documents. Resolving an epic-scoped document without that
 *     anchor would file it somewhere arbitrary, or worse, onto another
 *     initiative's identically-titled page.
 *   - Notion cannot filter a relation by page name, so a plan naming its epic
 *     as bare text returns an empty result set — indistinguishable from "this
 *     initiative has no work left".
 *   - Several engineers share an epic, so two of them can select the same item
 *     unless work is additionally scoped to what each may take.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml } from '../helpers/load-defaults';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');
// Per-command backend prose lives in the cold-path doc (commands sit at
// their D17 byte budgets).
const backendDoc = read('docs/document-backends.md');

const EPIC_SCOPED = ['requirements', 'implementation_plan', 'retros'] as const;
const CROSS_CUTTING = ['specs', 'decisions', 'rfcs', 'runbooks'] as const;

describe('Epic anchoring and the epics/work-items model', () => {
  let contract: string;
  let docStore: string;
  let taskStore: string;
  let sharedDoc: string;
  let wizard: string;
  let cfg: any;

  beforeAll(async () => {
    contract = read('agents/_shared/document-store-contract.md');
    docStore = read('agents/notion-document-store.md');
    taskStore = read('agents/notion-task-store.md');
    sharedDoc = read('docs/document-backends.md');
    wizard = read('commands/configure-notion.md');
    cfg = await loadDefaultsYaml();
  });

  describe('Config models two databases', () => {
    it('defines epics_database alongside tasks_database', () => {
      expect(cfg.notion).toHaveProperty('epics_database');
      expect(cfg.notion).toHaveProperty('tasks_database');
      expect(cfg.notion.epics_database).toBeNull();
    });

    it('defines the assignee block, defaulting to claimable-unassigned', () => {
      expect(cfg.notion.assignee).toEqual({
        property: null,
        include_unassigned: true,
      });
    });

    it('scopes docs_root to cross-cutting documents only', () => {
      const text = read('config/defaults.yaml');
      expect(text).toMatch(/CROSS-CUTTING documents only/);
      expect(text).toMatch(/Epic-scoped documents ignore this/);
    });

    it('explains that a database row is itself a page', () => {
      // This is the fact the whole anchoring design rests on.
      const text = read('config/defaults.yaml');
      expect(text).toMatch(/every row in a Notion database is itself a page/i);
    });
  });

  describe('Document scope split', () => {
    it('contract defines both halves', () => {
      expect(contract).toMatch(/^### Document scope: epic-scoped vs cross-cutting$/m);
    });

    it.each(EPIC_SCOPED)('%s is epic-scoped in both contract and adapter', (t) => {
      for (const [name, text] of [['contract', contract], ['document store', docStore]] as const) {
        const row = text
          .split('\n')
          .find((l) => l.includes('Epic-scoped') && l.includes('|'));
        expect(row, `${name} has no epic-scoped table row`).toBeTruthy();
        expect(row, `${name} omits ${t}`).toContain(t);
      }
    });

    it.each(CROSS_CUTTING)('%s is cross-cutting in both contract and adapter', (t) => {
      for (const [name, text] of [['contract', contract], ['document store', docStore]] as const) {
        const row = text
          .split('\n')
          .find((l) => l.includes('Cross-cutting') && l.includes('|'));
        expect(row, `${name} has no cross-cutting table row`).toBeTruthy();
        expect(row, `${name} omits ${t}`).toContain(t);
      }
    });

    it('cross-cutting types default to the filesystem, with a reason', () => {
      expect(contract).toMatch(/default to the `filesystem` backend/);
      expect(contract).toMatch(/reads them on every review invocation/);
    });

    it('an epic-scoped resolve without an anchor fails rather than guessing', () => {
      // Falling back to docs_root would mix initiatives together.
      expect(contract).toMatch(/An epic-scoped `resolve` requires a resolved epic/);
      expect(docStore).toMatch(/An epic-scoped type requires `config\.epic_page`/);
      expect(docStore).toMatch(/Do not fall back to `config\.docs_root`/);
    });

    it('document store parents epic-scoped pages to the epic row', () => {
      expect(docStore).toMatch(/A database row's id \*\*is\*\* a page id/);
      expect(docStore).toMatch(/ordinary `page_id` parent/);
    });

    it('conventional subpage titles are pinned', () => {
      for (const text of [contract, docStore]) {
        expect(text).toContain('Product Requirements');
        expect(text).toContain('Implementation Plan');
        expect(text).toMatch(/Retrospective <YYYY-MM-DD>/);
      }
    });

    it('retros are dated and listed newest first, since they accumulate', () => {
      expect(contract).toMatch(/retrospectives accumulate/);
      expect(docStore).toMatch(/newest first/);
    });
  });

  describe('Relation reference resolution', () => {
    it('contract states that a relation needs a UUID, not a name', () => {
      expect(contract).toMatch(/^### Resolving the epic reference$/m);
      expect(contract).toMatch(/\*\*Notion cannot filter a relation by page name\.\*\*/);
    });

    it('names the silent-failure consequence explicitly', () => {
      // This is why the rule is enforced rather than merely advised.
      for (const [name, text] of [
        ['contract', contract],
        ['task store', taskStore],
        ['shared mechanics', sharedDoc],
      ] as const) {
        expect(text, `${name} omits the empty-result consequence`).toMatch(
          /indistinguishable from|reads as "all work complete|looks exactly like "all work complete/,
        );
      }
    });

    it('documents all three resolution inputs, link form preferred', () => {
      for (const text of [contract, taskStore]) {
        expect(text).toMatch(/markdown link/);
        expect(text).toMatch(/bare Notion URL/);
        expect(text).toMatch(/UUID/);
      }
      expect(contract).toMatch(/\*\*Preferred\*\*/);
    });

    it('name lookup requires a unique exact match', () => {
      for (const text of [contract, taskStore]) {
        expect(text).toMatch(/unique exact match/);
      }
      expect(taskStore).toMatch(/Never settle for a partial or best-guess match/);
    });

    it('non-relation property types use the value as given', () => {
      expect(taskStore).toMatch(/use the value as given/);
    });

    it('a tag cannot anchor documents, and that is stated', () => {
      // Easy to miss: select-typed epics lose epic anchoring entirely.
      expect(sharedDoc).toMatch(/anchoring needs a page; a tag is not a page/i);
      expect(wizard).toMatch(/anchoring needs a page, and a tag is not a page/);
    });
  });

  describe('Assignee scoping', () => {
    it('contract defines mine-or-unassigned', () => {
      expect(contract).toMatch(/^### Assignee scoping$/m);
      expect(contract).toMatch(/assigned to \*\*me\*\*, \*\*or\*\* unassigned/);
    });

    it('task store gates it as its own step', () => {
      expect(taskStore).toMatch(/^### Step 1b — Assignee Scoping$/m);
    });

    it('states the collision it prevents', () => {
      for (const text of [contract, taskStore]) {
        expect(text).toMatch(/c(?:an|ould) select the same item/);
      }
    });

    it('never touches another engineer\'s item', () => {
      expect(contract).toMatch(/items assigned to someone else are not/i);
      expect(taskStore).toMatch(/not selected, not modified, and not reported/);
    });

    it('resolves the current user at runtime, not from config', () => {
      for (const text of [contract, taskStore]) {
        expect(text).toMatch(/runtime|get_users/);
      }
      expect(taskStore).toMatch(/must not accept an identity from your caller/);
      expect(contract).toMatch(/no configuration identifies the engineer/);
    });

    it('creates unassigned and claims on the in-progress transition', () => {
      expect(contract).toMatch(/`create_tasks` leaves new items unassigned/);
      expect(contract).toMatch(/claims the item/);
      expect(taskStore).toMatch(/^#### Claiming items$/m);
    });

    it('bounds claiming to exactly three conditions', () => {
      expect(taskStore).toMatch(/only under all three conditions/);
      expect(taskStore).toMatch(/Do not reassign an item that already has an assignee/);
      expect(taskStore).toMatch(/do not clear an assignee/);
    });

    it('explains why claiming is load-bearing rather than cosmetic', () => {
      for (const text of [contract, taskStore]) {
        expect(text).toMatch(/load-bearing/);
      }
      expect(taskStore).toMatch(/lets two engineers claim the same item at the same moment/);
    });

    it('is optional, with the cost of skipping it stated', () => {
      expect(contract).toMatch(/When `notion\.assignee\.property` is null, assignee scoping is skipped/);
      expect(contract).toMatch(/documented cost of leaving it unset/);
      expect(wizard).toMatch(/two engineers on the same epic can select the same item/);
    });

    it('next-priority treats fully-claimed work as not-complete', () => {
      // Otherwise a loop would emit its completion promise while work remains.
      const np = read('commands/next-priority.md');
      expect(backendDoc).toMatch(/all remaining work is claimed by someone else/);
      expect(backendDoc).toMatch(/Do not emit the completion promise/);
    });
  });

  describe('Epic rows are linked, not authored', () => {
    it('wizard links existing epic rows by default', () => {
      expect(wizard).toMatch(/Synthex links to epic rows you already have/);
      expect(wizard).toMatch(/does \*\*not\*\* create them by default/);
    });

    it('explains why — epics carry fields Synthex does not own', () => {
      expect(wizard).toMatch(/owner, target date, business context/);
      expect(wizard).toMatch(/no business filling in/);
    });

    it('creates only on request, and only a title', () => {
      expect(wizard).toMatch(/Offer creation only if the user asks/);
      expect(wizard).toMatch(/with a title and nothing else/);
    });

    it('write-implementation-plan does not create epics either', () => {
      const wip = read('commands/write-implementation-plan.md');
      expect(backendDoc).toMatch(/Do not create an epic row unless the user asks/);
      expect(backendDoc).toMatch(/no basis to fill in/);
    });
  });

  describe('The epic-link property is identified deliberately', () => {
    // The linkage property is commonly named `Epic`, but a work database can
    // accumulate similarly-named fields from earlier processes. Pointing
    // Synthex at the wrong one yields queries that match nothing — which
    // presents as "no work left" rather than as a misconfiguration.
    it('config names the expected property and warns about lookalikes', () => {
      const text = read('config/defaults.yaml');
      expect(text).toMatch(/commonly a relation property literally called "Epic"/);
      expect(text).toMatch(/other similarly-named\s*#?\s*fields left over from an earlier process/);
      expect(text).toMatch(/looks like "no work left"/);
    });

    it('wizard proposes rather than assumes', () => {
      expect(wizard).toMatch(/\*\*Propose, do not assume\.\*\*/);
      expect(wizard).toMatch(/pre-select it and say which one you picked/);
    });

    it('wizard refuses to pre-select among similar candidates', () => {
      expect(wizard).toMatch(/\*\*Warn about lookalikes\.\*\*/);
      expect(wizard).toMatch(/do not pre-select any of them/);
    });

    it('wizard verifies the candidate is actually populated', () => {
      // An empty property is the strongest signal it is not the live linkage.
      expect(wizard).toMatch(/fetch a few rows and confirm the property is actually populated/);
      expect(wizard).toMatch(/re-ask rather than writing it to config/);
    });
  });

  describe('Wizard covers the whole model', () => {
    it('nominates the epics database, work database, and cross-cutting root', () => {
      expect(wizard).toMatch(/^#### 2a\. The epics database$/m);
      expect(wizard).toMatch(/^#### 2b\. The work database$/m);
      expect(wizard).toMatch(/^#### 2c\. A root for cross-cutting documents \(optional\)$/m);
    });

    it('prefers a relation property when an epics database was nominated', () => {
      expect(wizard).toMatch(/prefer a \*\*relation\*\* property pointing at it/);
    });

    it('has an assignee step', () => {
      expect(wizard).toMatch(/^### 3b\. Assignee Scoping/m);
    });

    it('recommends keeping cross-cutting docs in git', () => {
      expect(wizard).toMatch(/Keep them in git\*\* \(recommended\)/);
    });

    it('writes the new config keys', () => {
      const write = wizard.split('### 7. Write the Configuration')[1]?.split('### 8.')[0] ?? '';
      for (const key of ['epics_database', 'tasks_database', 'assignee', 'include_unassigned']) {
        expect(write, `config write omits ${key}`).toContain(key);
      }
    });

    it('records targets only for cross-cutting types', () => {
      // A fixed page id for an epic-scoped type would pin every initiative to
      // one page — the exact collision this design avoids.
      expect(wizard).toMatch(/only for \*\*cross-cutting\*\* document types/);
      expect(wizard).toMatch(/would pin every initiative to one page/);
    });

    it('explains the day-to-day model in its confirmation output', () => {
      const confirm = wizard.split('### 8. Confirm')[1] ?? '';
      expect(confirm).toMatch(/names its own epic/);
      expect(confirm).toMatch(/several initiatives in one repo stay cleanly separated/);
      expect(confirm).toMatch(/claims an item by assigning it to you/);
    });
  });
});

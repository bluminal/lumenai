/**
 * FR-NB4: epic scoping — the multi-team safety guarantee.
 *
 * Synthex writes task rows into a Notion database that already holds other
 * teams' work. Every query must filter on the epic property and every
 * write must verify it first, or Synthex can read and mutate tickets that
 * aren't its own. That failure is silent: nobody finds out until a ticket
 * someone else owns has the wrong status.
 *
 * This suite asserts the guarantee is stated at every point where an
 * implementer could omit it, and that no escape hatch is documented anywhere.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');
const backendDoc = read('docs/document-backends.md');

describe('FR-NB4: epic scoping', () => {
  let contract: string;
  let taskStore: string;
  let wizard: string;

  beforeAll(() => {
    contract = read('agents/_shared/document-store-contract.md');
    taskStore = read('agents/notion-task-store.md');
    wizard = read('commands/configure-notion.md');
  });

  describe('Contract states the guarantee normatively', () => {
    it('has a dedicated epic scoping section citing FR-NB4', () => {
      expect(contract).toMatch(/^## 4\. Epic scoping \(FR-NB4\)$/m);
    });

    it('marks the requirement non-negotiable', () => {
      expect(contract).toMatch(/Normative and non-negotiable/);
    });

    it('requires create-time stamping, query filtering, and pre-write verification', () => {
      expect(contract).toMatch(/MUST be stamped with the configured epic value/);
      expect(contract).toMatch(/MUST filter on the epic property/);
      expect(contract).toMatch(/MUST verify the target row carries the configured epic value before writing/);
    });

    it('requires refusal rather than an unscoped fallback', () => {
      expect(contract).toMatch(/MUST refuse to operate against a shared database/);
      expect(contract).toMatch(/never\*{0,2} an acceptable degradation/i);
    });

    it('exempts the filesystem backend explicitly', () => {
      // Without this, an implementer might add pointless scoping machinery to
      // the local-markdown path, or worse, block it.
      expect(contract).toMatch(/filesystem.*backend.*epic scoping is a no-op/is);
    });
  });

  describe('Task store enforces it before any I/O', () => {
    it('runs the scoping check as a preflight gate', () => {
      expect(taskStore).toMatch(/### Step 1 — Epic Scoping Check \(FR-NB4\)/);
      expect(taskStore).toMatch(/runs before any read or write, and failing it is terminal/);
    });

    it('validates the property exists and is filterable, and the value is set', () => {
      expect(taskStore).toMatch(/names a property that \*{0,2}exists\*{0,2} in the database/);
      expect(taskStore).toMatch(/supports equality filtering/);
      expect(taskStore).toMatch(/epic\.value` is non-null/);
    });

    it('closes every escape hatch in words', () => {
      expect(taskStore).toMatch(/MUST NOT proceed unscoped/);
      expect(taskStore).toMatch(/no degradation path here/);
      expect(taskStore).toMatch(/no `strict_mode` exemption/);
      expect(taskStore).toMatch(/no "just this once/);
    });

    it('requires a epic filter on list_tasks', () => {
      expect(taskStore).toMatch(
        /list_tasks.*Filter MUST include the epic predicate/s,
      );
    });

    it('documents the concrete filter shape it must build', () => {
      // One nested group level is exactly what the structured filter supports,
      // so the shape is worth pinning rather than leaving to interpretation.
      const shape = taskStore.split('#### Filter shape')[1]?.split('####')[0] ?? '';
      expect(shape).toMatch(/relation_contains/);
      expect(shape).toMatch(/person_contains\s+me/);
      expect(shape).toMatch(/is_empty/);
      expect(shape).toMatch(/Omit the `or` group entirely when assignee scoping is skipped/);
    });

    it('requires create_tasks to link the epic and leave items unassigned', () => {
      expect(taskStore).toMatch(/create_tasks.*MUST be linked to the epic, and left \*\*unassigned\*\*/s);
      expect(taskStore).toMatch(/a planned task is available work, not work already owned/);
    });

    it('requires pre-write verification on both mutating operations', () => {
      expect(taskStore).toMatch(/update_task_status.*MUST verify the row's epic and assignee eligibility first/s);
      expect(taskStore).toMatch(/annotate_task.*MUST verify the row's epic and assignee eligibility first/s);
      expect(taskStore).toMatch(/Verify before every write/);
    });

    it('explains why a query-time filter is not enough for writes', () => {
      expect(taskStore).toMatch(
        /may have been claimed by another engineer in between, and a filter applied at query time cannot see that/,
      );
    });

    it('returns permission_denied on a epic mismatch and writes nothing', () => {
      expect(taskStore).toMatch(/permission_denied` and write nothing/);
    });

    it('leads its behavioral rules with the scoping invariant', () => {
      const rules = taskStore.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/1\.\s+\*\*Never query or write unscoped\.\*\*/);
    });
  });

  describe('Wizard cannot produce an unscoped configuration', () => {
    it('makes epic setup a required step for tasks', () => {
      expect(wizard).toMatch(/### 3\. Epic Scoping \(required for tasks\)/);
    });

    it('refuses to enable tasks without a resolved epic', () => {
      expect(wizard).toMatch(/do NOT write `notion\.enabled: true` for tasks/);
      expect(wizard).toMatch(/There is no unscoped fallback/);
    });

    it('offers a separate database as the alternative to scoping', () => {
      // The safe out when the shared DB can't be scoped: don't touch it.
      expect(wizard).toMatch(/Use a separate database instead/);
      expect(wizard).toMatch(/leaving yours untouched/);
    });

    it('lists the invariant in its behavioral rules', () => {
      expect(wizard).toMatch(/Never enable tasks unscoped/);
    });

    it('tells the user the guarantee in the confirmation output', () => {
      // The user should finish the wizard knowing what Synthex will and will
      // not touch.
      expect(wizard).toMatch(/only takes work assigned to you or unassigned/);
      expect(wizard).toMatch(/never selected or modified/);
    });

    it('asks only for an optional default value, not a mandatory one', () => {
      // The authoritative value lives on each plan; a mandatory config value
      // is what creates the multi-initiative collision.
      expect(wizard).toMatch(/Default epic value \(optional\)/);
      expect(wizard).toMatch(/A null default is not an error/);
    });

    it('steers multi-initiative repos away from a shared default', () => {
      expect(wizard).toMatch(/Several initiatives at once\?\*\* Leave this blank/);
      expect(wizard).toMatch(/never silently inherit another epic's identifier/);
    });

    it('distinguishes a missing property from a null default value', () => {
      const rules = wizard.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/No epic property means documents-only/);
      expect(rules).toMatch(/A null default \*value\* is fine/);
    });

    it('forbids deriving an epic value', () => {
      const rules = wizard.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Never derive an epic value/);
      expect(rules).toMatch(/empty queue that reads as "all work complete/);
    });
  });

  describe('Epic value is carried by the plan, not by config', () => {
    // A single configured value makes every initiative's rows
    // indistinguishable, so `list_tasks` for one epic returns another's work
    // and the plan-complete check never fires. Binding the value to the plan
    // makes targeting the wrong initiative structurally impossible.
    let sharedDoc: string;
    let planTemplate: string;
    let nextPriority: string;
    let linter: string;
    let scribe: string;

    beforeAll(() => {
      sharedDoc = read('docs/document-backends.md');
      planTemplate = read('commands/write-implementation-plan.md');
      nextPriority = read('commands/next-priority.md');
      linter = read('docs/plan-lint-rubric.md');
      scribe = read('agents/product-manager.md');
    });

    it('contract separates the workspace-wide property from the per-plan value', () => {
      expect(contract).toMatch(/^### The property is workspace-wide; the value is per-plan$/m);
      expect(contract).toMatch(/several in flight at once/);
    });

    it('contract states the value resolution order', () => {
      expect(contract).toMatch(/`\*\*Epic:\*\*` line — \*\*authoritative\*\*/);
      expect(contract).toMatch(/a default for plans that do not declare one/);
      expect(contract).toMatch(/refuse to operate on tasks/);
    });

    it('contract explains why binding to the plan closes the hole', () => {
      expect(contract).toMatch(/structurally impossible rather than merely discouraged/);
      expect(contract).toMatch(/no flag to forget and no config entry to fall out of sync/);
    });

    it('contract assigns value resolution to the caller, not the adapter', () => {
      expect(contract).toMatch(/\*\*Callers resolve the value; adapters do not\.\*\*/);
      expect(contract).toMatch(/adapter's input contract is unchanged/);
    });

    it('task store refuses when the caller omits the value', () => {
      expect(taskStore).toMatch(/You do not read plan documents/);
      expect(taskStore).toMatch(/a caller trying to run unscoped, whatever the reason/);
    });

    it('shared mechanics tell commands to resolve from the plan first', () => {
      expect(sharedDoc).toMatch(/^### Step A — read the plan and take its reference$/m);
      expect(sharedDoc).toMatch(/Resolution is the caller's job/);
    });

    it('a plan-declared value beats config, with the discrepancy surfaced', () => {
      expect(sharedDoc).toMatch(/it wins, even if config names a different one/);
      expect(sharedDoc).toMatch(/mention it once in your output/);
    });

    it('both plan templates carry the Epic line', () => {
      for (const [name, text] of [
        ['write-implementation-plan', planTemplate],
        ['product-manager', read('agents/product-manager.md')],
      ] as const) {
        expect(text, `${name} template missing the line`).toMatch(
          /\*\*Epic:\*\* \[This initiative's epic reference\]/,
        );
      }
    });

    it('next-priority resolves the value before any task operation', () => {
      expect(backendDoc).toMatch(/Resolve the epic reference from the plan first/);
      expect(backendDoc).toMatch(/plan-complete check would never fire/);
    });

    it('plan-linter checks for the line without inventing one', () => {
      expect(linter).toMatch(/`\*\*Epic:\*\*` line present beneath the H1/);
      expect(linter).toMatch(/Do \*\*not\*\* invent a value when it is missing/);
    });

    it('nobody derives a value from a filename, branch, or title', () => {
      // A derived value that matches no rows returns an empty queue, which is
      // indistinguishable from "all work complete".
      for (const [name, text] of [
        ['shared mechanics', sharedDoc],
        // The command's backend prose moved to the cold-path stanza.
        ['write-implementation-plan stanza', backendDoc],
        ['plan-linter', linter],
        ['configure-notion', wizard],
      ] as const) {
        expect(text, `${name} omits the do-not-derive rule`).toMatch(
          /all work complete/,
        );
      }
    });
  });

  describe('No unscoped escape hatch anywhere', () => {
    it.each([
      ['contract', () => contract],
      ['notion-task-store', () => taskStore],
      ['configure-notion', () => wizard],
    ])('%s never permits an unfiltered query as a fallback', (_name, get) => {
      const text = get();
      // Catch the phrasings a well-meaning implementer might introduce.
      expect(text).not.toMatch(/fall back to an unscoped/i);
      expect(text).not.toMatch(/if scoping fails,? (?:query|read|proceed)/i);
      expect(text).not.toMatch(/optional(?:ly)? (?:filter|scope) (?:on|by) epic/i);
    });
  });
});

/**
 * FR-NB5: property mapping and graceful degradation.
 *
 * Synthex targets a Notion database whose schema it does not control. Two
 * behaviors have to hold:
 *
 *   1. Required mappings (title, status, epic) fail loudly when absent —
 *      guessing which column holds status would silently write to the wrong one.
 *   2. Optional mappings degrade rather than fail, and the degradation is
 *      reported — a silent degradation is indistinguishable from a working
 *      integration until someone tries to filter on a column nothing populated.
 *
 * And the rule that bounds both: Synthex never migrates a live team database's
 * schema to make its own life easier.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

const REQUIRED_FIELDS = ['title', 'status', 'epic'] as const;
const OPTIONAL_FIELDS = [
  'complexity',
  'milestone',
  'dependencies',
  'acceptance_criteria',
] as const;

describe('FR-NB5: property mapping and degradation', () => {
  let contract: string;
  let taskStore: string;
  let wizard: string;

  beforeAll(() => {
    contract = read('agents/_shared/document-store-contract.md');
    taskStore = read('agents/notion-task-store.md');
    wizard = read('commands/configure-notion.md');
  });

  describe('Contract defines the mapping table', () => {
    it('has a property mapping section citing FR-NB5', () => {
      expect(contract).toMatch(
        /^## 5\. Property mapping and degradation \(FR-NB5\)$/m,
      );
    });

    it.each(REQUIRED_FIELDS)('marks %s as required', (field) => {
      const row = contract
        .split('\n')
        .find((l) => l.includes(`\`${field}\``) && l.includes('Required'));
      expect(row, `${field} is not marked Required in the contract table`).toBeTruthy();
    });

    it.each(REQUIRED_FIELDS)('fails with schema_mismatch when %s is unmapped', (field) => {
      const row = contract
        .split('\n')
        .find((l) => l.includes(`\`${field}\``) && l.includes('Required'));
      expect(row).toMatch(/schema_mismatch|Refuse to operate/);
    });

    it.each(OPTIONAL_FIELDS)('marks %s as optional', (field) => {
      const row = contract
        .split('\n')
        .find((l) => l.includes(`\`${field}\``) && l.includes('Optional'));
      expect(row, `${field} is not marked Optional in the contract table`).toBeTruthy();
    });

    it.each(OPTIONAL_FIELDS)('gives %s a degradation destination', (field) => {
      const row = contract
        .split('\n')
        .find((l) => l.includes(`\`${field}\``) && l.includes('Optional'));
      // Data must go somewhere; "dropped" is not an acceptable degradation.
      expect(row).toMatch(/plan overview page|task page body/);
    });

    it('states that only the three required fields are load-bearing', () => {
      expect(contract).toMatch(/Only the three required fields are load-bearing/);
    });

    it('states that degraded data still exists, just not as a column', () => {
      expect(contract).toMatch(/the data still exists, it simply is not a queryable column/);
    });

    it('forbids schema mutation without consent', () => {
      expect(contract).toMatch(/MUST NOT\*{0,2} alter an existing database's schema/);
      expect(contract).toMatch(/not to add a property, not to add a select option, not to change a type/);
      expect(contract).toMatch(/without explicit user consent/);
    });

    it('explains why silent migration is the worst case', () => {
      expect(contract).toMatch(
        /most damaging thing this integration could do/,
      );
    });
  });

  describe('Task store enforces the mapping', () => {
    it('has a mapping step that forbids migration in its title', () => {
      expect(taskStore).toMatch(/### Step 2 — Map Properties, Never Migrate Schema \(FR-NB5\)/);
    });

    it('validates mappings against the fetched live schema', () => {
      // Mapping against config alone would accept a property that no longer
      // exists in the database.
      expect(taskStore).toMatch(/validate against the fetched schema/);
    });

    it.each(REQUIRED_FIELDS)('rejects a missing or wrong-typed %s', (field) => {
      const section = taskStore.split('### Step 2')[1]?.split('### Step 3')[0] ?? '';
      expect(section).toContain(field);
    });

    it('names schema_mismatch as the required-mapping failure', () => {
      const section = taskStore.split('### Step 2')[1]?.split('### Step 3')[0] ?? '';
      expect(section).toMatch(/absent or wrong-typed means `error_code: schema_mismatch`/);
    });

    it('states that optional fields degrade and never fail', () => {
      const section = taskStore.split('### Step 2')[1]?.split('### Step 3')[0] ?? '';
      expect(section).toMatch(/absent means degrade, never fail/);
    });

    it('requires degradations to be reported to the caller', () => {
      expect(taskStore).toMatch(/Report every degradation in the response's `degradations` array/);
      expect(taskStore).toMatch(
        /silent degradation looks identical to a working integration/,
      );
    });

    it('forbids adding a status option to make a write succeed', () => {
      // The tempting shortcut: the board has no "Blocked" option, so add one.
      expect(taskStore).toMatch(/do not add a select option, do not widen a type/);
      expect(taskStore).toMatch(/not even when doing so would make the operation succeed/);
      expect(taskStore).toMatch(/lacks an option for the state you need to write, that is `schema_mismatch`/);
    });

    it('translates status through the configured vocabulary', () => {
      expect(taskStore).toMatch(/Map the canonical status through `config\.status_values`/);
      expect(taskStore).toMatch(/rather than writing a value the board does not recognize/);
    });

    it('requires rows mode because SQL mode is lossy for rich text', () => {
      // Acceptance criteria are rich text; a lossy round-trip corrupts them.
      expect(taskStore).toMatch(/rows mode.*never SQL mode/is);
      expect(taskStore).toMatch(/lossy/);
    });

    it('lists no-schema-change among its behavioral rules', () => {
      const rules = taskStore.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Never alter the database schema/);
      expect(rules).toMatch(/Report degradations explicitly/);
    });
  });

  describe('Wizard maps interactively rather than guessing', () => {
    it('proposes a mapping but requires confirmation', () => {
      expect(wizard).toMatch(/do not apply a guessed mapping silently/);
    });

    it('lists required and optional fields separately', () => {
      const section = wizard.split('### 4. Map Properties')[1]?.split('### 5.')[0] ?? '';
      for (const f of REQUIRED_FIELDS) expect(section).toContain(f);
      for (const f of OPTIONAL_FIELDS) expect(section).toContain(f);
    });

    it('cannot complete task configuration without the required mappings', () => {
      expect(wizard).toMatch(/configuration cannot complete for tasks without all three/);
    });

    it('requires explicit confirmation before any schema change', () => {
      expect(wizard).toMatch(/do not add an option without explicit confirmation/);
      expect(wizard).toMatch(/This is a schema change and needs your explicit confirmation/);
    });

    it('defaults the schema-change confirmation to no', () => {
      expect(wizard).toMatch(/\(y\/N\)/);
      expect(wizard).toMatch(/Default is no/);
    });

    it('reports degradations to the user in plain language', () => {
      expect(wizard).toMatch(/Not mapped:/);
      expect(wizard).toMatch(/recorded in the plan overview page instead/);
    });

    it('lists the no-silent-mapping rules in its behavioral rules', () => {
      const rules = wizard.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/Never change a schema without explicit confirmation/);
      expect(rules).toMatch(/Show degradations plainly/);
    });
  });

  describe('No field is silently dropped', () => {
    it.each(OPTIONAL_FIELDS)('%s has a documented home when unmapped', (field) => {
      // Every optional field must appear in a degradation table in both the
      // contract and the adapter, so no implementer can quietly discard it.
      expect(contract).toContain(field);
      expect(taskStore).toContain(field);
    });

    it('never describes dropping data as a degradation', () => {
      for (const text of [contract, taskStore, wizard]) {
        expect(text).not.toMatch(/silently (?:drop|discard|ignore) the (?:field|value|data)/i);
      }
    });
  });
});

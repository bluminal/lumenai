/**
 * FR-NB7: backend awareness in plan-scribe and product-manager.
 *
 * Neither agent performs storage I/O — both work on document content. But both
 * sit next to the feature's sharpest hazard: plan-scribe renumbers task
 * ordinals, and the product-manager references documents by path. Under the
 * Notion backend, an ordinal is a display position and a path may not exist at
 * all, so both need to say so at the point of use.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENTS = join(import.meta.dirname, '..', '..', 'plugins', 'synthex', 'agents');
const read = (name: string) => readFileSync(join(AGENTS, name), 'utf8');

describe('FR-NB7: in-place plan editing backend awareness', () => {
  let text: string;
  let contract: string;
  beforeAll(() => {
    text = read('product-manager.md');
    contract = read('_shared/document-store-contract.md');
  });

  it('states that storage belongs to the invoking command', () => {
    expect(text).toMatch(/the invoking command resolves and performs the storage/);
  });

  it('states it never performs storage I/O itself', () => {
    expect(text).toMatch(/Do not read or write Notion yourself/);
  });

  it('keeps renumbering as an instruction', () => {
    // The fix was never "stop renumbering" -- dependency references in the
    // prose still have to stay valid.
    expect(text).toMatch(/\*\*Renumbering rule:\*\*/);
    expect(text).toMatch(/every cross-reference/);
  });

  it('the contract, not the agent, is what stops an ordinal becoming an identity', () => {
    // plan-scribe is retired (FR-HM26) and the PM edits the plan in place, so
    // two of the scribe's three safety rules -- preserve links, report
    // structural changes -- have no upstream successor. That is survivable
    // only because identity never depended on them: the task store resolves a
    // row by its opaque task_ref, so a renumber cannot retarget a write.
    expect(contract).toMatch(/`ordinal` is \*\*display-only\*\*/);
    expect(contract).toMatch(/MUST NOT treat a renumber as re-identifying a task/);
    expect(existsSync(`${AGENTS}/plan-scribe.md`)).toBe(false);
  });
});

describe('FR-NB7: product-manager backend awareness', () => {
  let text: string;
  beforeAll(() => {
    text = read('product-manager.md');
  });

  it('frames the document table as filesystem-backend defaults', () => {
    expect(text).toMatch(/^### Where these documents actually live$/m);
    expect(text).toMatch(/defaults for the `filesystem` backend/);
  });

  it('links the contract', () => {
    expect(text).toContain('_shared/document-store-contract.md');
  });

  it('keeps the PM out of storage', () => {
    expect(text).toMatch(/the invoking command resolves and performs the storage/);
    expect(text).toMatch(/Do not read or write Notion yourself/);
  });

  it('warns that a named path may not exist', () => {
    expect(text).toMatch(/do not assume a path exists just because this table names one/);
  });

  it('asks for documents to be referenced by role, not path', () => {
    expect(text).toMatch(/Refer to documents by role, not by path/);
  });

  it('explains the prose/rows split without making it the PM\'s job', () => {
    expect(text).toMatch(/the document is split/);
    expect(text).toMatch(/the command splits it/);
    expect(text).toMatch(/Keep the plan self-contained/);
  });

  // Upstream retired plan-scribe and kept only ONE of its three safety rules:
  // renumbering. "Preserve links" and "report structural changes" have no
  // upstream equivalent now that the PM edits the plan in place. The task
  // store therefore cannot rely on the plan to report a structural change,
  // which is why the contract makes task_ref -- not the ordinal -- identity.
  it('keeps the renumbering rule the Product Manager now owns', () => {
    expect(text).toMatch(/\*\*Renumbering rule:\*\*/);
    expect(text).toMatch(/updates? every cross-reference/);
  });

  it('the contract does not depend on ordinals surviving a renumber', () => {
    const contract = read('_shared/document-store-contract.md');
    expect(contract).toMatch(/`ordinal` is \*\*display-only\*\*/);
    expect(contract).toMatch(/MUST NOT treat a renumber as re-identifying a task/);
  });
});

describe('Consistency across the agents that touch ordinals', () => {
  it('product-manager and the contract agree ordinals are not identity', () => {
    const contract = readFileSync(join(AGENTS, '_shared', 'document-store-contract.md'), 'utf8');
    for (const [name, text] of [
      ['contract', contract],
      ['product-manager', read('product-manager.md')],
    ] as const) {
      // The contract speaks of ordinals; product-manager speaks of renumbering
      // and cross-references. Both must at least speak of renumbering, which
      // is the operation that would break identity if it implied it.
      expect(text, `${name} does not mention renumbering`).toMatch(/renumber/i);
    }
  });
});

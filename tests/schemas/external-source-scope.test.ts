/**
 * Scope refusal (contract §4): a task adapter refuses to read or write a
 * shared database when the scope filter is missing or a placeholder in it is
 * unresolved. This suite tests the rule itself (resolveScopeFilter) and that
 * the contract and the Notion task store state it the same way.
 *
 * Cost: $0 (no LLM calls)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveScopeFilter, validateDocumentStoreEnvelope } from './document-store-envelope';

const AGENTS = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');
const read = (rel: string) => readFileSync(join(AGENTS, rel), 'utf8');
const contract = read('_shared/document-store-contract.md');
const taskStore = read('notion-task-store.md');

const clause = (value: string) => ({ property: 'Planning page', operator: 'relation_contains', value });

describe('resolveScopeFilter: refusals', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', []],
    ['not a list', { property: 'x' }],
  ])('refuses a %s filter', (_label, filter) => {
    const r = resolveScopeFilter(filter, 'https://example.test/set');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_code).toBe('scope_missing');
  });

  it('refuses {document_set} when no document set is configured', () => {
    for (const set of [undefined, null, '']) {
      const r = resolveScopeFilter([clause('{document_set}')], set);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error_code).toBe('scope_missing');
    }
  });

  it('refuses any other unresolved placeholder', () => {
    const r = resolveScopeFilter([clause('{team}')], 'https://example.test/set');
    expect(r.ok).toBe(false);
  });

  it('refuses a malformed clause', () => {
    const r = resolveScopeFilter([{ property: 'Team', operator: 'enum_is' }], null);
    expect(r.ok).toBe(false);
  });

  it('a refusal is a valid failed envelope', () => {
    const r = resolveScopeFilter([], null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const envelope = {
        status: 'failed',
        error_code: r.error_code,
        error_message: r.error_message,
        backend: 'notion',
        operation: 'list_tasks',
        doc_type: 'implementation_plan',
        result: {},
      };
      expect(validateDocumentStoreEnvelope(envelope).errors).toEqual([]);
    }
  });
});

describe('resolveScopeFilter: resolution', () => {
  it('substitutes the per-developer document set', () => {
    const r = resolveScopeFilter([clause('{document_set}')], 'https://example.test/set');
    expect(r).toEqual({ ok: true, filter: [clause('https://example.test/set')] });
  });

  it('passes a filter with no placeholder through unchanged', () => {
    const f = [{ property: 'Team', operator: 'enum_is', value: 'Platform' }];
    expect(resolveScopeFilter(f, null)).toEqual({ ok: true, filter: f });
  });
});

describe('The contract and the task store state the refusal', () => {
  it('the contract makes refusal the only outcome without scope', () => {
    expect(contract).toMatch(
      /A task adapter refuses to read or write a database when the scope filter is missing, or when a placeholder in it cannot be resolved/,
    );
    expect(contract).toMatch(/There is no unscoped fallback/);
  });

  it('the task store refuses an absent or empty filter', () => {
    expect(taskStore).toMatch(/If the list is absent or empty → `scope_missing`\. Touch nothing\./);
  });

  it('the task store refuses an unresolved placeholder', () => {
    expect(taskStore).toMatch(
      /If any clause still contains a placeholder, or `document_set` is absent → `scope_missing`\. Touch nothing\./,
    );
  });

  it('the scope gate runs before any tracker read or write', () => {
    expect(taskStore).toMatch(/This gate runs before any read or write of the tracker/);
    expect(taskStore).toMatch(/There is no unscoped fallback/);
  });

  it('every write re-checks scope on the item itself', () => {
    expect(taskStore).toMatch(/Verify before every write\.[^\n]*evaluate the scope filter[^\n]*`permission_denied`/);
  });

  it('created items are stamped to satisfy scope, or nothing is created', () => {
    expect(taskStore).toMatch(/Stamping the scope on create/);
    expect(taskStore).toMatch(/`create_tasks` fails with `scope_missing` and creates nothing/);
  });

  it('the per-developer document set lives in the gitignored local config', () => {
    expect(contract).toMatch(/gitignored `\.synthex\/config\.local\.yaml`/);
  });
});

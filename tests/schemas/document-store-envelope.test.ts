/**
 * Layer 1 tests for the document-store response envelope and canonical task
 * shape, per §3, §6, and §7 of the document-store contract.
 *
 * Cost: $0 (no LLM calls — pure shape assertions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  validateDocumentStoreEnvelope,
  validateCanonicalTask,
  STATUS_VALUES,
  BACKEND_VALUES,
  ERROR_CODE_VALUES,
  TASK_STATUS_VALUES,
  CRITERION_TYPE_VALUES,
} from './document-store-envelope';

const CONTRACT_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'agents',
  '_shared',
  'document-store-contract.md',
);

const ok = () => ({
  status: 'success',
  error_code: null,
  error_message: null,
  backend: 'notion',
  operation: 'read',
  doc_type: 'implementation_plan',
  result: { handle: 'abc', content_markdown: '# Plan', version: 'v1' },
  degraded_from: null,
});

const task = () => ({
  task_ref: 'notion-page-id-1',
  ordinal: 3,
  title: 'Add CSRF validation to login handler',
  status: 'pending',
  complexity: 'M',
  milestone: '1.2',
  dependencies: ['notion-page-id-0'],
  acceptance_criteria: [
    { type: 'T', text: 'Rejects a request with no CSRF token', evidence: null },
    { type: 'H', text: 'Error copy approved', approved: false },
  ],
});

describe('Document store envelope', () => {
  describe('Valid envelopes', () => {
    it('accepts a successful read', () => {
      const r = validateDocumentStoreEnvelope(ok());
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });

    it('accepts a failure with a valid error code', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        status: 'failed',
        error_code: 'target_not_found',
        error_message: 'No page configured for implementation_plan.',
        result: {},
      });
      expect(r.errors).toEqual([]);
    });

    it('accepts a fail-soft degradation served by filesystem', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        backend: 'filesystem',
        degraded_from: 'notion',
      });
      expect(r.errors).toEqual([]);
    });

    it.each(BACKEND_VALUES)('accepts backend %s', (backend) => {
      expect(validateDocumentStoreEnvelope({ ...ok(), backend }).valid).toBe(true);
    });

    it.each(ERROR_CODE_VALUES)('accepts error_code %s on failure', (code) => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        status: 'failed',
        error_code: code,
        error_message: 'x',
      });
      expect(r.errors).toEqual([]);
    });
  });

  describe('Invalid envelopes', () => {
    it('rejects a non-object', () => {
      expect(validateDocumentStoreEnvelope('nope').valid).toBe(false);
      expect(validateDocumentStoreEnvelope(null).valid).toBe(false);
      expect(validateDocumentStoreEnvelope([]).valid).toBe(false);
    });

    it('rejects an unknown status', () => {
      const r = validateDocumentStoreEnvelope({ ...ok(), status: 'partial' });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/status must be one of/);
    });

    it('rejects a success envelope carrying an error code', () => {
      // This ambiguity is what makes a degraded run look healthy.
      const r = validateDocumentStoreEnvelope({ ...ok(), error_code: 'conflict' });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/must be null when status is success/);
    });

    it('rejects a failure with no error code', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        status: 'failed',
        error_code: null,
        error_message: 'x',
      });
      expect(r.valid).toBe(false);
    });

    it('rejects a failure with no error message', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        status: 'failed',
        error_code: 'conflict',
        error_message: null,
      });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/error_message/);
    });

    it('rejects an error code outside the closed enum', () => {
      // The enum is closed by FR-NB9; a new value requires amending the contract.
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        status: 'failed',
        error_code: 'notion_timeout',
        error_message: 'x',
      });
      expect(r.valid).toBe(false);
    });

    it('rejects an unknown backend, operation, or doc_type', () => {
      expect(validateDocumentStoreEnvelope({ ...ok(), backend: 'sqlite' }).valid).toBe(false);
      expect(validateDocumentStoreEnvelope({ ...ok(), operation: 'upsert' }).valid).toBe(false);
      expect(validateDocumentStoreEnvelope({ ...ok(), doc_type: 'invoices' }).valid).toBe(false);
    });

    it('rejects degraded_from on a notion-served operation', () => {
      // A degraded operation is by definition served by the fallback.
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        backend: 'notion',
        degraded_from: 'notion',
      });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/must be "filesystem"/);
    });

    it('rejects degrading from filesystem', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        backend: 'filesystem',
        degraded_from: 'filesystem',
      });
      expect(r.valid).toBe(false);
    });

    it('rejects a degradation that does not say where the data went', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        degradations: [{ field: 'complexity', reason: 'unmapped' }],
      });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/recorded_in/);
    });

    it('propagates task errors with an index', () => {
      const r = validateDocumentStoreEnvelope({
        ...ok(),
        operation: 'list_tasks',
        result: { tasks: [task(), { ...task(), status: 'shipped' }] },
      });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/result\.tasks\[1\]/);
    });
  });

  describe('Canonical task', () => {
    it('accepts a fully populated task', () => {
      expect(validateCanonicalTask(task()).errors).toEqual([]);
    });

    it('accepts a task with only the required fields', () => {
      // Optional fields degrade rather than fail (§5), so a minimally mapped
      // database must still produce valid tasks.
      const r = validateCanonicalTask({
        task_ref: 'id',
        title: 'Do the thing',
        status: 'done',
      });
      expect(r.errors).toEqual([]);
    });

    it('requires task_ref', () => {
      const { task_ref, ...rest } = task();
      const r = validateCanonicalTask(rest);
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/task_ref/);
    });

    it('does not require ordinal', () => {
      // Ordinals are display-only and renumbered by plan-scribe; requiring one
      // would invite implementers to treat it as identity (FR-NB7).
      const { ordinal, ...rest } = task();
      expect(validateCanonicalTask(rest).errors).toEqual([]);
    });

    it.each(TASK_STATUS_VALUES)('accepts canonical status %s', (status) => {
      expect(validateCanonicalTask({ ...task(), status }).errors).toEqual([]);
    });

    it('rejects a workspace-specific status value', () => {
      // "Shipped" is a Notion option name; it must be translated back to the
      // canonical enum before it reaches the contract boundary.
      const r = validateCanonicalTask({ ...task(), status: 'Shipped' });
      expect(r.valid).toBe(false);
    });

    it('rejects a non-integer ordinal', () => {
      expect(validateCanonicalTask({ ...task(), ordinal: 1.5 }).valid).toBe(false);
    });

    it('rejects an invalid complexity grade', () => {
      expect(validateCanonicalTask({ ...task(), complexity: 'XL' }).valid).toBe(false);
    });

    it('rejects non-string dependencies', () => {
      expect(validateCanonicalTask({ ...task(), dependencies: [3] }).valid).toBe(false);
    });

    it.each(CRITERION_TYPE_VALUES)('accepts criterion type %s', (type) => {
      const r = validateCanonicalTask({
        ...task(),
        acceptance_criteria: [{ type, text: 'something specific' }],
      });
      expect(r.errors).toEqual([]);
    });

    it('rejects an untagged acceptance criterion', () => {
      const r = validateCanonicalTask({
        ...task(),
        acceptance_criteria: [{ text: 'untagged' }],
      });
      expect(r.valid).toBe(false);
      expect(r.errors.join()).toMatch(/type must be one of/);
    });
  });

  describe('Validator agrees with the contract document', () => {
    const contract = readFileSync(CONTRACT_PATH, 'utf8');

    it('contract declares itself normative', () => {
      expect(contract).toMatch(/^## Status: Normative$/m);
    });

    it('contract documents every error code this validator accepts', () => {
      for (const code of ERROR_CODE_VALUES) {
        expect(contract, `contract does not document ${code}`).toContain(code);
      }
    });

    it('contract documents exactly this many error codes', () => {
      // Guards against the enum drifting apart from the spec in either
      // direction — a code documented but unimplemented is as bad as the
      // reverse.
      const table = contract.split('## 6. Error enum')[1]?.split('## 7.')[0] ?? '';
      const documented = ERROR_CODE_VALUES.filter((c) => table.includes(c));
      expect(documented).toHaveLength(ERROR_CODE_VALUES.length);
    });

    it('contract documents the status and backend vocabularies', () => {
      for (const v of [...STATUS_VALUES, ...BACKEND_VALUES, ...TASK_STATUS_VALUES]) {
        expect(contract, `contract does not document ${v}`).toContain(v);
      }
    });

    it('contract states the ordinal-is-not-identity rule', () => {
      expect(contract).toMatch(/`ordinal` is \*\*display-only\*\*/);
      expect(contract).toMatch(/MUST NOT treat a renumber as re-identifying a task/);
    });

    it('contract names this validator as its validation surface', () => {
      expect(contract).toContain('tests/schemas/document-store-envelope.ts');
    });
  });
});

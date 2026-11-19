/**
 * Layer 1 tests for the document-store response envelope (contract §7), the
 * canonical task shape (§4) and the closed error-code list (§6), plus the
 * adapters' declared output shape.
 *
 * Cost: $0 (no LLM calls — pure shape assertions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  validateDocumentStoreEnvelope,
  validateCanonicalTask,
  ERROR_CODE_VALUES,
  OPERATION_VALUES,
  TASK_STATUS_VALUES,
  CRITERION_TYPE_VALUES,
} from './document-store-envelope';

const AGENTS = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');
const contract = readFileSync(join(AGENTS, '_shared', 'document-store-contract.md'), 'utf8');

const ok = (): Record<string, unknown> => ({
  status: 'success',
  error_code: null,
  error_message: null,
  backend: 'notion',
  operation: 'read',
  doc_type: 'implementation_plan',
  result: { handle: 'abc', content_markdown: '# Plan', version: 'v1' },
  warnings: [],
});

const failed = (code: string): Record<string, unknown> => ({
  ...ok(),
  status: 'failed',
  error_code: code,
  error_message: 'x',
  result: {},
});

const task = (): Record<string, unknown> => ({
  task_ref: 'https://example.test/item-1',
  ordinal: 3,
  title: 'Add CSRF validation to login handler',
  status: 'pending',
  complexity: 'M',
  milestone: '1.2',
  dependencies: ['https://example.test/item-0'],
  acceptance_criteria: [
    { type: 'T', text: 'Rejects a request with no CSRF token', evidence: null },
    { type: 'H', text: 'Error copy approved', approved: false },
  ],
});

describe('Envelope: valid shapes', () => {
  it('accepts a successful read', () => {
    expect(validateDocumentStoreEnvelope(ok()).errors).toEqual([]);
  });

  it.each(ERROR_CODE_VALUES)('accepts a failure with error_code %s', (code) => {
    expect(validateDocumentStoreEnvelope(failed(code)).errors).toEqual([]);
  });

  it('accepts the repository as backend', () => {
    expect(validateDocumentStoreEnvelope({ ...ok(), backend: 'repository' }).valid).toBe(true);
  });

  it('accepts any kebab-case source name, so a new source needs no validator change', () => {
    for (const backend of ['notion', 'jira', 'linear', 'some-tracker']) {
      expect(validateDocumentStoreEnvelope({ ...ok(), backend }).valid).toBe(true);
    }
  });

  it('accepts list_tasks with tasks and plan_edits', () => {
    const r = validateDocumentStoreEnvelope({
      ...ok(),
      operation: 'list_tasks',
      result: {
        tasks: [task()],
        plan_edits: [{ old_str: '| pending |', new_str: '| done |' }],
      },
    });
    expect(r.errors).toEqual([]);
  });

  it.each(OPERATION_VALUES)('accepts operation %s', (operation) => {
    expect(validateDocumentStoreEnvelope({ ...ok(), operation }).valid).toBe(true);
  });
});

describe('Envelope: invalid shapes', () => {
  it('rejects a non-object', () => {
    for (const v of ['nope', null, []]) {
      expect(validateDocumentStoreEnvelope(v).valid).toBe(false);
    }
  });

  it('rejects an unknown status', () => {
    expect(validateDocumentStoreEnvelope({ ...ok(), status: 'partial' }).valid).toBe(false);
  });

  it('rejects a success carrying an error code', () => {
    expect(validateDocumentStoreEnvelope({ ...ok(), error_code: 'conflict' }).valid).toBe(false);
  });

  it('rejects a failure with no error code or message', () => {
    expect(validateDocumentStoreEnvelope({ ...failed('conflict'), error_code: null }).valid).toBe(false);
    expect(validateDocumentStoreEnvelope({ ...failed('conflict'), error_message: '' }).valid).toBe(false);
  });

  it('rejects the retired source-named error codes', () => {
    for (const code of ['notion_auth_failed', 'mcp_unavailable']) {
      expect(validateDocumentStoreEnvelope(failed(code)).valid).toBe(false);
    }
  });

  it('rejects a backend that is not a kebab-case name', () => {
    for (const backend of ['', 'Notion', 'my source', null, 3]) {
      expect(validateDocumentStoreEnvelope({ ...ok(), backend }).valid).toBe(false);
    }
  });

  it('rejects a retired operation', () => {
    expect(validateDocumentStoreEnvelope({ ...ok(), operation: 'ensure_epic_view' }).valid).toBe(false);
  });

  it('rejects an unknown doc_type', () => {
    expect(validateDocumentStoreEnvelope({ ...ok(), doc_type: 'epic_page' }).valid).toBe(false);
  });

  it('rejects non-string warnings and malformed plan_edits', () => {
    expect(validateDocumentStoreEnvelope({ ...ok(), warnings: [1] }).valid).toBe(false);
    expect(
      validateDocumentStoreEnvelope({ ...ok(), result: { plan_edits: [{ old_str: 'a' }] } }).valid,
    ).toBe(false);
  });

  it('rejects an invalid task inside result.tasks', () => {
    const r = validateDocumentStoreEnvelope({
      ...ok(),
      result: { tasks: [{ ...task(), status: 'Shipped' }] },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/result\.tasks\[0\]/);
  });
});

describe('Canonical task', () => {
  it('accepts a full task', () => {
    expect(validateCanonicalTask(task()).errors).toEqual([]);
  });

  it('accepts a minimal task', () => {
    expect(validateCanonicalTask({ task_ref: 'r', title: 't', status: 'done' }).valid).toBe(true);
  });

  it.each(TASK_STATUS_VALUES)('accepts status %s', (status) => {
    expect(validateCanonicalTask({ ...task(), status }).valid).toBe(true);
  });

  it('rejects a source-specific status value crossing the contract', () => {
    expect(validateCanonicalTask({ ...task(), status: 'In progress' }).valid).toBe(false);
  });

  it.each(CRITERION_TYPE_VALUES)('accepts criterion type %s', (type) => {
    expect(
      validateCanonicalTask({ ...task(), acceptance_criteria: [{ type, text: 'x' }] }).valid,
    ).toBe(true);
  });

  it('rejects a missing task_ref, bad complexity, and non-string dependencies', () => {
    expect(validateCanonicalTask({ ...task(), task_ref: '' }).valid).toBe(false);
    expect(validateCanonicalTask({ ...task(), complexity: 'XL' }).valid).toBe(false);
    expect(validateCanonicalTask({ ...task(), dependencies: [3] }).valid).toBe(false);
  });
});

describe('Contract and validator agree', () => {
  it('the contract §6 table lists exactly the validator error codes', () => {
    const section = contract.split('## 6. Error codes')[1].split('## 7.')[0];
    const codes = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
    expect(codes).toEqual([...ERROR_CODE_VALUES]);
  });

  it('the contract lists every task operation in §4', () => {
    const section = contract.split('## 4. Task operations')[1].split('## 5.')[0];
    for (const op of ['list_tasks', 'create_tasks', 'update_task_status', 'annotate_task']) {
      expect(section).toContain(`\`${op}\``);
    }
  });
});

describe('Adapters declare the contract envelope', () => {
  const adapters = ['notion-document-store.md', 'notion-task-store.md'];

  it.each(adapters)('%s returns the §7 envelope with its own source name', (file) => {
    const text = readFileSync(join(AGENTS, file), 'utf8');
    expect(text).toMatch(/§7 envelope with `backend: "notion"`/);
  });

  it.each(adapters)('%s uses only contract error codes', (file) => {
    const text = readFileSync(join(AGENTS, file), 'utf8');
    const used = new Set(
      [...text.matchAll(/→ `([a-z_]+)`/g)].map((m) => m[1]),
    );
    for (const code of used) {
      expect(ERROR_CODE_VALUES).toContain(code);
    }
    expect(used.size).toBeGreaterThan(0);
  });

  it('the document store performs only contract document operations', () => {
    const text = readFileSync(join(AGENTS, 'notion-document-store.md'), 'utf8');
    expect(text).toMatch(/operation: string {2}\(required\) — resolve \| read \| write \| patch \| create \| list/);
  });

  it('the task store performs only contract task operations', () => {
    const text = readFileSync(join(AGENTS, 'notion-task-store.md'), 'utf8');
    expect(text).toMatch(
      /operation: {3}string \(required\) — list_tasks \| create_tasks \| update_task_status \| annotate_task/,
    );
  });
});

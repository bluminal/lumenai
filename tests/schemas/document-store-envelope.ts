/**
 * Document store envelope validator, and the scope-resolution rule every task
 * adapter applies.
 *
 * Source of truth: plugins/synthex/agents/_shared/document-store-contract.md
 * (§4 scope, §6 error codes, §7 envelope). This file names no external source:
 * `backend` accepts `repository` or any kebab-case source name, so adding a
 * source changes nothing here.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** §7 envelope status values. */
export const STATUS_VALUES = ['success', 'failed'] as const;

/** §7 `backend` for local storage. Any other valid value is a source name. */
export const REPOSITORY_BACKEND = 'repository';

/** §7 a source name: lowercase kebab-case. */
export const SOURCE_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** §6 closed error-code list. Do not extend without amending the contract. */
export const ERROR_CODE_VALUES = [
  'source_unavailable',
  'auth_failed',
  'target_not_found',
  'permission_denied',
  'schema_mismatch',
  'scope_missing',
  'rate_limited',
  'conflict',
  'unknown_error',
] as const;

/** §3 + §4 operations. */
export const OPERATION_VALUES = [
  'resolve',
  'read',
  'write',
  'patch',
  'create',
  'list',
  'list_tasks',
  'create_tasks',
  'update_task_status',
  'annotate_task',
] as const;

/** §3 document types — the keys of the `documents` config block. */
export const DOC_TYPE_VALUES = [
  'requirements',
  'implementation_plan',
  'specs',
  'decisions',
  'rfcs',
  'runbooks',
  'retros',
] as const;

/** §4 canonical task statuses. */
export const TASK_STATUS_VALUES = ['pending', 'in_progress', 'done', 'blocked'] as const;

/** §4 typed acceptance criteria. */
export const CRITERION_TYPE_VALUES = ['T', 'H', 'O'] as const;

/** §4 complexity grades. */
export const COMPLEXITY_VALUES = ['S', 'M', 'L'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** True when `backend` is `repository` or a kebab-case source name. */
export function isValidBackend(backend: unknown): boolean {
  return typeof backend === 'string' && SOURCE_NAME_PATTERN.test(backend);
}

/**
 * Validates a canonical task per §4. `task_ref` carries identity; `ordinal`
 * is display-only and is not required to be unique or stable.
 */
export function validateCanonicalTask(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(obj)) return { valid: false, errors: ['task must be an object'] };

  if (typeof obj.task_ref !== 'string' || obj.task_ref.length === 0) {
    errors.push('task_ref must be a non-empty string');
  }
  if (typeof obj.title !== 'string' || obj.title.length === 0) {
    errors.push('title must be a non-empty string');
  }
  if (!TASK_STATUS_VALUES.includes(obj.status as never)) {
    errors.push(
      `status must be one of ${TASK_STATUS_VALUES.join(' | ')}; got ${JSON.stringify(obj.status)}`,
    );
  }
  if (obj.ordinal !== undefined && obj.ordinal !== null) {
    if (typeof obj.ordinal !== 'number' || !Number.isInteger(obj.ordinal)) {
      errors.push('ordinal, when present, must be an integer');
    }
  }
  if (
    obj.complexity !== undefined &&
    obj.complexity !== null &&
    !COMPLEXITY_VALUES.includes(obj.complexity as never)
  ) {
    errors.push(`complexity, when present, must be one of ${COMPLEXITY_VALUES.join(' | ')}`);
  }
  if (obj.dependencies !== undefined && obj.dependencies !== null) {
    if (!Array.isArray(obj.dependencies) || obj.dependencies.some((d) => typeof d !== 'string')) {
      errors.push('dependencies, when present, must be an array of task_ref strings');
    }
  }
  if (obj.acceptance_criteria !== undefined && obj.acceptance_criteria !== null) {
    if (!Array.isArray(obj.acceptance_criteria)) {
      errors.push('acceptance_criteria, when present, must be an array');
    } else {
      obj.acceptance_criteria.forEach((c, i) => {
        if (!isRecord(c)) {
          errors.push(`acceptance_criteria[${i}] must be an object`);
          return;
        }
        if (!CRITERION_TYPE_VALUES.includes(c.type as never)) {
          errors.push(
            `acceptance_criteria[${i}].type must be one of ${CRITERION_TYPE_VALUES.join(' | ')}`,
          );
        }
        if (typeof c.text !== 'string' || c.text.length === 0) {
          errors.push(`acceptance_criteria[${i}].text must be a non-empty string`);
        }
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

const isEdit = (e: unknown): boolean =>
  isRecord(e) && typeof e.old_str === 'string' && typeof e.new_str === 'string';

/** Validates the §7 response envelope. */
export function validateDocumentStoreEnvelope(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(obj)) return { valid: false, errors: ['envelope must be an object'] };

  if (!STATUS_VALUES.includes(obj.status as never)) {
    errors.push(
      `status must be one of ${STATUS_VALUES.join(' | ')}; got ${JSON.stringify(obj.status)}`,
    );
  }

  if (obj.status === 'failed') {
    if (!ERROR_CODE_VALUES.includes(obj.error_code as never)) {
      errors.push(
        `error_code must be one of ${ERROR_CODE_VALUES.join(' | ')} when status is failed; got ${JSON.stringify(obj.error_code)}`,
      );
    }
    if (typeof obj.error_message !== 'string' || obj.error_message.length === 0) {
      errors.push('error_message must be a non-empty string when status is failed');
    }
  } else if (obj.status === 'success') {
    if (obj.error_code !== null && obj.error_code !== undefined) {
      errors.push('error_code must be null when status is success');
    }
  }

  if (!isValidBackend(obj.backend)) {
    errors.push(
      `backend must be "${REPOSITORY_BACKEND}" or a kebab-case source name; got ${JSON.stringify(obj.backend)}`,
    );
  }
  if (!OPERATION_VALUES.includes(obj.operation as never)) {
    errors.push(
      `operation must be one of ${OPERATION_VALUES.join(' | ')}; got ${JSON.stringify(obj.operation)}`,
    );
  }
  if (!DOC_TYPE_VALUES.includes(obj.doc_type as never)) {
    errors.push(
      `doc_type must be one of ${DOC_TYPE_VALUES.join(' | ')}; got ${JSON.stringify(obj.doc_type)}`,
    );
  }

  if (obj.warnings !== undefined && obj.warnings !== null) {
    if (!Array.isArray(obj.warnings) || obj.warnings.some((w) => typeof w !== 'string')) {
      errors.push('warnings, when present, must be an array of strings');
    }
  }

  if (isRecord(obj.result)) {
    if (Array.isArray(obj.result.tasks)) {
      obj.result.tasks.forEach((t, i) => {
        for (const err of validateCanonicalTask(t).errors) {
          errors.push(`result.tasks[${i}]: ${err}`);
        }
      });
    }
    if (obj.result.plan_edits !== undefined) {
      if (!Array.isArray(obj.result.plan_edits) || !obj.result.plan_edits.every(isEdit)) {
        errors.push('result.plan_edits must be an array of { old_str, new_str }');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── §4 scope resolution ─────────────────────────────────────────────────────

export interface ScopeClause {
  property: string;
  operator: string;
  value: string;
}

export type ScopeResolution =
  | { ok: true; filter: ScopeClause[] }
  | { ok: false; error_code: 'scope_missing'; error_message: string };

const PLACEHOLDER = /\{[a-z_]+\}/;

/**
 * The §4 gate a task adapter runs before any database read or write: a
 * missing or empty filter, or a placeholder left unresolved, is a refusal.
 * There is no unscoped result.
 */
export function resolveScopeFilter(
  filter: unknown,
  documentSet: string | null | undefined,
): ScopeResolution {
  if (!Array.isArray(filter) || filter.length === 0) {
    return { ok: false, error_code: 'scope_missing', error_message: 'No scope filter is declared.' };
  }
  const resolved: ScopeClause[] = [];
  for (const clause of filter) {
    if (
      !isRecord(clause) ||
      typeof clause.property !== 'string' ||
      typeof clause.operator !== 'string' ||
      typeof clause.value !== 'string'
    ) {
      return { ok: false, error_code: 'scope_missing', error_message: 'A scope clause is malformed.' };
    }
    let value = clause.value;
    if (value.includes('{document_set}')) {
      if (typeof documentSet !== 'string' || documentSet.length === 0) {
        return {
          ok: false,
          error_code: 'scope_missing',
          error_message: 'The scope filter uses {document_set}, but no document set is configured.',
        };
      }
      value = value.split('{document_set}').join(documentSet);
    }
    if (PLACEHOLDER.test(value)) {
      return {
        ok: false,
        error_code: 'scope_missing',
        error_message: `Unresolved placeholder in scope value ${JSON.stringify(value)}.`,
      };
    }
    resolved.push({ property: clause.property, operator: clause.operator, value });
  }
  return { ok: true, filter: resolved };
}

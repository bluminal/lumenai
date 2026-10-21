/**
 * Document store envelope validator.
 *
 * Validates the response envelope every document backend returns, per §7 of
 * plugins/synthex/agents/_shared/document-store-contract.md, plus the canonical
 * task shape from §3.
 *
 * Source of truth is that contract; this file must not introduce values the
 * contract does not define — in particular, the error-code enum is closed
 * (§6), and adding a value here without amending FR-NB9 and the contract is a
 * contract violation.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** §7 envelope status values. */
export const STATUS_VALUES = ['success', 'failed'] as const;

/** §1 backends. */
export const BACKEND_VALUES = ['filesystem', 'notion'] as const;

/** §6 closed error-code enum. Do not extend without amending the contract. */
export const ERROR_CODE_VALUES = [
  'mcp_unavailable',
  'notion_auth_failed',
  'target_not_found',
  'permission_denied',
  'schema_mismatch',
  'rate_limited',
  'conflict',
  'unknown_error',
] as const;

/** §2 + §3 operations. */
export const OPERATION_VALUES = [
  // document operations (§2)
  'resolve',
  'read',
  'write',
  'patch',
  'create',
  'list',
  // task operations (§3)
  'list_tasks',
  'create_tasks',
  'update_task_status',
  'annotate_task',
] as const;

/** Document types — the keys of the `documents` config block. */
export const DOC_TYPE_VALUES = [
  'requirements',
  'implementation_plan',
  'specs',
  'decisions',
  'rfcs',
  'runbooks',
  'retros',
] as const;

/** §3 canonical task status enum. */
export const TASK_STATUS_VALUES = [
  'pending',
  'in_progress',
  'done',
  'blocked',
] as const;

/** §3 typed acceptance criteria tags. */
export const CRITERION_TYPE_VALUES = ['T', 'H', 'O'] as const;

/** §3 complexity grades. */
export const COMPLEXITY_VALUES = ['S', 'M', 'L'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates a canonical task object per §3.
 *
 * `task_ref` is required and opaque. `ordinal` is display-only: it is
 * deliberately NOT required to be unique or stable, because plan-scribe
 * renumbers ordinals on insert. Identity lives in task_ref alone (FR-NB7).
 */
export function validateCanonicalTask(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(obj)) {
    return { valid: false, errors: ['task must be an object'] };
  }

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

  // Optional fields degrade rather than fail (§5), so they are only checked
  // for shape when present — never for presence.
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
    errors.push(
      `complexity, when present, must be one of ${COMPLEXITY_VALUES.join(' | ')}`,
    );
  }
  if (obj.dependencies !== undefined && obj.dependencies !== null) {
    if (!Array.isArray(obj.dependencies)) {
      errors.push('dependencies, when present, must be an array of task_ref');
    } else if (obj.dependencies.some((d) => typeof d !== 'string')) {
      errors.push('dependencies entries must be task_ref strings');
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

/** Validates the §7 response envelope. */
export function validateDocumentStoreEnvelope(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(obj)) {
    return { valid: false, errors: ['envelope must be an object'] };
  }

  if (!STATUS_VALUES.includes(obj.status as never)) {
    errors.push(
      `status must be one of ${STATUS_VALUES.join(' | ')}; got ${JSON.stringify(obj.status)}`,
    );
  }

  // error_code is required when failed, and MUST be null when successful.
  // A "successful" envelope carrying an error code is the kind of ambiguity
  // that makes a degraded run look healthy.
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

  if (!BACKEND_VALUES.includes(obj.backend as never)) {
    errors.push(
      `backend must be one of ${BACKEND_VALUES.join(' | ')}; got ${JSON.stringify(obj.backend)}`,
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

  // degraded_from records a fail-soft fallback. Only 'notion' can be degraded
  // from, since filesystem is the fallback target itself.
  if (obj.degraded_from !== null && obj.degraded_from !== undefined) {
    if (obj.degraded_from !== 'notion') {
      errors.push(
        `degraded_from must be null or "notion"; got ${JSON.stringify(obj.degraded_from)}`,
      );
    }
    if (obj.backend !== 'filesystem') {
      errors.push(
        'degraded_from is set, so backend must be "filesystem" — a degraded operation was served by the fallback',
      );
    }
  }

  // Validate any tasks carried in the result.
  if (isRecord(obj.result) && Array.isArray(obj.result.tasks)) {
    obj.result.tasks.forEach((t, i) => {
      const r = validateCanonicalTask(t);
      if (!r.valid) {
        for (const err of r.errors) errors.push(`result.tasks[${i}]: ${err}`);
      }
    });
  }

  // degradations, when present, must name the field and where the data went —
  // a degradation the caller cannot report to the user is not useful.
  if (obj.degradations !== undefined && obj.degradations !== null) {
    if (!Array.isArray(obj.degradations)) {
      errors.push('degradations, when present, must be an array');
    } else {
      obj.degradations.forEach((d, i) => {
        if (!isRecord(d)) {
          errors.push(`degradations[${i}] must be an object`);
          return;
        }
        if (typeof d.field !== 'string' || d.field.length === 0) {
          errors.push(`degradations[${i}].field must be a non-empty string`);
        }
        if (typeof d.recorded_in !== 'string' || d.recorded_in.length === 0) {
          errors.push(`degradations[${i}].recorded_in must say where the data went`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

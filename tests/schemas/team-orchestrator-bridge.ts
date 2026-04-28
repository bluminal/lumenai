/**
 * Schema validator for team-orchestrator-bridge input/output shapes.
 *
 * Validates:
 * (a) Bridge input — the object passed to the bridge by the orchestrator (FR-MMT3 step 5)
 * (b) Bridge output — per_reviewer_results + findings array where every finding
 *     carries source.source_type: "native-team" (FR-MMT20 Bridge Rule 4)
 *
 * Per the normative contracts defined in:
 *   plugins/synthex-plus/agents/team-orchestrator-bridge.md (FR-MMT20)
 *   plugins/synthex/agents/_shared/canonical-finding-schema.md (FR-MR13)
 */

// ── Constants ────────────────────────────────────────────────────

export const BRIDGE_SOURCE_TYPE = 'native-team' as const;

export const VALID_SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = typeof VALID_SEVERITY_VALUES[number];

export const VALID_SOURCE_TYPE_VALUES = ['native-team', 'external', 'native-recovery'] as const;
export type SourceType = typeof VALID_SOURCE_TYPE_VALUES[number];

export const VALID_STATUS_VALUES = ['success', 'failed'] as const;
export type ReviewerStatus = typeof VALID_STATUS_VALUES[number];

// ── Validation Result ────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Bridge Input Validator (FR-MMT3 step 5) ───────────────────────

/**
 * Validates the input object passed to the Team Orchestrator Bridge.
 *
 * Required fields:
 *   team_name           — non-empty string
 *   reviewer_names      — non-empty string[]
 *   mailbox_base_path   — non-empty string
 */
export function validateBridgeInput(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push('Bridge input must be a non-null JSON object');
    return { valid: false, errors };
  }

  const input = data as Record<string, unknown>;

  // team_name — required non-empty string
  if (!('team_name' in input)) {
    errors.push('Missing required field: "team_name"');
  } else if (typeof input.team_name !== 'string' || input.team_name.trim() === '') {
    errors.push('team_name must be a non-empty string');
  }

  // reviewer_names — required non-empty array of strings
  if (!('reviewer_names' in input)) {
    errors.push('Missing required field: "reviewer_names"');
  } else {
    const rn = input.reviewer_names;
    if (!Array.isArray(rn)) {
      errors.push('reviewer_names must be an array of strings');
    } else if (rn.length === 0) {
      errors.push('reviewer_names must be a non-empty array (at least one reviewer required)');
    } else {
      for (const name of rn) {
        if (typeof name !== 'string') {
          errors.push(`reviewer_names must contain only strings; found: ${JSON.stringify(name)}`);
          break;
        }
      }
    }
  }

  // mailbox_base_path — required non-empty string
  if (!('mailbox_base_path' in input)) {
    errors.push('Missing required field: "mailbox_base_path"');
  } else if (typeof input.mailbox_base_path !== 'string' || input.mailbox_base_path.trim() === '') {
    errors.push('mailbox_base_path must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

// ── Bridge Output: Per-Reviewer Result Validator ─────────────────

/**
 * Validates a single per_reviewer_results entry in the bridge output.
 *
 * Required fields:
 *   reviewer_id     — non-empty string
 *   source_type     — must be "native-team"
 *   family          — non-empty string (e.g. "anthropic")
 *   status          — "success" | "failed"
 *   findings_count  — non-negative integer
 *   error_code      — null | "parse_failed"
 *   report_markdown — string
 */
export function validatePerReviewerResult(entry: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `per_reviewer_results[${index}]`;

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    errors.push(`${prefix}: must be a non-null object`);
    return errors;
  }

  const e = entry as Record<string, unknown>;

  if (!('reviewer_id' in e)) {
    errors.push(`${prefix}: missing required field "reviewer_id"`);
  } else if (typeof e.reviewer_id !== 'string' || e.reviewer_id.trim() === '') {
    errors.push(`${prefix}: reviewer_id must be a non-empty string`);
  }

  if (!('source_type' in e)) {
    errors.push(`${prefix}: missing required field "source_type"`);
  } else if (e.source_type !== 'native-team') {
    errors.push(
      `${prefix}: source_type must be "native-team" for bridge output; got "${e.source_type}"`
    );
  }

  if (!('family' in e)) {
    errors.push(`${prefix}: missing required field "family"`);
  } else if (typeof e.family !== 'string' || e.family.trim() === '') {
    errors.push(`${prefix}: family must be a non-empty string`);
  }

  if (!('status' in e)) {
    errors.push(`${prefix}: missing required field "status"`);
  } else if (!VALID_STATUS_VALUES.includes(e.status as ReviewerStatus)) {
    errors.push(
      `${prefix}: status must be one of: ${VALID_STATUS_VALUES.join(', ')}; got "${e.status}"`
    );
  }

  if (!('findings_count' in e)) {
    errors.push(`${prefix}: missing required field "findings_count"`);
  } else {
    const fc = e.findings_count;
    if (typeof fc !== 'number' || !Number.isInteger(fc) || fc < 0) {
      errors.push(`${prefix}: findings_count must be a non-negative integer`);
    }
  }

  if (!('error_code' in e)) {
    errors.push(`${prefix}: missing required field "error_code"`);
  } else if (e.error_code !== null && e.error_code !== 'parse_failed') {
    errors.push(
      `${prefix}: error_code must be null or "parse_failed"; got "${e.error_code}"`
    );
  }

  if (!('report_markdown' in e)) {
    errors.push(`${prefix}: missing required field "report_markdown"`);
  } else if (typeof e.report_markdown !== 'string') {
    errors.push(`${prefix}: report_markdown must be a string`);
  }

  return errors;
}

// ── Bridge Output: Canonical Finding Validator ───────────────────

/**
 * Validates a single finding in the bridge output findings[] array.
 * Enforces the canonical finding schema (FR-MR13) with the additional
 * constraint that source.source_type MUST be "native-team" (FR-MMT20 Rule 4).
 */
export function validateBridgeFinding(finding: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `findings[${index}]`;

  if (typeof finding !== 'object' || finding === null || Array.isArray(finding)) {
    errors.push(`${prefix}: must be a non-null object`);
    return errors;
  }

  const f = finding as Record<string, unknown>;

  // Required canonical finding fields (FR-MR13)
  const REQUIRED_FIELDS = ['finding_id', 'severity', 'category', 'title', 'description', 'file', 'source'];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in f)) {
      errors.push(`${prefix}: missing required field "${field}"`);
    }
  }

  // severity enum check
  if ('severity' in f && !VALID_SEVERITY_VALUES.includes(f.severity as Severity)) {
    errors.push(
      `${prefix}: severity must be one of: ${VALID_SEVERITY_VALUES.join(', ')}; got "${f.severity}"`
    );
  }

  // source object validation with native-team constraint
  if ('source' in f) {
    const src = f.source;
    if (typeof src !== 'object' || src === null || Array.isArray(src)) {
      errors.push(`${prefix}: source must be a non-null object`);
    } else {
      const s = src as Record<string, unknown>;

      if (!('reviewer_id' in s)) {
        errors.push(`${prefix}: source missing required field "reviewer_id"`);
      } else if (typeof s.reviewer_id !== 'string' || s.reviewer_id.trim() === '') {
        errors.push(`${prefix}: source.reviewer_id must be a non-empty string`);
      }

      if (!('family' in s)) {
        errors.push(`${prefix}: source missing required field "family"`);
      } else if (typeof s.family !== 'string' || s.family.trim() === '') {
        errors.push(`${prefix}: source.family must be a non-empty string`);
      }

      // Bridge invariant: source_type MUST be "native-team" (FR-MMT20 Rule 4)
      if (!('source_type' in s)) {
        errors.push(
          `${prefix}: source missing required field "source_type"`
        );
      } else if (s.source_type !== BRIDGE_SOURCE_TYPE) {
        errors.push(
          `${prefix}: source.source_type must be "${BRIDGE_SOURCE_TYPE}" for bridge output; ` +
          `got "${s.source_type}"`
        );
      }
    }
  }

  return errors;
}

// ── Bridge Output Envelope Validator ────────────────────────────

/**
 * Validates the full bridge output envelope returned by the Team Orchestrator Bridge.
 *
 * Required shape:
 *   per_reviewer_results  — non-empty array of reviewer result objects
 *   findings              — array of canonical findings (may be empty on parse_failed)
 *
 * All findings MUST carry source.source_type: "native-team" (FR-MMT20 Rule 4).
 */
export function validateBridgeOutput(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push('Bridge output must be a non-null JSON object');
    return { valid: false, errors };
  }

  const output = data as Record<string, unknown>;

  // per_reviewer_results — required non-empty array
  if (!('per_reviewer_results' in output)) {
    errors.push('Missing required field: "per_reviewer_results"');
  } else {
    const prr = output.per_reviewer_results;
    if (!Array.isArray(prr)) {
      errors.push('per_reviewer_results must be an array');
    } else if (prr.length === 0) {
      errors.push('per_reviewer_results must contain at least one entry');
    } else {
      for (let i = 0; i < prr.length; i++) {
        errors.push(...validatePerReviewerResult(prr[i], i));
      }
    }
  }

  // findings — required array (may be empty)
  if (!('findings' in output)) {
    errors.push('Missing required field: "findings"');
  } else {
    const findings = output.findings;
    if (!Array.isArray(findings)) {
      errors.push('findings must be an array');
    } else {
      for (let i = 0; i < findings.length; i++) {
        errors.push(...validateBridgeFinding(findings[i], i));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

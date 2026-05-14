/**
 * Loop state-file schema validator — native-looping plan FR-NL8.
 *
 * Validates the structure of .synthex/loops/<loop-id>.json:
 *   - required fields present
 *   - status enum membership
 *   - isolation enum membership
 *   - schema_version === 1
 *
 * Used by Layer 1 schema tests + the iteration framework's runtime
 * recovery path (FR-NL25): when an agent re-derives state from disk
 * after compaction, it validates the file's shape before trusting it.
 *
 * No runtime dependencies — pure structural checks.
 */

export interface LoopState {
  schema_version: number;
  loop_id: string;
  session_id: string | null;
  command: string;
  args: string;
  prompt_file: string | null;
  completion_promise: string;
  max_iterations: number;
  iteration: number;
  isolation: 'shared-context' | 'subagent';
  status: 'running' | 'completed' | 'cancelled' | 'max-iterations-reached' | 'crashed';
  started_at: string;
  last_updated: string;
  exited_at: string | null;
  exit_reason: string | null;
}

export type ValidationResult =
  | { valid: true; state: LoopState }
  | { valid: false; errors: string[] };

const REQUIRED_FIELDS: ReadonlyArray<keyof LoopState> = [
  'schema_version',
  'loop_id',
  'session_id',
  'command',
  'args',
  'prompt_file',
  'completion_promise',
  'max_iterations',
  'iteration',
  'isolation',
  'status',
  'started_at',
  'last_updated',
  'exited_at',
  'exit_reason',
];

const STATUS_VALUES: ReadonlyArray<LoopState['status']> = [
  'running',
  'completed',
  'cancelled',
  'max-iterations-reached',
  'crashed',
];

const ISOLATION_VALUES: ReadonlyArray<LoopState['isolation']> = [
  'shared-context',
  'subagent',
];

const LOOP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function validateLoopStateFile(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { valid: false, errors: ['State file must be a JSON object.'] };
  }

  const obj = input as Record<string, unknown>;

  // Required field presence.
  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // schema_version
  if (obj.schema_version !== 1) {
    errors.push(`schema_version must be 1; got ${JSON.stringify(obj.schema_version)}`);
  }

  // loop_id
  if (typeof obj.loop_id !== 'string') {
    errors.push('loop_id must be a string');
  } else if (!LOOP_ID_PATTERN.test(obj.loop_id)) {
    errors.push(
      `loop_id "${obj.loop_id}" violates pattern ^[a-z0-9][a-z0-9-]{0,63}$ (lowercase, hyphens, ≤64 chars)`
    );
  }

  // session_id: string or null
  if (obj.session_id !== null && typeof obj.session_id !== 'string') {
    errors.push('session_id must be a string or null');
  }

  // command
  if (typeof obj.command !== 'string' || !obj.command.startsWith('/')) {
    errors.push('command must be a slash-prefixed string (e.g., "/synthex:next-priority")');
  }

  // args
  if (typeof obj.args !== 'string') {
    errors.push('args must be a string');
  }

  // prompt_file
  if (obj.prompt_file !== null && typeof obj.prompt_file !== 'string') {
    errors.push('prompt_file must be a string or null');
  }

  // completion_promise
  if (typeof obj.completion_promise !== 'string' || obj.completion_promise.length === 0) {
    errors.push('completion_promise must be a non-empty string');
  }

  // max_iterations
  if (typeof obj.max_iterations !== 'number' || !Number.isInteger(obj.max_iterations)) {
    errors.push('max_iterations must be an integer');
  } else if (obj.max_iterations < 1 || obj.max_iterations > 200) {
    errors.push(`max_iterations ${obj.max_iterations} out of range [1, 200]`);
  }

  // iteration
  if (typeof obj.iteration !== 'number' || !Number.isInteger(obj.iteration)) {
    errors.push('iteration must be an integer');
  } else if (obj.iteration < 0) {
    errors.push(`iteration ${obj.iteration} must be ≥ 0`);
  }

  // isolation
  if (
    typeof obj.isolation !== 'string' ||
    !(ISOLATION_VALUES as readonly string[]).includes(obj.isolation)
  ) {
    errors.push(
      `isolation must be one of ${JSON.stringify(ISOLATION_VALUES)}; got ${JSON.stringify(obj.isolation)}`
    );
  }

  // status
  if (
    typeof obj.status !== 'string' ||
    !(STATUS_VALUES as readonly string[]).includes(obj.status)
  ) {
    errors.push(
      `status must be one of ${JSON.stringify(STATUS_VALUES)}; got ${JSON.stringify(obj.status)}`
    );
  }

  // started_at
  if (typeof obj.started_at !== 'string' || !ISO_8601_PATTERN.test(obj.started_at)) {
    errors.push('started_at must be an ISO 8601 UTC timestamp (e.g., "2026-05-13T18:22:04Z")');
  }

  // last_updated
  if (typeof obj.last_updated !== 'string' || !ISO_8601_PATTERN.test(obj.last_updated)) {
    errors.push('last_updated must be an ISO 8601 UTC timestamp');
  }

  // exited_at: ISO 8601 or null
  if (obj.exited_at !== null) {
    if (typeof obj.exited_at !== 'string' || !ISO_8601_PATTERN.test(obj.exited_at)) {
      errors.push('exited_at must be an ISO 8601 UTC timestamp or null');
    }
  }

  // exit_reason: string or null
  if (obj.exit_reason !== null && typeof obj.exit_reason !== 'string') {
    errors.push('exit_reason must be a string or null');
  }

  // Cross-field consistency: terminal statuses require exited_at AND exit_reason.
  if (
    typeof obj.status === 'string' &&
    obj.status !== 'running' &&
    (STATUS_VALUES as readonly string[]).includes(obj.status)
  ) {
    if (obj.exited_at === null) {
      errors.push(`status "${obj.status}" requires exited_at to be non-null`);
    }
    if (obj.exit_reason === null) {
      errors.push(`status "${obj.status}" requires exit_reason to be non-null`);
    }
  }

  // Cross-field: running status MUST have exited_at === null.
  if (obj.status === 'running' && obj.exited_at !== null) {
    errors.push('status "running" requires exited_at to be null');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, state: obj as unknown as LoopState };
}

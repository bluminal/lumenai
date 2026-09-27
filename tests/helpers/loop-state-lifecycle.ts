/**
 * Thin wrapper around `plugins/synthex/scripts/loop-step.sh` (FR-HM18).
 *
 * Before Task 34 this file was a pure-TypeScript reference implementation
 * of the native-looping state-file lifecycle, mirroring the markdown spec
 * by hand. Now the mechanics live in loop-step.sh itself, so this wrapper
 * just shells out to it for every mutation — the state-writing logic exists
 * in exactly one place and the test suite exercises the real script, not a
 * parallel reimplementation that could quietly drift from it.
 *
 * Reads still go through plain `fs` + the loop-state-file.ts validator:
 * that validator is itself the shared structural contract (used by both
 * this helper and the runtime recovery path), so re-validating on every
 * read is the point, not a duplication to remove.
 *
 * Used by tests/schemas/loop-state-lifecycle.test.ts.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LoopState } from '../schemas/loop-state-file';
import { validateLoopStateFile } from '../schemas/loop-state-file';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const LOOP_STEP = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'loop-step.sh');

export interface CreateOpts {
  loop_id: string;
  session_id: string | null;
  command: string;
  args: string;
  prompt_file: string | null;
  completion_promise: string;
  max_iterations?: number;
  isolation?: 'shared-context' | 'subagent';
  now?: () => string;
}

const isoNow = (): string => new Date().toISOString().replace(/\.\d+/, '');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Invokes loop-step.sh with SYNTHEX_LOOPS_DIR pinned to the test's temp dir. */
function run(loopsDir: string, args: string[], nowIso?: string): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env, SYNTHEX_LOOPS_DIR: loopsDir };
  if (nowIso) env.SYNTHEX_NOW = nowIso;
  try {
    const stdout = execFileSync('bash', [LOOP_STEP, ...args], { env, encoding: 'utf-8' });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

export function readState(loopsDir: string, loopId: string): LoopState | null {
  const path = join(loopsDir, `${loopId}.json`);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf-8'));
  const result = validateLoopStateFile(parsed);
  if (!result.valid) {
    throw new Error(`Invalid state file at ${path}: ${result.errors.join('; ')}`);
  }
  return result.state;
}

/** FR-NL14 step 1 (fresh start) — create state with iteration: 0, status: running. */
export function createState(loopsDir: string, opts: CreateOpts): LoopState {
  mkdirSync(loopsDir, { recursive: true });
  const nowIso = (opts.now ?? isoNow)();
  const args = [
    'begin',
    opts.command,
    '--name',
    opts.loop_id,
    '--completion-promise',
    opts.completion_promise,
    '--max',
    String(opts.max_iterations ?? 20),
    '--args',
    opts.args,
    '--isolation',
    opts.isolation ?? 'shared-context',
  ];
  if (opts.session_id != null) args.push('--session-id', opts.session_id);
  if (opts.prompt_file != null) args.push('--prompt-file', opts.prompt_file);

  const { code, stderr } = run(loopsDir, args, nowIso);
  if (code !== 0) throw new Error(stderr.trim() || `begin failed for "${opts.loop_id}"`);
  const state = readState(loopsDir, opts.loop_id);
  if (!state) throw new Error(`begin did not create a state file for "${opts.loop_id}"`);
  return state;
}

/** FR-NL14 step 3 — durability boundary. Increment counter and persist before iteration work. */
export function incrementIteration(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const nowIso = now ? now() : undefined;
  const { code } = run(loopsDir, ['advance', loopId], nowIso);
  if (code !== 0) {
    const current = readState(loopsDir, loopId);
    if (!current) throw new Error(`No state file for loop "${loopId}"`);
    throw new Error(`Loop "${loopId}" is ${current.status} — cannot increment`);
  }
  const next = readState(loopsDir, loopId);
  if (!next) throw new Error(`No state file for loop "${loopId}"`);
  return next;
}

/** FR-NL23 — completion promise emitted. */
export function completeLoop(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const nowIso = now ? now() : undefined;
  const { code, stderr } = run(loopsDir, ['finish', loopId, 'completed'], nowIso);
  if (code !== 0) throw new Error(stderr.trim() || `finish failed for "${loopId}"`);
  const next = readState(loopsDir, loopId);
  if (!next) throw new Error(`No state file for loop "${loopId}"`);
  return next;
}

/** FR-NL22 — external cancel (set by /synthex:cancel-loop). Idempotent on terminal status. */
export function cancelLoop(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const nowIso = now ? now() : undefined;
  const { code, stderr } = run(loopsDir, ['cancel', loopId], nowIso);
  const current = readState(loopsDir, loopId);
  if (!current) throw new Error(stderr.trim() || `No state file for loop "${loopId}"`);
  if (code !== 0 && code !== 2) {
    // 2 = not found (surfaced above); anything else unexpected is a real failure.
    throw new Error(stderr.trim() || `cancel failed for "${loopId}"`);
  }
  return current;
}

/** FR-NL21 — iteration cap reached (explicit transition; advance() also
 * reaches this state on its own once iteration >= max_iterations). */
export function markMaxIterations(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const nowIso = now ? now() : undefined;
  const { code, stderr } = run(loopsDir, ['finish', loopId, 'max-iterations-reached'], nowIso);
  if (code !== 0) throw new Error(stderr.trim() || `finish failed for "${loopId}"`);
  const next = readState(loopsDir, loopId);
  if (!next) throw new Error(`No state file for loop "${loopId}"`);
  return next;
}

/** Resume validation per FR-NL26 — refuses if not running. Returns the state to resume from.
 * Delegates to `begin --resume`, which performs exactly the FR-NL40/FR-NL26 refusals and
 * refreshes last_updated (and session_id/isolation, when passed) in the same call. */
export function resumeState(loopsDir: string, loopId: string): LoopState {
  const { code, stderr } = run(loopsDir, ['begin', '/synthex:loop', '--resume', loopId]);
  if (code !== 0) throw new Error(stderr.trim() || `No loop found: ${loopId}`);
  const state = readState(loopsDir, loopId);
  if (!state) throw new Error(`No loop found: ${loopId}`);
  return state;
}

/** Iteration boundary check (FR-NL14 step 2) — read-only, no script call. */
export type BoundaryResult =
  | { action: 'continue'; state: LoopState }
  | { action: 'exit'; reason: 'not-running' | 'max-iterations'; state: LoopState };

export function iterationBoundary(loopsDir: string, loopId: string): BoundaryResult {
  const state = readState(loopsDir, loopId);
  if (!state) throw new Error(`No state file for loop "${loopId}"`);
  if (state.status !== 'running') return { action: 'exit', reason: 'not-running', state };
  if (state.iteration >= state.max_iterations) return { action: 'exit', reason: 'max-iterations', state };
  return { action: 'continue', state };
}

/**
 * Reference implementation of the native-looping state-file lifecycle.
 *
 * Mirrors the spec at plugins/synthex/docs/native-looping.md exactly. The
 * looping commands are markdown instructions, not executable code, so this
 * helper IS the testable surface: it locks in the contract that any agent
 * following the markdown should satisfy.
 *
 * Used by Phase 6 Milestone 6.2 fixtures (Tasks 34, 35, 36, 37).
 *
 * Operations (per FR-NL14, FR-NL18, FR-NL21–FR-NL23, FR-NL26/27):
 *
 *   createState — fresh loop initialization
 *   incrementIteration — durability-boundary counter persist (D-NL13)
 *   completeLoop — promise emitted (FR-NL23)
 *   cancelLoop — external cancel (FR-NL22)
 *   markMaxIterations — iteration cap hit (FR-NL21)
 *   markCrashed — explicit crash recovery transition (used by resume flow)
 *   readState / writeState — atomic I/O (tmp + rename)
 *   resumeState — refuse if not running
 *
 * No LLM, no shell-out — pure TS so the test runs in vitest at < 1ms per op.
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { join, dirname } from 'path';
import type { LoopState } from '../schemas/loop-state-file';
import { validateLoopStateFile } from '../schemas/loop-state-file';

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

/** Atomic write: tmp file + rename. Matches FR-NL state-file atomic-write contract. */
export function writeState(loopsDir: string, state: LoopState): void {
  mkdirSync(loopsDir, { recursive: true });
  const path = join(loopsDir, `${state.loop_id}.json`);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
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
  const now = (opts.now ?? isoNow)();
  const state: LoopState = {
    schema_version: 1,
    loop_id: opts.loop_id,
    session_id: opts.session_id,
    command: opts.command,
    args: opts.args,
    prompt_file: opts.prompt_file,
    completion_promise: opts.completion_promise,
    max_iterations: opts.max_iterations ?? 20,
    iteration: 0,
    isolation: opts.isolation ?? 'shared-context',
    status: 'running',
    started_at: now,
    last_updated: now,
    exited_at: null,
    exit_reason: null,
  };
  writeState(loopsDir, state);
  return state;
}

/** FR-NL14 step 3 — durability boundary. Increment counter and persist before iteration work. */
export function incrementIteration(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const current = readState(loopsDir, loopId);
  if (!current) throw new Error(`No state file for loop "${loopId}"`);
  if (current.status !== 'running') {
    throw new Error(`Loop "${loopId}" is ${current.status} — cannot increment`);
  }
  const next: LoopState = {
    ...current,
    iteration: current.iteration + 1,
    last_updated: (now ?? isoNow)(),
  };
  writeState(loopsDir, next);
  return next;
}

/** FR-NL23 — completion promise emitted. */
export function completeLoop(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const current = readState(loopsDir, loopId);
  if (!current) throw new Error(`No state file for loop "${loopId}"`);
  const ts = (now ?? isoNow)();
  const next: LoopState = {
    ...current,
    status: 'completed',
    exited_at: ts,
    exit_reason: 'completion-promise-emitted',
    last_updated: ts,
  };
  writeState(loopsDir, next);
  return next;
}

/** FR-NL22 — external cancel (set by /synthex:cancel-loop). Idempotent on terminal status. */
export function cancelLoop(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const current = readState(loopsDir, loopId);
  if (!current) throw new Error(`No state file for loop "${loopId}"`);
  // Idempotent: no-op on terminal status.
  if (current.status !== 'running') return current;
  const ts = (now ?? isoNow)();
  const next: LoopState = {
    ...current,
    status: 'cancelled',
    exited_at: ts,
    exit_reason: 'Cancelled by /synthex:cancel-loop',
    last_updated: ts,
  };
  writeState(loopsDir, next);
  return next;
}

/** FR-NL21 — iteration cap reached. */
export function markMaxIterations(loopsDir: string, loopId: string, now?: () => string): LoopState {
  const current = readState(loopsDir, loopId);
  if (!current) throw new Error(`No state file for loop "${loopId}"`);
  const ts = (now ?? isoNow)();
  const next: LoopState = {
    ...current,
    status: 'max-iterations-reached',
    exited_at: ts,
    exit_reason: `Reached max_iterations=${current.max_iterations} without completion promise`,
    last_updated: ts,
  };
  writeState(loopsDir, next);
  return next;
}

/** Resume validation per FR-NL26 — refuse if not running. Returns the state to resume from. */
export function resumeState(loopsDir: string, loopId: string): LoopState {
  const current = readState(loopsDir, loopId);
  if (!current) {
    throw new Error(`No loop found: ${loopId}`);
  }
  if (current.status !== 'running') {
    throw new Error(`Loop "${loopId}" is ${current.status}. Cannot resume a terminal loop.`);
  }
  return current;
}

/** Iteration boundary check (FR-NL14 step 2). Returns "exit" if loop should stop. */
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

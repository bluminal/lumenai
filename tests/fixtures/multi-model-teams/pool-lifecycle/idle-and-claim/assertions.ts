/**
 * Assertion helpers for the idle-and-claim pool lifecycle fixture.
 *
 * Imports the fixture frames and schema validators. Exports typed
 * assertion functions used by the Vitest suite in
 * tests/schemas/idle-and-claim.test.ts.
 */

import { validatePoolConfig } from '../../../../schemas/standing-pool-config.js';
import { validatePoolIndex } from '../../../../schemas/standing-pool-index.js';
import fixtureFrames from './fixture.json' assert { type: 'json' };

// ── Frame types ──────────────────────────────────────────────────

export interface FixtureFrame {
  frame: string;
  description: string;
  config_json: Record<string, unknown>;
  index_json: Record<string, unknown>;
  assertion: string;
}

export const frames = fixtureFrames as FixtureFrame[];

// ── Frame lookup helpers ─────────────────────────────────────────

export function getFrame(name: string): FixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Fixture frame "${name}" not found`);
  return f;
}

export const FRAME_NAMES = [
  'spawn',
  'idle-hook-fires-1',
  'idle-hook-fires-2',
  'debounce-skip',
  'task-claimed',
  'task-complete',
  'idle-after-empty',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

// ── last_active_at extraction ────────────────────────────────────

export function getLastActiveAt(frame: FixtureFrame): Date {
  const ts = frame.config_json['last_active_at'];
  if (typeof ts !== 'string') {
    throw new Error(`Frame "${frame.frame}" has non-string last_active_at: ${JSON.stringify(ts)}`);
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    throw new Error(`Frame "${frame.frame}" has unparseable last_active_at: "${ts}"`);
  }
  return d;
}

// ── Monotonicity assertion ───────────────────────────────────────

/**
 * Asserts that last_active_at is monotonically non-decreasing across
 * all fixture frames in the order they appear.
 *
 * Returns an array of violation strings (empty means passing).
 */
export function assertMonotonicLastActiveAt(): string[] {
  const violations: string[] = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    const prevTs = getLastActiveAt(prev);
    const currTs = getLastActiveAt(curr);
    if (currTs < prevTs) {
      violations.push(
        `Frame "${curr.frame}": last_active_at regressed from ` +
        `"${prev.config_json['last_active_at']}" (frame "${prev.frame}") ` +
        `to "${curr.config_json['last_active_at']}"`
      );
    }
  }
  return violations;
}

// ── pool_state sequence assertion ────────────────────────────────

/**
 * Expected pool_state sequence across the seven frames, in order.
 */
export const EXPECTED_POOL_STATE_SEQUENCE: ReadonlyArray<string> = [
  'idle',   // spawn
  'idle',   // idle-hook-fires-1
  'idle',   // idle-hook-fires-2
  'idle',   // debounce-skip
  'active', // task-claimed
  'idle',   // task-complete
  'idle',   // idle-after-empty
];

/**
 * Asserts that pool_state values across all frames match the expected
 * sequence. Returns an array of violation strings (empty means passing).
 */
export function assertPoolStateSequence(): string[] {
  const violations: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const actual = frame.config_json['pool_state'];
    const expected = EXPECTED_POOL_STATE_SEQUENCE[i];
    if (actual !== expected) {
      violations.push(
        `Frame "${frame.frame}" (index ${i}): expected pool_state "${expected}", got "${actual}"`
      );
    }
  }
  return violations;
}

// ── Schema validation assertion ──────────────────────────────────

/**
 * Runs validatePoolConfig and validatePoolIndex on every frame.
 * Returns a map of frame name → error list (empty errors = passing).
 */
export function assertAllFramesPassSchema(): Map<string, { configErrors: string[]; indexErrors: string[] }> {
  const results = new Map<string, { configErrors: string[]; indexErrors: string[] }>();
  for (const frame of frames) {
    const configResult = validatePoolConfig(frame.config_json);
    const indexResult = validatePoolIndex(frame.index_json);
    results.set(frame.frame, {
      configErrors: configResult.errors,
      indexErrors: indexResult.errors,
    });
  }
  return results;
}

// ── Pool does not shut down assertion ────────────────────────────

/**
 * Asserts that the "idle-after-empty" frame has pool_state "idle",
 * not "draining" or "stopping". Returns null on pass, error string on fail.
 */
export function assertPoolDoesNotShutdownOnEmptyTaskList(): string | null {
  const frame = getFrame('idle-after-empty');
  const state = frame.config_json['pool_state'];
  if (state === 'draining' || state === 'stopping') {
    return (
      `Pool should NOT shut down when task list empties. ` +
      `Frame "idle-after-empty" has pool_state: "${state}" — expected "idle".`
    );
  }
  if (state !== 'idle') {
    return (
      `Frame "idle-after-empty": unexpected pool_state "${state}" — expected "idle".`
    );
  }
  return null;
}

// ── Debounce invariant assertion ─────────────────────────────────

/**
 * Asserts that the debounce-skip frame has the same last_active_at as
 * the preceding idle-hook-fires-2 frame (write was suppressed, not regressed).
 * Returns null on pass, error string on fail.
 */
export function assertDebounceDoesNotRegress(): string | null {
  const hookFires2 = getFrame('idle-hook-fires-2');
  const debounceSkip = getFrame('debounce-skip');
  const t2Config = hookFires2.config_json['last_active_at'];
  const t2Debounce = debounceSkip.config_json['last_active_at'];
  if (t2Config !== t2Debounce) {
    return (
      `Debounce-skip frame should have unchanged last_active_at. ` +
      `Expected "${t2Config}" (from idle-hook-fires-2), got "${t2Debounce}".`
    );
  }
  return null;
}

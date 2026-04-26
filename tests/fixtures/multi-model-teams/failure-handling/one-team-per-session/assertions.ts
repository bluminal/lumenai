/**
 * Assertion helpers for the one-team-per-session exemption fixture (FR-MMT26).
 *
 * Imports fixture frames and exports typed assertion functions used by
 * tests/schemas/one-team-per-session.test.ts.
 */

import fixtureFrames from './fixture.json' assert { type: 'json' };

// ── Frame types ──────────────────────────────────────────────────

export interface StandingPoolActiveFrame {
  frame: 'standing_pool_active';
  description: string;
  pool_name: string;
  pool_type: string;
  session_id: string;
  session_team_count_non_standing: number;
  assertion: string;
}

export interface FirstNonStandingSpawnedFrame {
  frame: 'first_non_standing_spawned';
  description: string;
  team_name: string;
  team_type: string;
  session_id: string;
  session_team_count_non_standing: number;
  spawn_allowed: boolean;
  assertion: string;
}

export interface SecondNonStandingAttemptFrame {
  frame: 'second_non_standing_attempt';
  description: string;
  session_id: string;
  session_team_count_non_standing: number;
  spawn_allowed: boolean;
  assertion: string;
}

export interface ErrorShownFrame {
  frame: 'error_shown';
  description: string;
  session_id: string;
  error_message_prefix: string;
  error_contains_existing_team_name: boolean;
  existing_team_name: string;
  assertion: string;
}

export interface StandingPoolUnaffectedFrame {
  frame: 'standing_pool_unaffected';
  description: string;
  pool_name: string;
  pool_state: string;
  session_id: string;
  affected_by_conflict: boolean;
  assertion: string;
}

export type FixtureFrame =
  | StandingPoolActiveFrame
  | FirstNonStandingSpawnedFrame
  | SecondNonStandingAttemptFrame
  | ErrorShownFrame
  | StandingPoolUnaffectedFrame;

export const frames = fixtureFrames as FixtureFrame[];

// ── Frame names ──────────────────────────────────────────────────

export const FRAME_NAMES = [
  'standing_pool_active',
  'first_non_standing_spawned',
  'second_non_standing_attempt',
  'error_shown',
  'standing_pool_unaffected',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

// ── Frame lookup helpers ─────────────────────────────────────────

export function getFrame(name: FrameName): FixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Fixture frame "${name}" not found`);
  return f;
}

// ── [T1] Standing pool + non-standing team coexist ───────────────

/**
 * Asserts that a standing pool and one non-standing team can coexist.
 * Returns null on pass, error string on fail.
 */
export function assertStandingPoolAndNonStandingCoexist(): string | null {
  const frame = getFrame('first_non_standing_spawned') as FirstNonStandingSpawnedFrame;
  if (!frame.spawn_allowed) {
    return (
      `Frame "first_non_standing_spawned": spawn_allowed should be true when only a standing pool ` +
      `is active. Got: ${frame.spawn_allowed}`
    );
  }
  if (frame.session_team_count_non_standing !== 1) {
    return (
      `Frame "first_non_standing_spawned": session_team_count_non_standing should be 1 after ` +
      `spawning the first non-standing team. Got: ${frame.session_team_count_non_standing}`
    );
  }
  return null;
}

// ── [T2] Second non-standing spawn aborts ────────────────────────

/**
 * Asserts that a second non-standing team spawn is blocked.
 * Returns null on pass, error string on fail.
 */
export function assertSecondNonStandingSpawnAborts(): string | null {
  const frame = getFrame('second_non_standing_attempt') as SecondNonStandingAttemptFrame;
  if (frame.spawn_allowed !== false) {
    return (
      `Frame "second_non_standing_attempt": spawn_allowed should be false when ` +
      `session_team_count_non_standing is already 1. Got: ${frame.spawn_allowed}`
    );
  }
  return null;
}

// ── [T3] Original error message unchanged ────────────────────────

/**
 * Asserts that the error message for a non-standing team conflict starts
 * with the canonical prefix and includes the existing team name.
 * Returns null on pass, error string on fail.
 */
export function assertOriginalErrorMessageUnchanged(): string | null {
  const frame = getFrame('error_shown') as ErrorShownFrame;
  if (frame.error_message_prefix !== 'Error: An active team') {
    return (
      `Frame "error_shown": error_message_prefix should be "Error: An active team". ` +
      `Got: "${frame.error_message_prefix}"`
    );
  }
  if (!frame.error_contains_existing_team_name) {
    return (
      `Frame "error_shown": error_contains_existing_team_name should be true. ` +
      `Got: ${frame.error_contains_existing_team_name}`
    );
  }
  return null;
}

// ── [T4] Standing pool unaffected by conflict ────────────────────

/**
 * Asserts that the standing pool remains idle and unaffected after a
 * non-standing team conflict.
 * Returns null on pass, error string on fail.
 */
export function assertStandingPoolUnaffectedByConflict(): string | null {
  const frame = getFrame('standing_pool_unaffected') as StandingPoolUnaffectedFrame;
  if (frame.affected_by_conflict !== false) {
    return (
      `Frame "standing_pool_unaffected": affected_by_conflict should be false. ` +
      `Got: ${frame.affected_by_conflict}`
    );
  }
  if (frame.pool_state !== 'idle') {
    return (
      `Frame "standing_pool_unaffected": pool_state should be "idle" after non-standing conflict. ` +
      `Got: "${frame.pool_state}"`
    );
  }
  return null;
}

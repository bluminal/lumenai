/**
 * Layer 1: One-team-per-session standing pool exemption fixture tests (FR-MMT26).
 *
 * Validates the synthetic scenario in
 * tests/fixtures/multi-model-teams/failure-handling/one-team-per-session/fixture.json.
 *
 * Acceptance criteria coverage:
 *   [T1] Standing pool + non-standing team coexist (spawn_allowed: true when standing pool is active)
 *   [T2] Second non-standing team spawn aborts (spawn_allowed: false)
 *   [T3] Original error message unchanged — starts with "Error: An active team"
 *   [T4] Standing pool unaffected by the non-standing conflict (affected_by_conflict: false)
 */

import { describe, it, expect } from 'vitest';
import {
  frames,
  getFrame,
  FRAME_NAMES,
  assertStandingPoolAndNonStandingCoexist,
  assertSecondNonStandingSpawnAborts,
  assertOriginalErrorMessageUnchanged,
  assertStandingPoolUnaffectedByConflict,
} from '../fixtures/multi-model-teams/failure-handling/one-team-per-session/assertions.js';
import type {
  StandingPoolActiveFrame,
  FirstNonStandingSpawnedFrame,
  SecondNonStandingAttemptFrame,
  ErrorShownFrame,
  StandingPoolUnaffectedFrame,
} from '../fixtures/multi-model-teams/failure-handling/one-team-per-session/assertions.js';

// ── Fixture sanity ────────────────────────────────────────────────

describe('one-team-per-session fixture — structure', () => {
  it('has exactly 5 frames in the expected order', () => {
    expect(frames).toHaveLength(FRAME_NAMES.length);
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      expect(frames[i].frame).toBe(FRAME_NAMES[i]);
    }
  });

  it('every frame has required fixture fields', () => {
    for (const frame of frames) {
      expect(frame).toHaveProperty('frame');
      expect(frame).toHaveProperty('description');
      expect(frame).toHaveProperty('assertion');
      expect(typeof frame.frame).toBe('string');
      expect(typeof frame.description).toBe('string');
      expect(typeof frame.assertion).toBe('string');
      expect(frame.assertion.length).toBeGreaterThan(0);
    }
  });

  it('all frames share the same session_id', () => {
    const sessionIds = frames.map((f) => (f as { session_id?: string }).session_id);
    const unique = new Set(sessionIds.filter(Boolean));
    expect(unique.size).toBe(1);
  });
});

// ── [T1] Standing pool + non-standing team coexist ───────────────

describe('[T1] standing pool + non-standing team coexist (FR-MMT26 exemption)', () => {
  it('spawn_allowed is true when only a standing pool is active (frame 2)', () => {
    const error = assertStandingPoolAndNonStandingCoexist();
    expect(error).toBeNull();
  });

  it('first_non_standing_spawned frame has spawn_allowed: true', () => {
    const frame = getFrame('first_non_standing_spawned') as FirstNonStandingSpawnedFrame;
    expect(frame.spawn_allowed).toBe(true);
  });

  it('first_non_standing_spawned frame has session_team_count_non_standing: 1', () => {
    const frame = getFrame('first_non_standing_spawned') as FirstNonStandingSpawnedFrame;
    expect(frame.session_team_count_non_standing).toBe(1);
  });

  it('standing_pool_active frame has session_team_count_non_standing: 0', () => {
    const frame = getFrame('standing_pool_active') as StandingPoolActiveFrame;
    expect(frame.session_team_count_non_standing).toBe(0);
  });

  it('standing pool is pool_type: "standing"', () => {
    const frame = getFrame('standing_pool_active') as StandingPoolActiveFrame;
    expect(frame.pool_type).toBe('standing');
  });

  it('non-standing team is team_type: "non-standing"', () => {
    const frame = getFrame('first_non_standing_spawned') as FirstNonStandingSpawnedFrame;
    expect(frame.team_type).toBe('non-standing');
  });
});

// ── [T2] Second non-standing spawn aborts ────────────────────────

describe('[T2] second non-standing team spawn aborts', () => {
  it('spawn_allowed is false when session_team_count_non_standing is already 1 (frame 3)', () => {
    const error = assertSecondNonStandingSpawnAborts();
    expect(error).toBeNull();
  });

  it('second_non_standing_attempt frame has spawn_allowed: false', () => {
    const frame = getFrame('second_non_standing_attempt') as SecondNonStandingAttemptFrame;
    expect(frame.spawn_allowed).toBe(false);
  });

  it('second_non_standing_attempt frame still has session_team_count_non_standing: 1 (count does not increment on abort)', () => {
    const frame = getFrame('second_non_standing_attempt') as SecondNonStandingAttemptFrame;
    expect(frame.session_team_count_non_standing).toBe(1);
  });
});

// ── [T3] Original error message unchanged ────────────────────────

describe('[T3] original non-standing conflict error message is unchanged (FR-MMT26 criterion 3)', () => {
  it('error message starts with "Error: An active team" (frame 4)', () => {
    const error = assertOriginalErrorMessageUnchanged();
    expect(error).toBeNull();
  });

  it('error_message_prefix is exactly "Error: An active team"', () => {
    const frame = getFrame('error_shown') as ErrorShownFrame;
    expect(frame.error_message_prefix).toBe('Error: An active team');
  });

  it('error_contains_existing_team_name is true', () => {
    const frame = getFrame('error_shown') as ErrorShownFrame;
    expect(frame.error_contains_existing_team_name).toBe(true);
  });

  it('existing_team_name is the first non-standing team that was spawned', () => {
    const errorFrame = getFrame('error_shown') as ErrorShownFrame;
    const spawnFrame = getFrame('first_non_standing_spawned') as FirstNonStandingSpawnedFrame;
    expect(errorFrame.existing_team_name).toBe(spawnFrame.team_name);
  });
});

// ── [T4] Standing pool unaffected by conflict ────────────────────

describe('[T4] standing pool unaffected by non-standing team conflict (frame 5)', () => {
  it('affected_by_conflict is false after non-standing conflict', () => {
    const error = assertStandingPoolUnaffectedByConflict();
    expect(error).toBeNull();
  });

  it('standing_pool_unaffected frame has pool_state: "idle"', () => {
    const frame = getFrame('standing_pool_unaffected') as StandingPoolUnaffectedFrame;
    expect(frame.pool_state).toBe('idle');
  });

  it('standing_pool_unaffected frame has affected_by_conflict: false', () => {
    const frame = getFrame('standing_pool_unaffected') as StandingPoolUnaffectedFrame;
    expect(frame.affected_by_conflict).toBe(false);
  });

  it('pool name is consistent across standing_pool_active and standing_pool_unaffected', () => {
    const activeFrame = getFrame('standing_pool_active') as StandingPoolActiveFrame;
    const unaffectedFrame = getFrame('standing_pool_unaffected') as StandingPoolUnaffectedFrame;
    expect(unaffectedFrame.pool_name).toBe(activeFrame.pool_name);
  });
});

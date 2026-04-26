/**
 * Layer 1: Stale-pool failure-handling fixture tests (FR-MMT22).
 *
 * Covers 6 sub-scenarios:
 *   (a) metadata-dir-missing     — FR-MMT22 Condition 1 triggers cleanup + warning
 *   (b) last-active-stale        — FR-MMT22 Condition 2 triggers cleanup + warning
 *   (c) warning-once-per-session — warning fires once per pool; different pools each get one
 *   (d) prefer-with-fallback-continues — after cleanup, routing falls back silently
 *   (e) explicit-pool-required-aborts  — after cleanup, routing aborts with error
 *   (f) fr-mmt22-vs-fr-mmt28-distinct  — FR-MMT22 and FR-MMT28 warning strings are non-equal
 */

import { describe, it, expect } from 'vitest';

import {
  frames as framesA,
  getFrame as getFrameA,
  FRAME_NAMES as FRAME_NAMES_A,
  assertCondition1Detection,
  assertCleanupResult as assertCleanupResultA,
  assertWarningText as assertWarningTextA,
} from '../fixtures/multi-model-teams/failure-handling/stale-pool/metadata-dir-missing/assertions.js';

import {
  frames as framesB,
  getFrame as getFrameB,
  FRAME_NAMES as FRAME_NAMES_B,
  assertCondition2Detection,
  assertStalenessExceeds24hFloor,
  assertFullCleanup,
  assertWarningText as assertWarningTextB,
} from '../fixtures/multi-model-teams/failure-handling/stale-pool/last-active-stale/assertions.js';

import {
  frames as framesC,
  getFrame as getFrameC,
  FRAME_NAMES as FRAME_NAMES_C,
  assertFirstEncounterWarns,
  assertDifferentPoolStillWarns,
  assertReEncounterSuppressed,
} from '../fixtures/multi-model-teams/failure-handling/stale-pool/warning-once-per-session/assertions.js';

import {
  frames as framesD,
  getFrame as getFrameD,
  FRAME_NAMES as FRAME_NAMES_D,
  assertRoutingMode as assertRoutingModeD,
  assertSilentFallback,
  assertFreshSpawnStarted,
} from '../fixtures/multi-model-teams/failure-handling/stale-pool/prefer-with-fallback-continues/assertions.js';

import {
  frames as framesE,
  getFrame as getFrameE,
  FRAME_NAMES as FRAME_NAMES_E,
  assertRoutingMode as assertRoutingModeE,
  assertAbortWithError,
  assertCommandAborted,
} from '../fixtures/multi-model-teams/failure-handling/stale-pool/explicit-pool-required-aborts/assertions.js';

import {
  frames as framesF,
  getFrame as getFrameF,
  FRAME_NAMES as FRAME_NAMES_F,
  getMmt22WarningText,
  getMmt28WarningText,
  assertBothWarningsAreStrings,
  assertWarningsAreDistinct,
} from '../fixtures/multi-model-teams/failure-handling/stale-pool/fr-mmt22-vs-fr-mmt28-distinct/assertions.js';

// ── (a) metadata-dir-missing ─────────────────────────────────────────────────

describe('(a) metadata-dir-missing — FR-MMT22 Condition 1', () => {

  describe('fixture structure', () => {
    it('has exactly 4 frames in the expected order', () => {
      expect(framesA).toHaveLength(FRAME_NAMES_A.length);
      for (let i = 0; i < FRAME_NAMES_A.length; i++) {
        expect(framesA[i].frame).toBe(FRAME_NAMES_A[i]);
      }
    });

    it('every frame has required fields: frame, description, state, assertion', () => {
      for (const frame of framesA) {
        expect(frame).toHaveProperty('frame');
        expect(frame).toHaveProperty('description');
        expect(frame).toHaveProperty('state');
        expect(frame).toHaveProperty('assertion');
        expect(typeof frame.frame).toBe('string');
        expect(typeof frame.state).toBe('object');
      }
    });
  });

  describe('FR-MMT22 Condition 1 — metadata_dir missing', () => {
    it('discovery_started: metadata_dir_exists is false', () => {
      const frame = getFrameA('discovery_started');
      expect(frame.state['metadata_dir_exists']).toBe(false);
    });

    it('discovery_started: index_json_pools has review-pool entry', () => {
      const frame = getFrameA('discovery_started');
      const pools = frame.state['index_json_pools'] as Array<Record<string, unknown>>;
      expect(pools).toHaveLength(1);
      expect(pools[0]['name']).toBe('review-pool');
      expect(pools[0]['pool_state']).toBe('idle');
    });

    it('stale_detected: detection_reason is metadata-missing (Condition 1)', () => {
      const error = assertCondition1Detection();
      expect(error).toBeNull();
    });

    it('stale_detected: pool_name is review-pool', () => {
      const frame = getFrameA('stale_detected');
      expect(frame.state['pool_name']).toBe('review-pool');
    });
  });

  describe('cleanup result', () => {
    it('cleanup_invoked: result is "removed"', () => {
      const error = assertCleanupResultA();
      expect(error).toBeNull();
    });

    it('cleanup_invoked: removed_index_entry is true', () => {
      const frame = getFrameA('cleanup_invoked');
      const result = frame.state['cleanup_result'] as Record<string, unknown>;
      expect(result['removed_index_entry']).toBe(true);
    });

    it('cleanup_invoked: removed_metadata_dir is false (dir absent)', () => {
      const frame = getFrameA('cleanup_invoked');
      const result = frame.state['cleanup_result'] as Record<string, unknown>;
      expect(result['removed_metadata_dir']).toBe(false);
    });
  });

  describe('FR-MMT22 warning text', () => {
    it('warning_shown: warning_shown is true', () => {
      const error = assertWarningTextA();
      expect(error).toBeNull();
    });

    it('warning_shown: warning_text contains "Standing pool \'"', () => {
      const frame = getFrameA('warning_shown');
      expect(frame.state['warning_text']).toContain("Standing pool '");
    });

    it('warning_shown: warning_text contains "was stale and has been cleaned up."', () => {
      const frame = getFrameA('warning_shown');
      expect(frame.state['warning_text']).toContain('was stale and has been cleaned up.');
    });
  });
});

// ── (b) last-active-stale ────────────────────────────────────────────────────

describe('(b) last-active-stale — FR-MMT22 Condition 2', () => {

  describe('fixture structure', () => {
    it('has exactly 4 frames in the expected order', () => {
      expect(framesB).toHaveLength(FRAME_NAMES_B.length);
      for (let i = 0; i < FRAME_NAMES_B.length; i++) {
        expect(framesB[i].frame).toBe(FRAME_NAMES_B[i]);
      }
    });
  });

  describe('FR-MMT22 Condition 2 — last_active_at stale', () => {
    it('discovery_started: old-pool listed as idle with stale last_active_at', () => {
      const frame = getFrameB('discovery_started');
      const pools = frame.state['index_json_pools'] as Array<Record<string, unknown>>;
      expect(pools[0]['name']).toBe('old-pool');
      expect(pools[0]['pool_state']).toBe('idle');
    });

    it('staleness exceeds max(ttl_minutes, 24h) floor', () => {
      const error = assertStalenessExceeds24hFloor();
      expect(error).toBeNull();
    });

    it('stale_detected: detection_reason is last-active-stale (Condition 2)', () => {
      const error = assertCondition2Detection();
      expect(error).toBeNull();
    });

    it('stale_detected: pool_name is old-pool', () => {
      const frame = getFrameB('stale_detected');
      expect(frame.state['pool_name']).toBe('old-pool');
    });

    it('stale_detected: hours_inactive is 56 (> 24h floor)', () => {
      const frame = getFrameB('stale_detected');
      expect(frame.state['hours_inactive']).toBe(56);
    });
  });

  describe('cleanup result', () => {
    it('cleanup_invoked: both index entry and metadata_dir removed', () => {
      const error = assertFullCleanup();
      expect(error).toBeNull();
    });

    it('cleanup_invoked: removed_metadata_dir is true (dir existed)', () => {
      const frame = getFrameB('cleanup_invoked');
      const result = frame.state['cleanup_result'] as Record<string, unknown>;
      expect(result['removed_metadata_dir']).toBe(true);
    });
  });

  describe('FR-MMT22 warning text', () => {
    it('warning_shown: warning_shown is true', () => {
      const error = assertWarningTextB();
      expect(error).toBeNull();
    });

    it('warning_shown: warning_text contains "Standing pool \'"', () => {
      const frame = getFrameB('warning_shown');
      expect(frame.state['warning_text']).toContain("Standing pool '");
    });

    it('warning_shown: warning_text contains "was stale and has been cleaned up."', () => {
      const frame = getFrameB('warning_shown');
      expect(frame.state['warning_text']).toContain('was stale and has been cleaned up.');
    });
  });
});

// ── (c) warning-once-per-session ─────────────────────────────────────────────

describe('(c) warning-once-per-session — session marker suppresses duplicates', () => {

  describe('fixture structure', () => {
    it('has exactly 5 frames in the expected order', () => {
      expect(framesC).toHaveLength(FRAME_NAMES_C.length);
      for (let i = 0; i < FRAME_NAMES_C.length; i++) {
        expect(framesC[i].frame).toBe(FRAME_NAMES_C[i]);
      }
    });
  });

  describe('first encounter — warning fires, session marker set', () => {
    it('first_cleanup: warning_shown is true', () => {
      const error = assertFirstEncounterWarns();
      expect(error).toBeNull();
    });

    it('first_cleanup: session_marker_set is true', () => {
      const frame = getFrameC('first_cleanup');
      expect(frame.state['session_marker_set']).toBe(true);
    });

    it('first_cleanup: old-pool in session_warned_pools', () => {
      const frame = getFrameC('first_cleanup');
      const warned = frame.state['session_warned_pools'] as string[];
      expect(warned).toContain('old-pool');
    });
  });

  describe('second encounter (different pool) — warning fires separately', () => {
    it('second_cleanup: warning_shown is true for other-pool', () => {
      const error = assertDifferentPoolStillWarns();
      expect(error).toBeNull();
    });

    it('second_cleanup: pool_name is other-pool', () => {
      const frame = getFrameC('second_cleanup');
      expect(frame.state['pool_name']).toBe('other-pool');
    });

    it('second_cleanup: both pools in session_warned_pools', () => {
      const frame = getFrameC('second_cleanup');
      const warned = frame.state['session_warned_pools'] as string[];
      expect(warned).toContain('old-pool');
      expect(warned).toContain('other-pool');
    });
  });

  describe('re-encounter of same pool — warning suppressed', () => {
    it('third_discovery: warning_shown is false (session marker suppresses duplicate)', () => {
      const error = assertReEncounterSuppressed();
      expect(error).toBeNull();
    });

    it('third_discovery: suppressed_by_session_marker is true', () => {
      const frame = getFrameC('third_discovery');
      expect(frame.state['suppressed_by_session_marker']).toBe(true);
    });
  });
});

// ── (d) prefer-with-fallback-continues ───────────────────────────────────────

describe('(d) prefer-with-fallback-continues — silent fallback after cleanup', () => {

  describe('fixture structure', () => {
    it('has exactly 4 frames in the expected order', () => {
      expect(framesD).toHaveLength(FRAME_NAMES_D.length);
      for (let i = 0; i < FRAME_NAMES_D.length; i++) {
        expect(framesD[i].frame).toBe(FRAME_NAMES_D[i]);
      }
    });
  });

  describe('routing mode', () => {
    it('discovery_started: routing_mode is prefer-with-fallback', () => {
      const error = assertRoutingModeD();
      expect(error).toBeNull();
    });
  });

  describe('fallback semantics', () => {
    it('routing_fallback: routing_decision is fell-back-no-pool', () => {
      const error = assertSilentFallback();
      expect(error).toBeNull();
    });

    it('routing_fallback: error_shown is false (prefer-with-fallback does not abort)', () => {
      const frame = getFrameD('routing_fallback');
      expect(frame.state['error_shown']).toBe(false);
    });

    it('routing_fallback: silent is true', () => {
      const frame = getFrameD('routing_fallback');
      expect(frame.state['silent']).toBe(true);
    });
  });

  describe('fresh spawn', () => {
    it('fresh_review_spawned: result is fresh_spawn_started', () => {
      const error = assertFreshSpawnStarted();
      expect(error).toBeNull();
    });
  });
});

// ── (e) explicit-pool-required-aborts ────────────────────────────────────────

describe('(e) explicit-pool-required-aborts — abort with error after cleanup', () => {

  describe('fixture structure', () => {
    it('has exactly 4 frames in the expected order', () => {
      expect(framesE).toHaveLength(FRAME_NAMES_E.length);
      for (let i = 0; i < FRAME_NAMES_E.length; i++) {
        expect(framesE[i].frame).toBe(FRAME_NAMES_E[i]);
      }
    });
  });

  describe('routing mode', () => {
    it('discovery_started: routing_mode is explicit-pool-required', () => {
      const error = assertRoutingModeE();
      expect(error).toBeNull();
    });
  });

  describe('abort semantics', () => {
    it('routing_abort: routing_decision is fell-back-no-pool', () => {
      const error = assertAbortWithError();
      expect(error).toBeNull();
    });

    it('routing_abort: abort is true', () => {
      const frame = getFrameE('routing_abort');
      expect(frame.state['abort']).toBe(true);
    });

    it('routing_abort: error_shown is true', () => {
      const frame = getFrameE('routing_abort');
      expect(frame.state['error_shown']).toBe(true);
    });

    it('routing_abort: error_text_contains includes "No standing pool matches"', () => {
      const frame = getFrameE('routing_abort');
      const errorContains = frame.state['error_text_contains'] as string;
      expect(errorContains).toContain('No standing pool matches');
    });
  });

  describe('command result', () => {
    it('command_aborted: result is aborted', () => {
      const error = assertCommandAborted();
      expect(error).toBeNull();
    });
  });
});

// ── (f) fr-mmt22-vs-fr-mmt28-distinct ────────────────────────────────────────

describe('(f) fr-mmt22-vs-fr-mmt28-distinct — warning strings are non-equal', () => {

  describe('fixture structure', () => {
    it('has exactly 2 frames in the expected order', () => {
      expect(framesF).toHaveLength(FRAME_NAMES_F.length);
      for (let i = 0; i < FRAME_NAMES_F.length; i++) {
        expect(framesF[i].frame).toBe(FRAME_NAMES_F[i]);
      }
    });
  });

  describe('warning text integrity', () => {
    it('both warning texts are non-empty strings', () => {
      const error = assertBothWarningsAreStrings();
      expect(error).toBeNull();
    });

    it('FR-MMT22 warning_source is "FR-MMT22"', () => {
      const frame = getFrameF('fr_mmt22_warning');
      expect(frame.state['warning_source']).toBe('FR-MMT22');
    });

    it('FR-MMT28 warning_source is "FR-MMT28"', () => {
      const frame = getFrameF('fr_mmt28_warning');
      expect(frame.state['warning_source']).toBe('FR-MMT28');
    });
  });

  describe('non-equality assertion', () => {
    it('FR-MMT22 and FR-MMT28 warning_text values are strictly non-equal', () => {
      const error = assertWarningsAreDistinct();
      expect(error).toBeNull();
    });

    it('FR-MMT22 warning_text !== FR-MMT28 warning_text (direct comparison)', () => {
      const mmt22 = getMmt22WarningText();
      const mmt28 = getMmt28WarningText();
      expect(mmt22).not.toBe(mmt28);
    });
  });

  describe('FR-MMT22 warning fragments', () => {
    it('FR-MMT22 warning_text contains "Standing pool \'"', () => {
      expect(getMmt22WarningText()).toContain("Standing pool '");
    });

    it('FR-MMT22 warning_text contains "was stale and has been cleaned up."', () => {
      expect(getMmt22WarningText()).toContain('was stale and has been cleaned up.');
    });
  });

  describe('FR-MMT28 warning fragments', () => {
    it('FR-MMT28 warning_text contains "appears orphaned"', () => {
      expect(getMmt28WarningText()).toContain('appears orphaned');
    });

    it('FR-MMT28 warning_text does not contain "was stale and has been cleaned up."', () => {
      expect(getMmt28WarningText()).not.toContain('was stale and has been cleaned up.');
    });
  });
});

/**
 * Layer 1: Idle-and-claim pool lifecycle fixture tests.
 *
 * Validates the synthetic filesystem snapshot in
 * tests/fixtures/multi-model-teams/pool-lifecycle/idle-and-claim/fixture.json
 * against the normative schema and state machine from
 * docs/specs/multi-model-teams/pool-lifecycle.md.
 *
 * Acceptance criteria coverage:
 *   [T1] last_active_at is strictly non-decreasing across all frames
 *   [T2] pool_state transitions match expected sequence: idle→idle→idle→idle→active→idle→idle
 *   [T3] Pool does NOT shut down when task list empties (idle-after-empty has pool_state: idle)
 *   [T4] Each frame's config_json passes validatePoolConfig
 *   [T5] Each frame's index_json passes validatePoolIndex
 */

import { describe, it, expect } from 'vitest';
import { validatePoolConfig } from './standing-pool-config.js';
import { validatePoolIndex } from './standing-pool-index.js';
import {
  frames,
  getFrame,
  getLastActiveAt,
  assertMonotonicLastActiveAt,
  assertPoolStateSequence,
  assertAllFramesPassSchema,
  assertPoolDoesNotShutdownOnEmptyTaskList,
  assertDebounceDoesNotRegress,
  EXPECTED_POOL_STATE_SEQUENCE,
  FRAME_NAMES,
} from '../fixtures/multi-model-teams/pool-lifecycle/idle-and-claim/assertions.js';

// ── Fixture sanity ────────────────────────────────────────────────

describe('idle-and-claim fixture — structure', () => {
  it('has exactly 7 frames in the expected order', () => {
    expect(frames).toHaveLength(FRAME_NAMES.length);
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      expect(frames[i].frame).toBe(FRAME_NAMES[i]);
    }
  });

  it('every frame has required fixture fields', () => {
    for (const frame of frames) {
      expect(frame).toHaveProperty('frame');
      expect(frame).toHaveProperty('description');
      expect(frame).toHaveProperty('config_json');
      expect(frame).toHaveProperty('index_json');
      expect(frame).toHaveProperty('assertion');
      expect(typeof frame.frame).toBe('string');
      expect(typeof frame.description).toBe('string');
      expect(typeof frame.config_json).toBe('object');
      expect(typeof frame.index_json).toBe('object');
    }
  });
});

// ── [T1] last_active_at monotonically non-decreasing ─────────────

describe('[T1] last_active_at — monotonically non-decreasing across all frames', () => {
  it('no frame regresses last_active_at below the previous frame', () => {
    const violations = assertMonotonicLastActiveAt();
    expect(violations).toHaveLength(0);
  });

  it('T0 (spawn) <= T1 (idle-hook-fires-1)', () => {
    const t0 = getLastActiveAt(getFrame('spawn'));
    const t1 = getLastActiveAt(getFrame('idle-hook-fires-1'));
    expect(t1.getTime()).toBeGreaterThan(t0.getTime());
  });

  it('T1 (idle-hook-fires-1) <= T2 (idle-hook-fires-2)', () => {
    const t1 = getLastActiveAt(getFrame('idle-hook-fires-1'));
    const t2 = getLastActiveAt(getFrame('idle-hook-fires-2'));
    expect(t2.getTime()).toBeGreaterThan(t1.getTime());
  });

  it('T2 = T2 (debounce-skip does not change last_active_at)', () => {
    const t2Before = getLastActiveAt(getFrame('idle-hook-fires-2'));
    const t2After = getLastActiveAt(getFrame('debounce-skip'));
    // debounce: value unchanged (neither advances nor regresses)
    expect(t2After.getTime()).toBe(t2Before.getTime());
  });

  it('T2 (debounce-skip) <= T3 (task-claimed)', () => {
    const t2 = getLastActiveAt(getFrame('debounce-skip'));
    const t3 = getLastActiveAt(getFrame('task-claimed'));
    expect(t3.getTime()).toBeGreaterThanOrEqual(t2.getTime());
  });

  it('T3 (task-claimed) <= T4 (task-complete)', () => {
    const t3 = getLastActiveAt(getFrame('task-claimed'));
    const t4 = getLastActiveAt(getFrame('task-complete'));
    expect(t4.getTime()).toBeGreaterThanOrEqual(t3.getTime());
  });

  it('T4 = T4 (idle-after-empty does not change last_active_at)', () => {
    const t4AfterTask = getLastActiveAt(getFrame('task-complete'));
    const t4AfterIdle = getLastActiveAt(getFrame('idle-after-empty'));
    // no new writes after task completes — value stays the same
    expect(t4AfterIdle.getTime()).toBe(t4AfterTask.getTime());
  });
});

// ── [T2] pool_state transition sequence ──────────────────────────

describe('[T2] pool_state — transitions match expected sequence', () => {
  it('sequence is: idle→idle→idle→idle→active→idle→idle', () => {
    const violations = assertPoolStateSequence();
    expect(violations).toHaveLength(0);
  });

  it.each(
    FRAME_NAMES.map((name, i) => ({ name, expected: EXPECTED_POOL_STATE_SEQUENCE[i] }))
  )('frame "$name" has pool_state: "$expected"', ({ name, expected }) => {
    const frame = getFrame(name);
    expect(frame.config_json['pool_state']).toBe(expected);
    expect(frame.index_json['pools'][0]['pool_state']).toBe(expected);
  });

  it('config_json and index_json pool_state are in sync for every frame', () => {
    for (const frame of frames) {
      const configState = frame.config_json['pool_state'];
      const indexState = frame.index_json['pools'][0]['pool_state'];
      expect(configState).toBe(indexState);
    }
  });
});

// ── [T3] Pool does NOT shut down when task list empties ───────────

describe('[T3] pool does NOT shut down when task list empties', () => {
  it('idle-after-empty frame has pool_state: idle (not draining or stopping)', () => {
    const error = assertPoolDoesNotShutdownOnEmptyTaskList();
    expect(error).toBeNull();
  });

  it('idle-after-empty pool_state is exactly "idle"', () => {
    const frame = getFrame('idle-after-empty');
    expect(frame.config_json['pool_state']).toBe('idle');
  });

  it('idle-after-empty pool_state is not "draining"', () => {
    const frame = getFrame('idle-after-empty');
    expect(frame.config_json['pool_state']).not.toBe('draining');
  });

  it('idle-after-empty pool_state is not "stopping"', () => {
    const frame = getFrame('idle-after-empty');
    expect(frame.config_json['pool_state']).not.toBe('stopping');
  });
});

// ── [T4] Each config_json passes validatePoolConfig ───────────────

describe('[T4] each frame config_json passes validatePoolConfig', () => {
  it.each(FRAME_NAMES)('frame "%s" config_json is valid', (frameName) => {
    const frame = getFrame(frameName);
    const result = validatePoolConfig(frame.config_json);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('no frame has config validation errors (aggregate check)', () => {
    const schemaResults = assertAllFramesPassSchema();
    for (const [frameName, result] of schemaResults) {
      expect(result.configErrors, `Frame "${frameName}" config errors`).toHaveLength(0);
    }
  });
});

// ── [T5] Each index_json passes validatePoolIndex ─────────────────

describe('[T5] each frame index_json passes validatePoolIndex', () => {
  it.each(FRAME_NAMES)('frame "%s" index_json is valid', (frameName) => {
    const frame = getFrame(frameName);
    const result = validatePoolIndex(frame.index_json);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('no frame has index validation errors (aggregate check)', () => {
    const schemaResults = assertAllFramesPassSchema();
    for (const [frameName, result] of schemaResults) {
      expect(result.indexErrors, `Frame "${frameName}" index errors`).toHaveLength(0);
    }
  });
});

// ── Debounce invariant ────────────────────────────────────────────

describe('debounce: write suppressed but value does not regress', () => {
  it('debounce-skip last_active_at equals idle-hook-fires-2 last_active_at', () => {
    const error = assertDebounceDoesNotRegress();
    expect(error).toBeNull();
  });
});

// ── config_json ↔ index_json denormalization consistency ──────────

describe('config_json and index_json are in sync on every frame', () => {
  it('last_active_at matches between config and index for every frame', () => {
    for (const frame of frames) {
      const configTs = frame.config_json['last_active_at'];
      const indexTs = frame.index_json['pools'][0]['last_active_at'];
      expect(configTs).toBe(indexTs);
    }
  });

  it('pool name matches between config and index for every frame', () => {
    for (const frame of frames) {
      const configName = frame.config_json['name'];
      const indexName = frame.index_json['pools'][0]['name'];
      expect(configName).toBe(indexName);
    }
  });
});

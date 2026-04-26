/**
 * Layer 1: Draining-state-transition pool lifecycle fixture tests.
 *
 * Tests the Pool Lead's draining state transition scenario:
 *   spawn → task-claimed → ttl-fires-draining → new-task-rejected
 *   → in-flight-completes → stopping → removed
 *
 * FR coverage:
 *   FR-MMT14 criterion 1: in-flight task completes before pool shuts down
 *   FR-MMT14 criterion 2: pool_state: draining visible during drain window
 *   FR-MMT14 Pool Lead side: refuses new task after TTL fires
 *   stopping → removed: index entry absent post-shutdown
 */

import { describe, it, expect } from 'vitest';
import { validatePoolConfig } from './standing-pool-config.js';
import { validatePoolIndex } from './standing-pool-index.js';
import {
  fixture,
  getFrame,
  assertDrainingPersistsUntilInflightComplete,
  assertDrainingVisibleInBothDocuments,
  assertNewTaskUnownedDuringDrain,
  assertIndexEntryRemoved,
  validateAllConfigFrames,
  validateAllIndexFrames,
} from '../fixtures/multi-model-teams/pool-lifecycle/draining-state-transition/assertions.js';

// ── Fixture sanity ────────────────────────────────────────────────

describe('Draining-state-transition fixture — frame structure', () => {
  it('fixture contains all expected frames in order', () => {
    const names = fixture.map((f) => f.frame);
    expect(names).toEqual([
      'spawn',
      'task-claimed',
      'ttl-fires-draining',
      'new-task-rejected',
      'in-flight-completes',
      'stopping',
      'removed',
    ]);
  });

  it('all frames have an assertion field', () => {
    for (const frame of fixture) {
      expect(typeof frame.assertion).toBe('string');
      expect(frame.assertion.length).toBeGreaterThan(0);
    }
  });
});

// ── [T] FR-MMT14 criterion 1: in-flight task completes before pool shuts down ──

describe('[T] In-flight task completes before pool shuts down (FR-MMT14 criterion 1)', () => {
  it('draining persists through in-flight-completes frame; stopping only appears after', () => {
    const result = assertDrainingPersistsUntilInflightComplete();
    expect(result.stoppingFrameIndex).toBeGreaterThan(result.lastDrainingFrameIndex);
  });

  it('ttl-fires-draining frame has pool_state: draining', () => {
    const frame = getFrame('ttl-fires-draining');
    expect(frame.config_json?.pool_state).toBe('draining');
  });

  it('in-flight-completes frame has pool_state: draining (not yet stopping)', () => {
    const frame = getFrame('in-flight-completes');
    expect(frame.config_json?.pool_state).toBe('draining');
  });

  it('stopping frame has pool_state: stopping (only after task completes)', () => {
    const frame = getFrame('stopping');
    expect(frame.config_json?.pool_state).toBe('stopping');
  });

  it('task-001 is completed in the in-flight-completes frame', () => {
    const frame = getFrame('in-flight-completes');
    type Task = { id: string; status: string };
    const tasks = (frame as { tasks?: Task[] }).tasks ?? [];
    const task001 = tasks.find((t) => t.id === 'task-001');
    expect(task001).toBeDefined();
    expect(task001?.status).toBe('completed');
  });
});

// ── [T] FR-MMT14 criterion 2: pool_state: draining visible during drain window ──

describe('[T] pool_state: draining visible during drain window (FR-MMT14 criterion 2)', () => {
  it('ttl-fires-draining frame has pool_state: draining in config_json', () => {
    const result = assertDrainingVisibleInBothDocuments();
    expect(result.configState).toBe('draining');
  });

  it('ttl-fires-draining frame has pool_state: draining in index_json', () => {
    const result = assertDrainingVisibleInBothDocuments();
    expect(result.indexState).toBe('draining');
  });

  it('index_json entry matches config_json pool_state in ttl-fires-draining frame', () => {
    const frame = getFrame('ttl-fires-draining');
    type IndexJson = { pools: Array<{ pool_state: string }> };
    const indexEntry = (frame.index_json as IndexJson | null)?.pools?.[0];
    expect(indexEntry?.pool_state).toBe(frame.config_json?.pool_state);
  });
});

// ── [T] Pool Lead transitions to draining and refuses new task assignment ──

describe('[T] Pool Lead in draining state refuses new task assignment after TTL fires', () => {
  it('new-task-rejected frame has pool_state: draining', () => {
    const result = assertNewTaskUnownedDuringDrain();
    expect(result.poolState).toBe('draining');
  });

  it('task-002 has no owner in new-task-rejected frame (Pool Lead did not claim it)', () => {
    const result = assertNewTaskUnownedDuringDrain();
    expect(result.task002Owner).toBeUndefined();
  });

  it('task-002 status is pending (not in_progress) in new-task-rejected frame', () => {
    const frame = getFrame('new-task-rejected');
    type Task = { id: string; status: string; owner?: string };
    const tasks = (frame as { tasks?: Task[] }).tasks ?? [];
    const task002 = tasks.find((t) => t.id === 'task-002');
    expect(task002).toBeDefined();
    expect(task002?.status).toBe('pending');
    expect(task002?.owner).toBeUndefined();
  });

  it('task-001 remains in_progress during the drain window', () => {
    const frame = getFrame('new-task-rejected');
    type Task = { id: string; status: string };
    const tasks = (frame as { tasks?: Task[] }).tasks ?? [];
    const task001 = tasks.find((t) => t.id === 'task-001');
    expect(task001?.status).toBe('in_progress');
  });
});

// ── [T] Post-shutdown: index entry removed ────────────────────────

describe('[T] Post-shutdown: index entry removed, metadata dir cleaned up', () => {
  it('removed frame has null index_json (index entry absent)', () => {
    const result = assertIndexEntryRemoved();
    expect(result.indexJson).toBeNull();
  });

  it('removed frame has null config_json (metadata dir deleted)', () => {
    const frame = getFrame('removed');
    expect(frame.config_json).toBeNull();
  });

  it('removed frame assertion describes absence of pool from storage', () => {
    const frame = getFrame('removed');
    expect(frame.assertion).toMatch(/removed|absent/i);
  });
});

// ── Schema validation: all non-removed config frames pass validatePoolConfig ──

describe('Schema validation — config.json frames', () => {
  it('all non-removed frames pass validatePoolConfig', () => {
    const results = validateAllConfigFrames();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.errors, `Frame "${r.frame}" config errors: ${r.errors.join(', ')}`).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  it('spawn frame passes validatePoolConfig with pool_state: idle', () => {
    const frame = getFrame('spawn');
    const result = validatePoolConfig(frame.config_json);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('task-claimed frame passes validatePoolConfig with pool_state: active', () => {
    const frame = getFrame('task-claimed');
    const result = validatePoolConfig(frame.config_json);
    expect(result.valid).toBe(true);
  });

  it('ttl-fires-draining frame passes validatePoolConfig with pool_state: draining', () => {
    const frame = getFrame('ttl-fires-draining');
    const result = validatePoolConfig(frame.config_json);
    expect(result.valid).toBe(true);
  });

  it('stopping frame passes validatePoolConfig with pool_state: stopping', () => {
    const frame = getFrame('stopping');
    const result = validatePoolConfig(frame.config_json);
    expect(result.valid).toBe(true);
  });
});

// ── Schema validation: all non-removed, non-null index frames pass validatePoolIndex ──

describe('Schema validation — index.json frames', () => {
  it('all frames with non-null index_json pass validatePoolIndex', () => {
    const results = validateAllIndexFrames();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.errors, `Frame "${r.frame}" index errors: ${r.errors.join(', ')}`).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  it('spawn frame index_json passes validatePoolIndex with pool_state: idle', () => {
    const frame = getFrame('spawn');
    const result = validatePoolIndex(frame.index_json);
    expect(result.valid).toBe(true);
  });

  it('ttl-fires-draining frame index_json passes validatePoolIndex with pool_state: draining', () => {
    const frame = getFrame('ttl-fires-draining');
    const result = validatePoolIndex(frame.index_json);
    expect(result.valid).toBe(true);
  });

  it('stopping frame index_json passes validatePoolIndex with pool_state: stopping', () => {
    const frame = getFrame('stopping');
    const result = validatePoolIndex(frame.index_json);
    expect(result.valid).toBe(true);
  });
});

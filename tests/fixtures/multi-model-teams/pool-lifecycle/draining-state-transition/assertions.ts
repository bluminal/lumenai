/**
 * Assertion helpers for the draining-state-transition pool lifecycle fixture.
 *
 * Imports the fixture frames and the config/index validators, then exports
 * named assertion functions used by the Vitest test suite.
 */

import fixture from './fixture.json' assert { type: 'json' };
import { validatePoolConfig } from '../../../../schemas/standing-pool-config.js';
import { validatePoolIndex } from '../../../../schemas/standing-pool-index.js';

// ── Re-export fixture for test suite use ─────────────────────────

export { fixture };

// ── Frame accessors ───────────────────────────────────────────────

type Frame = typeof fixture[number];

export function getFrame(name: string): Frame {
  const frame = fixture.find((f) => f.frame === name);
  if (!frame) throw new Error(`Frame "${name}" not found in fixture`);
  return frame;
}

export function getFrameIndex(name: string): number {
  const idx = fixture.findIndex((f) => f.frame === name);
  if (idx === -1) throw new Error(`Frame "${name}" not found in fixture`);
  return idx;
}

// ── Sequence assertion: draining persists while in-flight, then stopping ──

/**
 * FR-MMT14 criterion 1: In-flight task completes before pool shuts down.
 *
 * Validates that the fixture sequence shows:
 * - `draining` persists through the "in-flight-completes" frame (task still in drain)
 * - `stopping` appears only AFTER the in-flight task is completed
 */
export function assertDrainingPersistsUntilInflightComplete(): {
  drainingFrames: string[];
  stoppingFrameIndex: number;
  lastDrainingFrameIndex: number;
} {
  const drainingFrameNames = ['ttl-fires-draining', 'new-task-rejected', 'in-flight-completes'];
  const stoppingFrameName = 'stopping';

  const lastDrainingIdx = getFrameIndex('in-flight-completes');
  const stoppingIdx = getFrameIndex(stoppingFrameName);

  if (stoppingIdx <= lastDrainingIdx) {
    throw new Error(
      `stopping frame (${stoppingIdx}) must come after last draining frame (${lastDrainingIdx})`
    );
  }

  for (const name of drainingFrameNames) {
    const frame = getFrame(name);
    if (frame.config_json?.pool_state !== 'draining') {
      throw new Error(`Frame "${name}" expected pool_state: draining, got: ${frame.config_json?.pool_state}`);
    }
  }

  const stoppingFrame = getFrame(stoppingFrameName);
  if (stoppingFrame.config_json?.pool_state !== 'stopping') {
    throw new Error(`Frame "stopping" expected pool_state: stopping`);
  }

  return {
    drainingFrames: drainingFrameNames,
    stoppingFrameIndex: stoppingIdx,
    lastDrainingFrameIndex: lastDrainingIdx,
  };
}

// ── draining visible in both config and index during drain window ─

/**
 * FR-MMT14 criterion 2: pool_state: draining visible during drain window.
 *
 * Validates that the "ttl-fires-draining" frame has pool_state: "draining"
 * in both config_json and index_json (dual-write applied).
 */
export function assertDrainingVisibleInBothDocuments(): {
  configState: string | undefined;
  indexState: string | undefined;
} {
  const frame = getFrame('ttl-fires-draining');

  const configState = frame.config_json?.pool_state;
  const indexEntry = (frame.index_json as { pools?: Array<{ pool_state?: string }> } | null)?.pools?.[0];
  const indexState = indexEntry?.pool_state;

  if (configState !== 'draining') {
    throw new Error(`config_json.pool_state expected "draining", got "${configState}"`);
  }
  if (indexState !== 'draining') {
    throw new Error(`index_json.pools[0].pool_state expected "draining", got "${indexState}"`);
  }

  return { configState, indexState };
}

// ── Pool Lead refuses new task after TTL fires ────────────────────

/**
 * FR-MMT14 (Pool Lead side): draining pool refuses new task assignment.
 *
 * Validates that in the "new-task-rejected" frame:
 * - pool_state is "draining"
 * - task-002 has no owner field (Pool Lead did not claim it)
 */
export function assertNewTaskUnownedDuringDrain(): {
  poolState: string | undefined;
  task002Owner: string | undefined;
} {
  const frame = getFrame('new-task-rejected');
  const poolState = frame.config_json?.pool_state;

  type Task = { id: string; owner?: string };
  const tasks = (frame as { tasks?: Task[] }).tasks ?? [];
  const task002 = tasks.find((t) => t.id === 'task-002');

  if (poolState !== 'draining') {
    throw new Error(`new-task-rejected frame expected pool_state: draining, got: ${poolState}`);
  }
  if (!task002) {
    throw new Error('task-002 not found in new-task-rejected frame');
  }
  if ('owner' in task002) {
    throw new Error(`task-002 should be unowned, but has owner: ${task002.owner}`);
  }

  return { poolState, task002Owner: undefined };
}

// ── Post-shutdown: index entry removed ───────────────────────────

/**
 * FR-MMT14 criterion 4 / stopping → removed transition:
 * After Pool Lead exits, the index entry is absent (null index_json).
 */
export function assertIndexEntryRemoved(): { indexJson: null } {
  const frame = getFrame('removed');

  if (frame.index_json !== null) {
    throw new Error(`removed frame expected null index_json, got: ${JSON.stringify(frame.index_json)}`);
  }
  if (frame.config_json !== null) {
    throw new Error(`removed frame expected null config_json, got: ${JSON.stringify(frame.config_json)}`);
  }

  return { indexJson: null };
}

// ── Schema validation for all non-removed frames ─────────────────

/**
 * Validates config_json on all non-removed frames using validatePoolConfig.
 */
export function validateAllConfigFrames(): { frame: string; valid: boolean; errors: string[] }[] {
  return fixture
    .filter((f) => f.config_json !== null)
    .map((f) => {
      const result = validatePoolConfig(f.config_json);
      return { frame: f.frame, valid: result.valid, errors: result.errors };
    });
}

/**
 * Validates index_json on all frames with a non-null index using validatePoolIndex.
 */
export function validateAllIndexFrames(): { frame: string; valid: boolean; errors: string[] }[] {
  return fixture
    .filter((f) => f.index_json !== null)
    .map((f) => {
      const result = validatePoolIndex(f.index_json);
      return { frame: f.frame, valid: result.valid, errors: result.errors };
    });
}

/**
 * Assertion helpers for scenario (a): metadata-dir-missing.
 *
 * FR-MMT22 Condition 1 — pool found in index.json whose metadata_dir doesn't exist.
 */

import fixtureFrames from './fixture.json' assert { type: 'json' };

export interface StaleFrame {
  frame: string;
  description: string;
  state: Record<string, unknown>;
  assertion: string;
}

export const frames = fixtureFrames as StaleFrame[];

export function getFrame(name: string): StaleFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in metadata-dir-missing fixture`);
  return f;
}

export const FRAME_NAMES = [
  'discovery_started',
  'stale_detected',
  'cleanup_invoked',
  'warning_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

/** Asserts FR-MMT22 Condition 1 fires with correct detection_reason. */
export function assertCondition1Detection(): string | null {
  const frame = getFrame('stale_detected');
  const reason = frame.state['detection_reason'];
  if (reason !== 'metadata-missing') {
    return `Expected detection_reason "metadata-missing", got "${reason}"`;
  }
  return null;
}

/** Asserts cleanup result: index removed, metadata_dir not removed (dir absent). */
export function assertCleanupResult(): string | null {
  const frame = getFrame('cleanup_invoked');
  const result = frame.state['cleanup_result'] as Record<string, unknown>;
  if (result['result'] !== 'removed') {
    return `Expected cleanup result "removed", got "${result['result']}"`;
  }
  if (result['removed_index_entry'] !== true) {
    return `Expected removed_index_entry true, got ${result['removed_index_entry']}`;
  }
  if (result['removed_metadata_dir'] !== false) {
    return `Expected removed_metadata_dir false (dir absent), got ${result['removed_metadata_dir']}`;
  }
  return null;
}

/** Asserts warning text contains FR-MMT22 verbatim fragments. */
export function assertWarningText(): string | null {
  const frame = getFrame('warning_shown');
  const text = frame.state['warning_text'];
  if (typeof text !== 'string') {
    return `warning_text is not a string: ${JSON.stringify(text)}`;
  }
  if (!text.includes("Standing pool '")) {
    return `warning_text missing verbatim fragment "Standing pool '"`;
  }
  if (!text.includes('was stale and has been cleaned up.')) {
    return `warning_text missing verbatim fragment "was stale and has been cleaned up."`;
  }
  if (frame.state['warning_shown'] !== true) {
    return `warning_shown is not true`;
  }
  return null;
}

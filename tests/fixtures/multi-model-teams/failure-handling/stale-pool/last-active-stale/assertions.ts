/**
 * Assertion helpers for scenario (b): last-active-stale.
 *
 * FR-MMT22 Condition 2 — pool's last_active_at exceeds max(ttl_minutes, 24h).
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
  if (!f) throw new Error(`Frame "${name}" not found in last-active-stale fixture`);
  return f;
}

export const FRAME_NAMES = [
  'discovery_started',
  'stale_detected',
  'cleanup_invoked',
  'warning_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

/** Asserts FR-MMT22 Condition 2 fires with correct detection_reason and hours_inactive. */
export function assertCondition2Detection(): string | null {
  const frame = getFrame('stale_detected');
  const reason = frame.state['detection_reason'];
  if (reason !== 'last-active-stale') {
    return `Expected detection_reason "last-active-stale", got "${reason}"`;
  }
  const hours = frame.state['hours_inactive'];
  if (typeof hours !== 'number' || hours <= 24) {
    return `Expected hours_inactive > 24, got ${hours}`;
  }
  return null;
}

/** Asserts max(ttl_minutes, 24h) floor: last_active_at staleness exceeds 24h. */
export function assertStalenessExceeds24hFloor(): string | null {
  const discoveryFrame = getFrame('discovery_started');
  const state = discoveryFrame.state;

  const poolEntry = (state['index_json_pools'] as Array<Record<string, unknown>>)[0];
  const lastActiveAt = new Date(poolEntry['last_active_at'] as string);
  const now = new Date(state['now'] as string);
  const ttlMinutes = state['ttl_minutes'] as number;

  const thresholdMs = Math.max(ttlMinutes * 60 * 1000, 24 * 60 * 60 * 1000);
  const inactiveMs = now.getTime() - lastActiveAt.getTime();

  if (inactiveMs <= thresholdMs) {
    return (
      `Pool inactive for ${inactiveMs / 3600000}h should exceed threshold ` +
      `max(${ttlMinutes}min, 24h) = ${thresholdMs / 3600000}h`
    );
  }
  return null;
}

/** Asserts cleanup removes both index entry and metadata_dir. */
export function assertFullCleanup(): string | null {
  const frame = getFrame('cleanup_invoked');
  const result = frame.state['cleanup_result'] as Record<string, unknown>;
  if (result['result'] !== 'removed') {
    return `Expected cleanup result "removed", got "${result['result']}"`;
  }
  if (result['removed_index_entry'] !== true) {
    return `Expected removed_index_entry true`;
  }
  if (result['removed_metadata_dir'] !== true) {
    return `Expected removed_metadata_dir true (dir exists for Condition 2)`;
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

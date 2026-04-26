/**
 * Assertion helpers for scenario (c): warning-once-per-session.
 *
 * Same stale pool discovered twice: warning fires only once (session marker).
 * Different pool in same session: gets its own warning.
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
  if (!f) throw new Error(`Frame "${name}" not found in warning-once-per-session fixture`);
  return f;
}

export const FRAME_NAMES = [
  'first_discovery',
  'first_cleanup',
  'second_discovery',
  'second_cleanup',
  'third_discovery',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

/** Asserts first encounter shows warning and sets session marker. */
export function assertFirstEncounterWarns(): string | null {
  const frame = getFrame('first_cleanup');
  if (frame.state['warning_shown'] !== true) {
    return `first_cleanup: expected warning_shown true`;
  }
  if (frame.state['session_marker_set'] !== true) {
    return `first_cleanup: expected session_marker_set true`;
  }
  const warned = frame.state['session_warned_pools'] as string[];
  if (!warned.includes('old-pool')) {
    return `first_cleanup: expected old-pool in session_warned_pools`;
  }
  return null;
}

/** Asserts a different pool in the same session still gets its own warning. */
export function assertDifferentPoolStillWarns(): string | null {
  const frame = getFrame('second_cleanup');
  if (frame.state['warning_shown'] !== true) {
    return `second_cleanup: expected warning_shown true for other-pool`;
  }
  if (frame.state['pool_name'] !== 'other-pool') {
    return `second_cleanup: expected pool_name other-pool`;
  }
  const warned = frame.state['session_warned_pools'] as string[];
  if (!warned.includes('other-pool')) {
    return `second_cleanup: expected other-pool in session_warned_pools`;
  }
  return null;
}

/** Asserts re-encounter of same pool is suppressed by session marker. */
export function assertReEncounterSuppressed(): string | null {
  const frame = getFrame('third_discovery');
  if (frame.state['warning_shown'] !== false) {
    return `third_discovery: expected warning_shown false (suppressed)`;
  }
  if (frame.state['suppressed_by_session_marker'] !== true) {
    return `third_discovery: expected suppressed_by_session_marker true`;
  }
  return null;
}

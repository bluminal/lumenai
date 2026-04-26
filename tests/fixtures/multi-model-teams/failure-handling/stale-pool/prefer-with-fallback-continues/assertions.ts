/**
 * Assertion helpers for scenario (d): prefer-with-fallback-continues.
 *
 * After cleanup with routing_mode=prefer-with-fallback, routing falls back silently.
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
  if (!f) throw new Error(`Frame "${name}" not found in prefer-with-fallback-continues fixture`);
  return f;
}

export const FRAME_NAMES = [
  'discovery_started',
  'stale_detected_and_cleaned',
  'routing_fallback',
  'fresh_review_spawned',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

/** Asserts routing_mode is prefer-with-fallback in discovery frame. */
export function assertRoutingMode(): string | null {
  const frame = getFrame('discovery_started');
  if (frame.state['routing_mode'] !== 'prefer-with-fallback') {
    return `Expected routing_mode prefer-with-fallback, got "${frame.state['routing_mode']}"`;
  }
  return null;
}

/** Asserts fallback is silent: routing_decision fell-back-no-pool, no error shown. */
export function assertSilentFallback(): string | null {
  const frame = getFrame('routing_fallback');
  if (frame.state['routing_decision'] !== 'fell-back-no-pool') {
    return `Expected routing_decision "fell-back-no-pool", got "${frame.state['routing_decision']}"`;
  }
  if (frame.state['error_shown'] !== false) {
    return `Expected error_shown false for prefer-with-fallback mode`;
  }
  if (frame.state['silent'] !== true) {
    return `Expected silent true for prefer-with-fallback fallback`;
  }
  return null;
}

/** Asserts command proceeds with fresh spawn. */
export function assertFreshSpawnStarted(): string | null {
  const frame = getFrame('fresh_review_spawned');
  if (frame.state['result'] !== 'fresh_spawn_started') {
    return `Expected result "fresh_spawn_started", got "${frame.state['result']}"`;
  }
  return null;
}

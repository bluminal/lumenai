/**
 * Assertion helpers for scenario (e): explicit-pool-required-aborts.
 *
 * After cleanup with routing_mode=explicit-pool-required, command aborts with error.
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
  if (!f) throw new Error(`Frame "${name}" not found in explicit-pool-required-aborts fixture`);
  return f;
}

export const FRAME_NAMES = [
  'discovery_started',
  'stale_detected_and_cleaned',
  'routing_abort',
  'command_aborted',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

/** Asserts routing_mode is explicit-pool-required in discovery frame. */
export function assertRoutingMode(): string | null {
  const frame = getFrame('discovery_started');
  if (frame.state['routing_mode'] !== 'explicit-pool-required') {
    return `Expected routing_mode explicit-pool-required, got "${frame.state['routing_mode']}"`;
  }
  return null;
}

/** Asserts abort with error: routing_decision fell-back-no-pool, error shown. */
export function assertAbortWithError(): string | null {
  const frame = getFrame('routing_abort');
  if (frame.state['routing_decision'] !== 'fell-back-no-pool') {
    return `Expected routing_decision "fell-back-no-pool", got "${frame.state['routing_decision']}"`;
  }
  if (frame.state['abort'] !== true) {
    return `Expected abort true for explicit-pool-required mode`;
  }
  if (frame.state['error_shown'] !== true) {
    return `Expected error_shown true for explicit-pool-required abort`;
  }
  const errorContains = frame.state['error_text_contains'] as string;
  if (!errorContains.includes('No standing pool matches')) {
    return `Expected error_text_contains to include "No standing pool matches"`;
  }
  return null;
}

/** Asserts command result is aborted. */
export function assertCommandAborted(): string | null {
  const frame = getFrame('command_aborted');
  if (frame.state['result'] !== 'aborted') {
    return `Expected result "aborted", got "${frame.state['result']}"`;
  }
  return null;
}

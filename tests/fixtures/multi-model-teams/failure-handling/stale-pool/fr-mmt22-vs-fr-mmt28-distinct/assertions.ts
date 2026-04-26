/**
 * Assertion helpers for scenario (f): fr-mmt22-vs-fr-mmt28-distinct.
 *
 * Asserts that FR-MMT22 and FR-MMT28 warning strings are strictly non-equal.
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
  if (!f) throw new Error(`Frame "${name}" not found in fr-mmt22-vs-fr-mmt28-distinct fixture`);
  return f;
}

export const FRAME_NAMES = [
  'fr_mmt22_warning',
  'fr_mmt28_warning',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

/** Returns the FR-MMT22 warning_text string. */
export function getMmt22WarningText(): string {
  const frame = getFrame('fr_mmt22_warning');
  return frame.state['warning_text'] as string;
}

/** Returns the FR-MMT28 warning_text string. */
export function getMmt28WarningText(): string {
  const frame = getFrame('fr_mmt28_warning');
  return frame.state['warning_text'] as string;
}

/** Asserts both warning texts are non-empty strings. */
export function assertBothWarningsAreStrings(): string | null {
  const mmt22 = getMmt22WarningText();
  const mmt28 = getMmt28WarningText();
  if (typeof mmt22 !== 'string' || mmt22.length === 0) {
    return `FR-MMT22 warning_text is not a non-empty string`;
  }
  if (typeof mmt28 !== 'string' || mmt28.length === 0) {
    return `FR-MMT28 warning_text is not a non-empty string`;
  }
  return null;
}

/** Asserts FR-MMT22 and FR-MMT28 warning texts are strictly non-equal. */
export function assertWarningsAreDistinct(): string | null {
  const mmt22 = getMmt22WarningText();
  const mmt28 = getMmt28WarningText();
  if (mmt22 === mmt28) {
    return `FR-MMT22 and FR-MMT28 warning texts must be distinct, but both are: "${mmt22}"`;
  }
  return null;
}

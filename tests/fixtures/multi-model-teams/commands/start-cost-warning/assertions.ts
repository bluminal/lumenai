import fixtureFrames from './fixture.json' assert { type: 'json' };

export interface CommandFixtureFrame {
  frame: string;
  description: string;
  event: string;
  state: Record<string, unknown>;
  assertion: string;
}

export const frames = fixtureFrames as CommandFixtureFrame[];

export const FRAME_NAMES = [
  'command_invoked',
  'cost_warning_shown',
  'user_accepted',
  'confirmation_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in start-cost-warning fixture`);
  return f;
}

export function assertAdvisoryTextVerbatim(): string | null {
  const frame = getFrame('cost_warning_shown');
  const advisoryText = frame.state['advisory_text'] as string;
  if (!advisoryText) return 'cost_warning_shown frame missing advisory_text';

  const required = ['Heads up: this pool will keep', 'idle for up to', 'minutes', 'Continue?'];
  for (const fragment of required) {
    if (!advisoryText.includes(fragment)) {
      return `advisory_text missing fragment: "${fragment}"`;
    }
  }
  return null;
}

export function assertCostWarningRecordedInConfirmation(): string | null {
  const frame = getFrame('confirmation_shown');
  if (frame.state['cost_warning_shown'] !== true) {
    return `Expected cost_warning_shown true in confirmation, got ${JSON.stringify(frame.state['cost_warning_shown'])}`;
  }
  return null;
}

export function assertFourReviewerRoster(): string | null {
  const frame = getFrame('command_invoked');
  const params = frame.state['params'] as Record<string, unknown>;
  const reviewers = params['reviewers'] as unknown[];
  if (!Array.isArray(reviewers) || reviewers.length !== 4) {
    return `Expected 4 reviewers, got ${JSON.stringify(reviewers)}`;
  }
  return null;
}

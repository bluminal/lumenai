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
  'output_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in list-empty fixture`);
  return f;
}

export function assertStandingPoolsIsEmptyArray(): string | null {
  const frame = getFrame('output_shown');
  const standingPools = frame.state['standing_pools'];
  if (!Array.isArray(standingPools)) {
    return `Expected standing_pools to be an array, got ${typeof standingPools}`;
  }
  if (standingPools.length !== 0) {
    return `Expected standing_pools to be empty, got ${standingPools.length} entries`;
  }
  return null;
}

export function assertEmptyMessageContainsStartHint(): string | null {
  const frame = getFrame('output_shown');
  const emptyMessage = frame.state['empty_message'] as string;
  if (!emptyMessage || typeof emptyMessage !== 'string') {
    return 'empty_message is missing or not a string';
  }
  if (emptyMessage.trim().length === 0) {
    return 'empty_message is an empty string';
  }
  const lowerMsg = emptyMessage.toLowerCase();
  if (!lowerMsg.includes('start') && !lowerMsg.includes('create')) {
    return `empty_message should contain "start" or "create" hint. Got: "${emptyMessage}"`;
  }
  return null;
}

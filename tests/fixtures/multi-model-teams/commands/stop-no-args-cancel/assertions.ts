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
  'table_displayed',
  'user_prompted',
  'aborted_cleanly',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in stop-no-args-cancel fixture`);
  return f;
}

export function assertCancelledWithNoSideEffects(): string | null {
  const frame = getFrame('aborted_cleanly');
  const errors: string[] = [];

  if (frame.state['index_changed'] !== false) {
    errors.push(`Expected index_changed false, got ${JSON.stringify(frame.state['index_changed'])}`);
  }
  if (frame.state['shutdown_sent'] !== false) {
    errors.push(`Expected shutdown_sent false, got ${JSON.stringify(frame.state['shutdown_sent'])}`);
  }
  return errors.length > 0 ? errors.join('; ') : null;
}

export function assertCancelledResult(): string | null {
  const frame = getFrame('aborted_cleanly');
  if (frame.state['result'] !== 'cancelled') {
    return `Expected result "cancelled", got "${frame.state['result']}"`;
  }
  return null;
}

export function assertUserRespondedCancel(): string | null {
  const frame = getFrame('user_prompted');
  if (frame.state['user_response'] !== 'cancel') {
    return `Expected user_response "cancel", got "${frame.state['user_response']}"`;
  }
  return null;
}

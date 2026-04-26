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
  'inflight_check',
  'shutdown_sent',
  'confirmation_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in stop-with-inflight fixture`);
  return f;
}

export function assertForceSkipsWarning(): string | null {
  const frame = getFrame('inflight_check');
  if (frame.state['warning_shown'] !== false) {
    return `Expected warning_shown false (force=true suppresses it), got ${JSON.stringify(frame.state['warning_shown'])}`;
  }
  return null;
}

export function assertShutdownMessageSent(): string | null {
  const frame = getFrame('shutdown_sent');
  const messageType = frame.state['message_type'];
  if (messageType !== 'shutdown') {
    return `Expected message_type "shutdown", got "${messageType}"`;
  }
  return null;
}

export function assertForceStoppedResult(): string | null {
  const frame = getFrame('confirmation_shown');
  const result = frame.state['result'];
  if (result !== 'force_stopped') {
    return `Expected result "force_stopped", got "${result}"`;
  }
  return null;
}

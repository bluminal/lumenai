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
  'shutdown_sent',
  'confirmation_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in stop-no-args-interactive fixture`);
  return f;
}

export function assertTableShownBeforePrompt(): string | null {
  const tableFrame = getFrame('table_displayed');
  if (tableFrame.state['table_shown'] !== true) {
    return `Expected table_shown true, got ${JSON.stringify(tableFrame.state['table_shown'])}`;
  }
  if (tableFrame.state['prompt_shown_yet'] !== false) {
    return `Expected prompt_shown_yet false (table precedes prompt), got ${JSON.stringify(tableFrame.state['prompt_shown_yet'])}`;
  }
  return null;
}

export function assertVerbatimPromptText(): string | null {
  const frame = getFrame('user_prompted');
  const promptText = frame.state['prompt_text'] as string;
  const expected = "Which pool would you like to stop? Enter pool name or 'cancel' to abort:";
  if (promptText !== expected) {
    return `prompt_text mismatch. Expected: "${expected}". Got: "${promptText}"`;
  }
  return null;
}

export function assertPrePromptTableShownInConfirmation(): string | null {
  const frame = getFrame('confirmation_shown');
  if (frame.state['pre_prompt_table_shown'] !== true) {
    return `Expected pre_prompt_table_shown true, got ${JSON.stringify(frame.state['pre_prompt_table_shown'])}`;
  }
  return null;
}

export function assertCleanStopResult(): string | null {
  const frame = getFrame('confirmation_shown');
  if (frame.state['result'] !== 'stopped_cleanly') {
    return `Expected result "stopped_cleanly", got "${frame.state['result']}"`;
  }
  return null;
}

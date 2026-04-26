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
  'validation_failed',
  'aborted_no_fs_write',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in start-invalid-name fixture`);
  return f;
}

export function assertVerbatimErrorMessage(): string | null {
  const frame = getFrame('validation_failed');
  const errorMessage = frame.state['error_message'] as string;
  if (!errorMessage) return 'validation_failed frame missing error_message';

  const required = ["Pool name '", 'is invalid', 'Names must be 1–48'];
  for (const fragment of required) {
    if (!errorMessage.includes(fragment)) {
      return `error_message missing fragment: "${fragment}"`;
    }
  }
  return null;
}

export function assertNoFilesystemWrites(): string | null {
  const frame = getFrame('aborted_no_fs_write');
  const errors: string[] = [];

  if (frame.state['config_json_written'] !== false) {
    errors.push(`Expected config_json_written false, got ${JSON.stringify(frame.state['config_json_written'])}`);
  }
  if (frame.state['index_updated'] !== false) {
    errors.push(`Expected index_updated false, got ${JSON.stringify(frame.state['index_updated'])}`);
  }
  if (frame.state['lock_acquired'] !== false) {
    errors.push(`Expected lock_acquired false, got ${JSON.stringify(frame.state['lock_acquired'])}`);
  }
  return errors.length > 0 ? errors.join('; ') : null;
}

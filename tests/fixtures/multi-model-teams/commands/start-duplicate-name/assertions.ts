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
  'pre_flight_failed',
  'aborted_duplicate',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in start-duplicate-name fixture`);
  return f;
}

export function assertRemediationHintPresent(): string | null {
  const frame = getFrame('aborted_duplicate');
  const errorMessage = frame.state['error_message'] as string;
  if (!errorMessage) return 'aborted_duplicate frame missing error_message';

  const hasListTeams = errorMessage.includes('/list-teams');
  const hasStopReviewTeam = errorMessage.includes('/stop-review-team');
  if (!hasListTeams && !hasStopReviewTeam) {
    return `error_message must reference "/list-teams" or "/stop-review-team" as remediation hint. Got: "${errorMessage}"`;
  }
  return null;
}

export function assertConflictDetected(): string | null {
  const frame = getFrame('pre_flight_failed');
  if (frame.state['conflict_detected'] !== true) {
    return `Expected conflict_detected true, got ${JSON.stringify(frame.state['conflict_detected'])}`;
  }
  return null;
}

export function assertNoFilesystemWrites(): string | null {
  const frame = getFrame('aborted_duplicate');
  const errors: string[] = [];

  if (frame.state['config_json_written'] !== false) {
    errors.push(`Expected config_json_written false, got ${JSON.stringify(frame.state['config_json_written'])}`);
  }
  if (frame.state['index_updated'] !== false) {
    errors.push(`Expected index_updated false, got ${JSON.stringify(frame.state['index_updated'])}`);
  }
  return errors.length > 0 ? errors.join('; ') : null;
}

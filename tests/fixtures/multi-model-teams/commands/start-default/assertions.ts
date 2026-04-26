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
  'validation_passed',
  'lock_acquired',
  'metadata_written',
  'confirmation_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in start-default fixture`);
  return f;
}

export function assertPoolStateIdle(): string | null {
  const frame = getFrame('metadata_written');
  const configJson = frame.state['config_json'] as Record<string, unknown>;
  if (!configJson) return 'metadata_written frame missing config_json';
  const state = configJson['pool_state'];
  if (state !== 'idle') return `Expected pool_state "idle", got "${state}"`;
  return null;
}

export function assertPoolLeadHasIdentityConfirmOverlay(): string | null {
  const frame = getFrame('metadata_written');
  const spawnPrompts = frame.state['spawn_prompts'] as Record<string, string>;
  if (!spawnPrompts) return 'metadata_written frame missing spawn_prompts';
  const poolLeadPrompt = spawnPrompts['pool_lead'];
  if (!poolLeadPrompt) return 'spawn_prompts missing pool_lead';
  if (!poolLeadPrompt.includes('### Standing Pool Identity Confirm Overlay')) {
    return 'Pool Lead spawn prompt does not contain "### Standing Pool Identity Confirm Overlay" verbatim';
  }
  return null;
}

export function assertNoCostWarning(): string | null {
  const frame = getFrame('confirmation_shown');
  const costWarning = frame.state['cost_warning_shown'];
  if (costWarning !== false) return `Expected cost_warning_shown to be false, got ${JSON.stringify(costWarning)}`;
  return null;
}

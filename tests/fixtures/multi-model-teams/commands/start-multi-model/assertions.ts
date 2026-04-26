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
  'preflight_warning',
  'lock_acquired',
  'metadata_written',
  'spawn_prompts_composed',
  'confirmation_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in start-multi-model fixture`);
  return f;
}

export function assertPoolLeadHasAllThreeOverlays(): string | null {
  const frame = getFrame('spawn_prompts_composed');
  const prompt = frame.state['pool_lead_prompt'] as string;
  if (!prompt) return 'spawn_prompts_composed frame missing pool_lead_prompt';

  const required = [
    '### Standing Pool Identity Confirm Overlay',
    '### Multi-Model Conditional Overlay',
    '### Standing Pool Lifecycle Overlay',
  ];
  for (const overlay of required) {
    if (!prompt.includes(overlay)) {
      return `Pool Lead prompt missing overlay: "${overlay}"`;
    }
  }
  return null;
}

export function assertReviewerHasIdentityAndMultiModelButNotLifecycle(): string | null {
  const frame = getFrame('spawn_prompts_composed');
  const reviewerPrompts = frame.state['reviewer_prompts'] as Record<string, string>;
  if (!reviewerPrompts) return 'spawn_prompts_composed frame missing reviewer_prompts';

  const errors: string[] = [];
  for (const [reviewerName, prompt] of Object.entries(reviewerPrompts)) {
    if (!prompt.includes('### Standing Pool Identity Confirm Overlay')) {
      errors.push(`Reviewer "${reviewerName}" missing "### Standing Pool Identity Confirm Overlay"`);
    }
    if (!prompt.includes('### Multi-Model Conditional Overlay')) {
      errors.push(`Reviewer "${reviewerName}" missing "### Multi-Model Conditional Overlay"`);
    }
    if (prompt.includes('### Standing Pool Lifecycle Overlay')) {
      errors.push(`Reviewer "${reviewerName}" should NOT contain "### Standing Pool Lifecycle Overlay"`);
    }
  }
  return errors.length > 0 ? errors.join('; ') : null;
}

export function assertMultiModelTrueInConfig(): string | null {
  const frame = getFrame('metadata_written');
  const configJson = frame.state['config_json'] as Record<string, unknown>;
  if (!configJson) return 'metadata_written frame missing config_json';
  if (configJson['multi_model'] !== true) {
    return `Expected multi_model true in config_json, got ${JSON.stringify(configJson['multi_model'])}`;
  }
  return null;
}

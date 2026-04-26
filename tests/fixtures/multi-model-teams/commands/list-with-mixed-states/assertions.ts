import fixtureFrames from './fixture.json' assert { type: 'json' };

export interface CommandFixtureFrame {
  frame: string;
  description: string;
  event: string;
  state: Record<string, unknown>;
  assertion: string;
}

export interface PoolEntry {
  name: string;
  pool_state: string;
  last_active_at: string;
  ttl_remaining_minutes: number;
}

export const frames = fixtureFrames as CommandFixtureFrame[];

export const FRAME_NAMES = [
  'command_invoked',
  'output_shown',
] as const;

export type FrameName = typeof FRAME_NAMES[number];

export function getFrame(name: string): CommandFixtureFrame {
  const f = frames.find((fr) => fr.frame === name);
  if (!f) throw new Error(`Frame "${name}" not found in list-with-mixed-states fixture`);
  return f;
}

export function assertFourStandingPools(): string | null {
  const frame = getFrame('output_shown');
  const standingPools = frame.state['standing_pools'] as PoolEntry[];
  if (!Array.isArray(standingPools)) {
    return `Expected standing_pools to be an array, got ${typeof standingPools}`;
  }
  if (standingPools.length !== 4) {
    return `Expected exactly 4 standing pools, got ${standingPools.length}`;
  }
  return null;
}

export function assertAllFourStatesRepresented(): string | null {
  const frame = getFrame('output_shown');
  const standingPools = frame.state['standing_pools'] as PoolEntry[];
  if (!Array.isArray(standingPools)) return `standing_pools is not an array`;

  const actual = [...standingPools.map((p) => p.pool_state)].sort();
  const expected = ['active', 'draining', 'idle', 'stopping'];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return `Expected pool states ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

export function assertTerminalStatesHaveZeroTtl(): string | null {
  const frame = getFrame('output_shown');
  const standingPools = frame.state['standing_pools'] as PoolEntry[];
  if (!Array.isArray(standingPools)) return `standing_pools is not an array`;

  const terminalStates = ['draining', 'stopping'];
  const errors: string[] = [];
  for (const pool of standingPools) {
    if (terminalStates.includes(pool.pool_state) && pool.ttl_remaining_minutes !== 0) {
      errors.push(`Pool "${pool.name}" has state "${pool.pool_state}" but ttl_remaining_minutes is ${pool.ttl_remaining_minutes} (expected 0)`);
    }
  }
  return errors.length > 0 ? errors.join('; ') : null;
}

export function assertOneNonStandingTeam(): string | null {
  const frame = getFrame('output_shown');
  const nonStandingTeams = frame.state['non_standing_teams'] as unknown[];
  if (!Array.isArray(nonStandingTeams)) {
    return `Expected non_standing_teams to be an array, got ${typeof nonStandingTeams}`;
  }
  if (nonStandingTeams.length !== 1) {
    return `Expected exactly 1 non-standing team, got ${nonStandingTeams.length}`;
  }
  return null;
}

/**
 * Layer 1: Schema validation tests for the list-teams command output.
 *
 * Tests the validateListTeamsOutput validator against inline sample objects.
 */

import { describe, it, expect } from 'vitest';
import { validateListTeamsOutput, POOL_STATE_VALUES } from './list-teams-output';

// ── Inline samples ────────────────────────────────────────────────

const VALID_STANDING_POOL = {
  name: 'review-pool-a',
  pool_state: 'idle',
  reviewers: ['code-reviewer', 'security-reviewer'],
  multi_model: true,
  tasks: { pending: 0, in_progress: 0, completed: 5 },
  idle_minutes: 10,
  ttl_remaining_minutes: 50,
};

const VALID_NON_STANDING_TEAM = {
  name: 'ad-hoc-team-1',
  reviewers: ['architect'],
  tasks: { pending: 1, in_progress: 0, completed: 2 },
  started_minutes_ago: 15,
};

const EMPTY_OUTPUT = {
  standing_pools: [],
  non_standing_teams: [],
};

// ── [T1] Empty-output case ────────────────────────────────────────

describe('[T1] Empty output (both arrays empty)', () => {
  it('accepts empty output as valid', () => {
    const result = validateListTeamsOutput(EMPTY_OUTPUT);
    expect(result.valid, result.errors.join('; ')).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── [T2] Valid mixed output ───────────────────────────────────────

describe('[T2] Valid mixed output', () => {
  it('accepts output with both arrays non-empty', () => {
    const result = validateListTeamsOutput({
      standing_pools: [VALID_STANDING_POOL],
      non_standing_teams: [VALID_NON_STANDING_TEAM],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('accepts output with only standing pools', () => {
    const result = validateListTeamsOutput({
      standing_pools: [VALID_STANDING_POOL],
      non_standing_teams: [],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('accepts output with only non-standing teams', () => {
    const result = validateListTeamsOutput({
      standing_pools: [],
      non_standing_teams: [VALID_NON_STANDING_TEAM],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T3] All four pool_state values accepted ──────────────────────

describe('[T3] Standing pool: all four pool_state values', () => {
  for (const state of POOL_STATE_VALUES) {
    it(`accepts pool_state: "${state}"`, () => {
      const result = validateListTeamsOutput({
        standing_pools: [{ ...VALID_STANDING_POOL, pool_state: state }],
        non_standing_teams: [],
      });
      expect(result.valid, result.errors.join('; ')).toBe(true);
    });
  }

  it('POOL_STATE_VALUES contains idle, active, draining, stopping', () => {
    expect(POOL_STATE_VALUES).toEqual(['idle', 'active', 'draining', 'stopping']);
  });
});

// ── [T4] Invalid pool_state ───────────────────────────────────────

describe('[T4] Invalid pool_state in standing pool', () => {
  it('rejects unknown pool_state string', () => {
    const result = validateListTeamsOutput({
      standing_pools: [{ ...VALID_STANDING_POOL, pool_state: 'paused' }],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pool_state'))).toBe(true);
  });
});

// ── [T5] ttl_remaining_minutes constraints ────────────────────────

describe('[T5] ttl_remaining_minutes constraints', () => {
  it('rejects negative ttl_remaining_minutes', () => {
    const result = validateListTeamsOutput({
      standing_pools: [{ ...VALID_STANDING_POOL, ttl_remaining_minutes: -1 }],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ttl_remaining_minutes'))).toBe(true);
  });

  it('rejects ttl_remaining_minutes as string "48 min"', () => {
    const result = validateListTeamsOutput({
      standing_pools: [{ ...VALID_STANDING_POOL, ttl_remaining_minutes: '48 min' }],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ttl_remaining_minutes'))).toBe(true);
  });

  it('accepts ttl_remaining_minutes of 0 (expired/draining/stopping)', () => {
    const result = validateListTeamsOutput({
      standing_pools: [{ ...VALID_STANDING_POOL, ttl_remaining_minutes: 0 }],
      non_standing_teams: [],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T6] Missing required fields in StandingPoolEntry ────────────

describe('[T6] Missing required fields in StandingPoolEntry', () => {
  const REQUIRED_POOL_FIELDS = [
    'name',
    'pool_state',
    'reviewers',
    'multi_model',
    'tasks',
    'idle_minutes',
    'ttl_remaining_minutes',
  ] as const;

  for (const field of REQUIRED_POOL_FIELDS) {
    it(`rejects standing pool entry missing field: "${field}"`, () => {
      const pool = { ...VALID_STANDING_POOL };
      delete (pool as Record<string, unknown>)[field];
      const result = validateListTeamsOutput({
        standing_pools: [pool],
        non_standing_teams: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(field))).toBe(true);
    });
  }
});

// ── [T7] tasks object constraints ────────────────────────────────

describe('[T7] tasks object constraints', () => {
  it('rejects missing tasks object in StandingPoolEntry', () => {
    const pool = { ...VALID_STANDING_POOL };
    delete (pool as Record<string, unknown>)['tasks'];
    const result = validateListTeamsOutput({
      standing_pools: [pool],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('tasks'))).toBe(true);
  });

  it('rejects negative task counter', () => {
    const result = validateListTeamsOutput({
      standing_pools: [
        {
          ...VALID_STANDING_POOL,
          tasks: { pending: -1, in_progress: 0, completed: 0 },
        },
      ],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing task counter (in_progress)', () => {
    const result = validateListTeamsOutput({
      standing_pools: [
        {
          ...VALID_STANDING_POOL,
          tasks: { pending: 0, completed: 0 },
        },
      ],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts tasks with all zeros', () => {
    const result = validateListTeamsOutput({
      standing_pools: [
        {
          ...VALID_STANDING_POOL,
          tasks: { pending: 0, in_progress: 0, completed: 0 },
        },
      ],
      non_standing_teams: [],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});

// ── [T8] reviewers constraints ────────────────────────────────────

describe('[T8] reviewers array constraints', () => {
  it('rejects empty reviewers in StandingPoolEntry', () => {
    const result = validateListTeamsOutput({
      standing_pools: [{ ...VALID_STANDING_POOL, reviewers: [] }],
      non_standing_teams: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reviewers'))).toBe(true);
  });

  it('rejects empty reviewers in NonStandingTeamEntry', () => {
    const result = validateListTeamsOutput({
      standing_pools: [],
      non_standing_teams: [{ ...VALID_NON_STANDING_TEAM, reviewers: [] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reviewers'))).toBe(true);
  });
});

// ── [T9] Missing top-level fields ────────────────────────────────

describe('[T9] Missing top-level required fields', () => {
  it('rejects missing standing_pools', () => {
    const result = validateListTeamsOutput({ non_standing_teams: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('standing_pools'))).toBe(true);
  });

  it('rejects missing non_standing_teams', () => {
    const result = validateListTeamsOutput({ standing_pools: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non_standing_teams'))).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = validateListTeamsOutput(null);
    expect(result.valid).toBe(false);
  });
});

// ── [T10] Multiple standing pools ────────────────────────────────

describe('[T10] Multiple entries in arrays', () => {
  it('accepts multiple standing pools with different states', () => {
    const result = validateListTeamsOutput({
      standing_pools: [
        { ...VALID_STANDING_POOL, name: 'pool-a', pool_state: 'active' },
        { ...VALID_STANDING_POOL, name: 'pool-b', pool_state: 'draining', ttl_remaining_minutes: 0 },
        { ...VALID_STANDING_POOL, name: 'pool-c', pool_state: 'stopping', ttl_remaining_minutes: 0 },
      ],
      non_standing_teams: [
        { ...VALID_NON_STANDING_TEAM, name: 'team-x' },
        { ...VALID_NON_STANDING_TEAM, name: 'team-y', started_minutes_ago: 0 },
      ],
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });
});
